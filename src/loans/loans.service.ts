import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  LoanScheduleItemStatus,
  LoanStatus,
  PaymentMethod,
  Prisma,
  TreasuryEntrySource,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { paginate, PaginationDto } from '../common/dto/pagination.dto';
import { TreasuryService } from '../treasury/treasury.service';

interface CreateLoanInput {
  lenderName: string;
  principalAmount: number;
  annualInterestRate: number; // ex: 0.085 = 8.5 %
  termMonths: number;
  startDate: string;
  firstPaymentDate: string;
  paymentDayOfMonth?: number;
  disbursementAccountId?: string;
  contractScanUrl?: string;
  note?: string;
}

interface CreateLoanPaymentInput {
  loanId: string;
  amount: number;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  accountId?: string;
  note?: string;
}

@Injectable()
export class LoansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly treasury: TreasuryService,
  ) {}

  async create(dto: CreateLoanInput, userId: string) {
    if (dto.principalAmount <= 0) {
      throw new BadRequestException('Capital invalide');
    }
    if (dto.termMonths <= 0 || dto.termMonths > 600) {
      throw new BadRequestException('Durée invalide (1 à 600 mois)');
    }
    if (dto.annualInterestRate < 0 || dto.annualInterestRate > 1) {
      throw new BadRequestException('Le taux annuel doit être exprimé en décimal (ex: 0.085 pour 8,5%)');
    }

    return this.prisma.$transaction(async (tx) => {
      const reference = await this.nextReference(tx);
      const startDate = new Date(dto.startDate);
      const firstPaymentDate = new Date(dto.firstPaymentDate);

      // Calcul de l'échéancier (mensualité constante = formule actuarielle)
      const schedule = computeAmortizationSchedule({
        principal: dto.principalAmount,
        annualRate: dto.annualInterestRate,
        termMonths: dto.termMonths,
        firstPaymentDate,
      });
      const totalToRepay = schedule.reduce((s, e) => s + e.totalDue, 0);
      const totalInterest = totalToRepay - dto.principalAmount;

      const loan = await tx.loan.create({
        data: {
          reference,
          lenderName: dto.lenderName,
          principalAmount: dto.principalAmount,
          annualInterestRate: new Prisma.Decimal(dto.annualInterestRate),
          termMonths: dto.termMonths,
          startDate,
          firstPaymentDate,
          paymentDayOfMonth: dto.paymentDayOfMonth ?? firstPaymentDate.getDate(),
          disbursementAccountId: dto.disbursementAccountId,
          totalToRepay,
          totalInterest,
          remainingPrincipal: dto.principalAmount,
          contractScanUrl: dto.contractScanUrl,
          note: dto.note,
          createdById: userId,
        },
      });

      // Crée les lignes d'échéancier
      await tx.loanScheduleItem.createMany({
        data: schedule.map((s, i) => ({
          loanId: loan.id,
          installmentNo: i + 1,
          dueDate: s.dueDate,
          principalDue: s.principalDue,
          interestDue: s.interestDue,
          totalDue: s.totalDue,
          remainingBalance: s.remainingBalance,
        })),
      });

      // Si compte de déboursement fourni → crédite le compte (entrée d'argent)
      if (dto.disbursementAccountId) {
        await this.treasury.writeEntry({
          tx,
          accountId: dto.disbursementAccountId,
          entryDate: startDate,
          amount: dto.principalAmount,
          source: TreasuryEntrySource.LOAN_DISBURSEMENT,
          description: `Déblocage prêt ${reference} (${dto.lenderName})`,
          loanId: loan.id,
          userId,
        });
      }

      return loan;
    });
  }

  async findAll(
    query: PaginationDto,
    filters: {
      status?: LoanStatus;
      search?: string;
      sortBy?: 'startDate' | 'principalAmount' | 'remainingPrincipal' | 'reference';
      sortOrder?: 'asc' | 'desc';
    },
  ) {
    const where: Prisma.LoanWhereInput = {};
    if (filters.status) where.status = filters.status;

    if (filters.search && filters.search.trim()) {
      const term = filters.search.trim();
      where.OR = [
        { reference: { contains: term, mode: 'insensitive' } },
        { lenderName: { contains: term, mode: 'insensitive' } },
        { note: { contains: term, mode: 'insensitive' } },
      ];
    }

    const sortBy = filters.sortBy ?? 'startDate';
    const sortOrder = filters.sortOrder ?? 'desc';
    const orderBy: Prisma.LoanOrderByWithRelationInput = { [sortBy]: sortOrder };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.loan.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy,
        include: {
          disbursementAccount: { select: { id: true, name: true } },
          _count: { select: { payments: true, schedule: true } },
        },
      }),
      this.prisma.loan.count({ where }),
    ]);

    return paginate(items, total, query.page, query.limit);
  }

  async findOne(id: string) {
    const loan = await this.prisma.loan.findUnique({
      where: { id },
      include: {
        disbursementAccount: true,
        schedule: { orderBy: { installmentNo: 'asc' } },
        payments: {
          orderBy: { paymentDate: 'desc' },
          include: { account: { select: { id: true, name: true } } },
        },
      },
    });
    if (!loan) throw new NotFoundException('Prêt introuvable');
    return loan;
  }

  /**
   * Modifie les champs cosmétiques d'un prêt — l'échéancier (capital,
   * taux, durée) n'est pas modifiable. Seul le prêteur, le scan du
   * contrat et la note peuvent l'être.
   */
  async update(
    id: string,
    dto: { lenderName?: string; contractScanUrl?: string; note?: string },
  ) {
    await this.findOne(id);
    const data: Record<string, string | null> = {};
    if (dto.lenderName !== undefined) data.lenderName = dto.lenderName;
    if (dto.contractScanUrl !== undefined) data.contractScanUrl = dto.contractScanUrl;
    if (dto.note !== undefined) data.note = dto.note;
    return this.prisma.loan.update({
      where: { id },
      data,
    });
  }

  async addPayment(dto: CreateLoanPaymentInput, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const loan = await tx.loan.findUnique({
        where: { id: dto.loanId },
        include: {
          schedule: {
            where: { status: { not: LoanScheduleItemStatus.PAID } },
            orderBy: { installmentNo: 'asc' },
          },
        },
      });
      if (!loan) throw new NotFoundException('Prêt introuvable');
      if (loan.status !== LoanStatus.ACTIVE) {
        throw new BadRequestException('Ce prêt n\'est plus actif');
      }
      if (dto.amount <= 0) throw new BadRequestException('Montant invalide');
      if (dto.amount > loan.remainingPrincipal + (loan.totalInterest - this.totalInterestPaid(loan))) {
        // pas bloquant, mais on pourrait warn
      }

      // Imputer le paiement aux échéances en attente, dans l'ordre, FIFO
      let remaining = dto.amount;
      let principalAcc = 0;
      let interestAcc = 0;
      const updates: Array<Promise<unknown>> = [];

      for (const item of loan.schedule) {
        if (remaining <= 0) break;
        const stillDue = item.totalDue - item.amountPaid;
        if (stillDue <= 0) continue;

        // On impute d'abord aux intérêts puis au capital de cette échéance
        // (convention bancaire courante)
        const interestRemaining = Math.max(0, item.interestDue - this.estimateInterestPaid(item));
        const principalRemaining = Math.max(0, item.principalDue - this.estimatePrincipalPaid(item));

        const takeInterest = Math.min(interestRemaining, remaining);
        remaining -= takeInterest;
        interestAcc += takeInterest;

        const takePrincipal = Math.min(principalRemaining, remaining);
        remaining -= takePrincipal;
        principalAcc += takePrincipal;

        const newAmountPaid = item.amountPaid + takeInterest + takePrincipal;
        const newStatus =
          newAmountPaid >= item.totalDue
            ? LoanScheduleItemStatus.PAID
            : LoanScheduleItemStatus.PARTIALLY_PAID;

        updates.push(
          tx.loanScheduleItem.update({
            where: { id: item.id },
            data: {
              amountPaid: newAmountPaid,
              status: newStatus,
              ...(newStatus === LoanScheduleItemStatus.PAID && { paidAt: new Date(dto.paymentDate) }),
            },
          }),
        );
      }
      await Promise.all(updates);

      // S'il reste de l'argent → on l'impute au capital (remboursement anticipé sur la dernière échéance)
      if (remaining > 0) {
        principalAcc += remaining;
        remaining = 0;
      }

      const payment = await tx.loanPayment.create({
        data: {
          loanId: loan.id,
          amount: dto.amount,
          principalPart: principalAcc,
          interestPart: interestAcc,
          paymentDate: new Date(dto.paymentDate),
          accountId: dto.accountId,
          paymentMethod: dto.paymentMethod,
          note: dto.note,
          createdById: userId,
        },
      });

      // Mise à jour du solde restant et du statut
      const newRemaining = Math.max(0, loan.remainingPrincipal - principalAcc);
      const newStatus = newRemaining === 0 ? LoanStatus.CLOSED : LoanStatus.ACTIVE;
      await tx.loan.update({
        where: { id: loan.id },
        data: { remainingPrincipal: newRemaining, status: newStatus },
      });

      // Écriture trésorerie (débit du compte)
      if (dto.accountId) {
        await this.treasury.writeEntry({
          tx,
          accountId: dto.accountId,
          entryDate: new Date(dto.paymentDate),
          amount: -dto.amount,
          source: TreasuryEntrySource.LOAN_PAYMENT,
          description: `Remboursement prêt ${loan.reference} (${loan.lenderName}) — capital ${principalAcc} + intérêts ${interestAcc}`,
          loanId: loan.id,
          loanPaymentId: payment.id,
          userId,
        });
      }

      return payment;
    });
  }

  async listPayments(query: PaginationDto, filters: { loanId?: string; from?: string; to?: string }) {
    const where: Prisma.LoanPaymentWhereInput = {};
    if (filters.loanId) where.loanId = filters.loanId;
    if (filters.from || filters.to) {
      where.paymentDate = {};
      if (filters.from) where.paymentDate.gte = new Date(filters.from);
      if (filters.to) where.paymentDate.lte = new Date(filters.to);
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.loanPayment.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: { paymentDate: 'desc' },
        include: {
          loan: { select: { id: true, reference: true, lenderName: true } },
          account: { select: { id: true, name: true } },
          createdBy: { select: { id: true, fullName: true } },
        },
      }),
      this.prisma.loanPayment.count({ where }),
    ]);
    return paginate(items, total, query.page, query.limit);
  }

  /**
   * Total intérêts déjà payés sur ce prêt (utilisé pour le P&L : charge financière)
   */
  async getTotalInterestPaidByMonth(year: number, month: number) {
    // Mois 1..12
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);
    const agg = await this.prisma.loanPayment.aggregate({
      where: { paymentDate: { gte: start, lt: end } },
      _sum: { interestPart: true },
    });
    return agg._sum.interestPart ?? 0;
  }

  // -------- helpers --------

  private async nextReference(tx: Prisma.TransactionClient) {
    const year = new Date().getFullYear();
    const counter = await tx.sequenceCounter.upsert({
      where: { prefix_year: { prefix: 'LOAN', year } },
      update: { counter: { increment: 1 } },
      create: { prefix: 'LOAN', year, counter: 1 },
    });
    return `LOAN-${year}-${String(counter.counter).padStart(5, '0')}`;
  }

  private totalInterestPaid(loan: { schedule: { interestDue: number; amountPaid: number; principalDue: number }[] }) {
    // estimation simple
    return loan.schedule.reduce(
      (s, it) => s + Math.min(it.amountPaid, it.interestDue),
      0,
    );
  }

  private estimateInterestPaid(item: { amountPaid: number; interestDue: number }) {
    return Math.min(item.amountPaid, item.interestDue);
  }

  private estimatePrincipalPaid(item: { amountPaid: number; interestDue: number; principalDue: number }) {
    return Math.max(0, item.amountPaid - item.interestDue);
  }
}

