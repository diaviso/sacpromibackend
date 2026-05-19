import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TreasuryEntrySource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { paginate, PaginationDto } from '../common/dto/pagination.dto';
import { AccountsService } from '../accounts/accounts.service';

interface WriteEntryArgs {
  tx: Prisma.TransactionClient;
  accountId: string;
  entryDate: Date;
  amount: number; // signé
  source: TreasuryEntrySource;
  description?: string;
  userId: string;
  // refs polymorphiques
  supplierPaymentId?: string;
  customerPaymentId?: string;
  expenseId?: string;
  loanId?: string;
  loanPaymentId?: string;
  accountTransferId?: string;
  capitalMovementId?: string;
  fixedAssetId?: string;
}

interface CreateTransferInput {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  transferDate: string;
  fees?: number;
  description?: string;
}

@Injectable()
export class TreasuryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: AccountsService,
  ) {}

  /**
   * Écrit une entrée dans le grand livre de trésorerie.
   * Doit être appelé À L'INTÉRIEUR d'une transaction qui couvre aussi
   * la création de la source (paiement, dépense, etc.) — c'est la
   * garantie d'atomicité entre source et entrée.
   */
  async writeEntry(args: WriteEntryArgs) {
    return args.tx.treasuryEntry.create({
      data: {
        accountId: args.accountId,
        entryDate: args.entryDate,
        amount: args.amount,
        source: args.source,
        description: args.description,
        createdById: args.userId,
        supplierPaymentId: args.supplierPaymentId,
        customerPaymentId: args.customerPaymentId,
        expenseId: args.expenseId,
        loanId: args.loanId,
        loanPaymentId: args.loanPaymentId,
        accountTransferId: args.accountTransferId,
        capitalMovementId: args.capitalMovementId,
        fixedAssetId: args.fixedAssetId,
      },
    });
  }

  // ----- Transferts inter-comptes -----

  async createTransfer(dto: CreateTransferInput, userId: string) {
    if (dto.fromAccountId === dto.toAccountId) {
      throw new BadRequestException('Les comptes source et destination doivent être différents');
    }
    if (dto.amount <= 0) {
      throw new BadRequestException('Le montant doit être positif');
    }
    const fees = dto.fees ?? 0;
    if (fees < 0) throw new BadRequestException('Les frais ne peuvent pas être négatifs');

    return this.prisma.$transaction(async (tx) => {
      const [from, to] = await Promise.all([
        tx.account.findUnique({ where: { id: dto.fromAccountId } }),
        tx.account.findUnique({ where: { id: dto.toAccountId } }),
      ]);
      if (!from) throw new NotFoundException('Compte source introuvable');
      if (!to) throw new NotFoundException('Compte destination introuvable');
      if (!from.isActive || !to.isActive) {
        throw new BadRequestException('Un des comptes est désactivé');
      }

      const reference = await this.nextReference(tx, 'TRF');
      const transferDate = new Date(dto.transferDate);

      const transfer = await tx.accountTransfer.create({
        data: {
          reference,
          fromAccountId: dto.fromAccountId,
          toAccountId: dto.toAccountId,
          amount: dto.amount,
          fees,
          transferDate,
          description: dto.description,
          createdById: userId,
        },
      });

      // Débit compte source (montant + frais)
      await this.writeEntry({
        tx,
        accountId: from.id,
        entryDate: transferDate,
        amount: -(dto.amount + fees),
        source: TreasuryEntrySource.ACCOUNT_TRANSFER,
        description: `Transfert ${reference} vers ${to.name}${fees ? ` (frais ${fees})` : ''}`,
        accountTransferId: transfer.id,
        userId,
      });

      // Crédit compte destination (montant net, sans les frais qui sont perdus)
      await this.writeEntry({
        tx,
        accountId: to.id,
        entryDate: transferDate,
        amount: dto.amount,
        source: TreasuryEntrySource.ACCOUNT_TRANSFER,
        description: `Transfert ${reference} depuis ${from.name}`,
        accountTransferId: transfer.id,
        userId,
      });

      return transfer;
    });
  }

  async listTransfers(query: PaginationDto, filters: { accountId?: string; from?: string; to?: string }) {
    const where: Prisma.AccountTransferWhereInput = {};
    if (filters.accountId) {
      where.OR = [
        { fromAccountId: filters.accountId },
        { toAccountId: filters.accountId },
      ];
    }
    if (filters.from || filters.to) {
      where.transferDate = {};
      if (filters.from) where.transferDate.gte = new Date(filters.from);
      if (filters.to) where.transferDate.lte = new Date(filters.to);
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.accountTransfer.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: { transferDate: 'desc' },
        include: {
          fromAccount: { select: { id: true, name: true, type: true } },
          toAccount: { select: { id: true, name: true, type: true } },
          createdBy: { select: { id: true, fullName: true } },
        },
      }),
      this.prisma.accountTransfer.count({ where }),
    ]);

    return paginate(items, total, query.page, query.limit);
  }

  // ----- Grand livre (entries) -----

  async listEntries(
    query: PaginationDto,
    filters: { accountId?: string; source?: TreasuryEntrySource; from?: string; to?: string },
  ) {
    const where: Prisma.TreasuryEntryWhereInput = {};
    if (filters.accountId) where.accountId = filters.accountId;
    if (filters.source) where.source = filters.source;
    if (filters.from || filters.to) {
      where.entryDate = {};
      if (filters.from) where.entryDate.gte = new Date(filters.from);
      if (filters.to) where.entryDate.lte = new Date(filters.to);
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.treasuryEntry.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
        include: {
          account: { select: { id: true, name: true, type: true } },
          createdBy: { select: { id: true, fullName: true } },
        },
      }),
      this.prisma.treasuryEntry.count({ where }),
    ]);

    return paginate(items, total, query.page, query.limit);
  }

  // ----- Dashboard financier -----

  async getDashboard(filters: { from?: string; to?: string }) {
    const fromDate = filters.from ? new Date(filters.from) : undefined;
    const toDate = filters.to ? new Date(filters.to) : undefined;

    const accounts = await this.prisma.account.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
    const balances = await this.accounts.computeBalances(accounts.map((a) => a.id));

    const accountsWithBalance = accounts.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      bankName: a.bankName,
      currency: a.currency,
      currentBalance: balances.get(a.id) ?? 0,
    }));

    const totalCash = accountsWithBalance.reduce((sum, a) => sum + a.currentBalance, 0);

    // Encaissements / décaissements sur la période
    const dateRange: Prisma.DateTimeFilter | undefined =
      fromDate || toDate
        ? { ...(fromDate && { gte: fromDate }), ...(toDate && { lte: toDate }) }
        : undefined;

    const [inflowAgg, outflowAgg] = await Promise.all([
      this.prisma.treasuryEntry.aggregate({
        where: {
          amount: { gt: 0 },
          ...(dateRange && { entryDate: dateRange }),
        },
        _sum: { amount: true },
      }),
      this.prisma.treasuryEntry.aggregate({
        where: {
          amount: { lt: 0 },
          ...(dateRange && { entryDate: dateRange }),
        },
        _sum: { amount: true },
      }),
    ]);

    // Endettement total
    const activeLoans = await this.prisma.loan.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, lenderName: true, remainingPrincipal: true, reference: true },
    });
    const totalDebt = activeLoans.reduce((s, l) => s + l.remainingPrincipal, 0);

    // Valeur nette comptable des immobilisations en service
    const fixedAssets = await this.prisma.fixedAsset.findMany({
      where: { status: 'IN_SERVICE' },
      select: {
        id: true,
        name: true,
        category: true,
        acquisitionCost: true,
        depreciations: {
          orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
          take: 1,
          select: { netBookValue: true, accumulatedDepreciation: true },
        },
      },
    });
    let totalNetBookValue = 0;
    let totalAcquisitionCost = 0;
    let totalAccumulatedDepreciation = 0;
    fixedAssets.forEach((a) => {
      totalAcquisitionCost += a.acquisitionCost;
      const last = a.depreciations[0];
      if (last) {
        totalNetBookValue += last.netBookValue;
        totalAccumulatedDepreciation += last.accumulatedDepreciation;
      } else {
        totalNetBookValue += a.acquisitionCost;
      }
    });

    return {
      accounts: accountsWithBalance,
      totals: {
        cash: totalCash,
        debt: totalDebt,
        netBookValue: totalNetBookValue,
        netWorth: totalCash + totalNetBookValue - totalDebt,
      },
      flows: {
        inflows: inflowAgg._sum.amount ?? 0,
        outflows: outflowAgg._sum.amount ?? 0, // négatif
        net: (inflowAgg._sum.amount ?? 0) + (outflowAgg._sum.amount ?? 0),
      },
      loans: activeLoans,
      fixedAssetSummary: {
        count: fixedAssets.length,
        acquisitionCost: totalAcquisitionCost,
        accumulatedDepreciation: totalAccumulatedDepreciation,
        netBookValue: totalNetBookValue,
      },
    };
  }

  // ----- Helpers -----

  private async nextReference(tx: Prisma.TransactionClient, prefix: string) {
    const year = new Date().getFullYear();
    const counter = await tx.sequenceCounter.upsert({
      where: { prefix_year: { prefix, year } },
      update: { counter: { increment: 1 } },
      create: { prefix, year, counter: 1 },
    });
    return `${prefix}-${year}-${String(counter.counter).padStart(5, '0')}`;
  }
}