// =====================================================
// AMORTIZATION CALCULATION
// =====================================================

interface AmortizationArgs {
  principal: number;
  annualRate: number; // ex: 0.085
  termMonths: number;
  firstPaymentDate: Date;
}

interface AmortizationLine {
  dueDate: Date;
  principalDue: number;
  interestDue: number;
  totalDue: number;
  remainingBalance: number;
}

/**
 * Calcule un échéancier à mensualité constante (système français).
 * Formule : M = P * i / (1 - (1 + i)^-n)
 * où i = taux mensuel, n = nombre de mois.
 *
 * Si annualRate = 0 → mensualité = principal / n (pas d'intérêts).
 */
function computeAmortizationSchedule(args: AmortizationArgs): AmortizationLine[] {
  const { principal, annualRate, termMonths, firstPaymentDate } = args;
  const monthlyRate = annualRate / 12;

  let monthlyPayment: number;
  if (monthlyRate === 0) {
    monthlyPayment = principal / termMonths;
  } else {
    monthlyPayment = (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -termMonths));
  }

  const schedule: AmortizationLine[] = [];
  let remaining = principal;

  for (let i = 0; i < termMonths; i++) {
    const dueDate = new Date(firstPaymentDate);
    dueDate.setMonth(dueDate.getMonth() + i);

    const interestDue = Math.round(remaining * monthlyRate);
    let principalDue = Math.round(monthlyPayment - interestDue);

    // Dernière échéance : ajuster pour absorber les arrondis
    if (i === termMonths - 1) {
      principalDue = remaining;
    }

    const totalDue = principalDue + interestDue;
    remaining = Math.max(0, remaining - principalDue);

    schedule.push({
      dueDate,
      principalDue,
      interestDue,
      totalDue,
      remainingBalance: remaining,
    });
  }

  return schedule;
}
