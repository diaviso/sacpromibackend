import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PaymentStatus, Prisma, SalePaymentMethod, TreasuryEntrySource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { paginate, PaginationDto } from '../common/dto/pagination.dto';
import { TreasuryService } from '../treasury/treasury.service';

interface CreatePaymentInput {
  saleInvoiceId: string;
  amount: number;
  paymentDate: string;
  paymentMethod: SalePaymentMethod;
  accountId?: string;
  note?: string;
}

const PAYMENT_METHOD_LABELS: Record<SalePaymentMethod, string> = {
  CASH: 'Espèces',
  WAVE: 'Wave',
  ORANGE_MONEY: 'Orange Money',
  TRANSFER: 'Virement',
  CHECK: 'Chèque',
  CREDIT: 'Crédit',
};

@Injectable()
export class CustomerPaymentsService {
  private readonly logger = new Logger(CustomerPaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly treasury: TreasuryService,
  ) {}

  async create(dto: CreatePaymentInput, userId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const invoice = await tx.saleInvoice.findUnique({
        where: { id: dto.saleInvoiceId },
        include: { customer: { select: { id: true, name: true, email: true } } },
      });
      if (!invoice) throw new NotFoundException('Facture de vente introuvable');
      if (invoice.paymentStatus === PaymentStatus.PAID) {
        throw new BadRequestException('Facture déjà entièrement payée');
      }
      if (dto.amount > invoice.amountRemaining) {
        throw new BadRequestException(
          `Le montant ${dto.amount} dépasse le restant dû ${invoice.amountRemaining}`,
        );
      }

      // Si un compte est fourni, on vérifie qu'il existe et est actif
      if (dto.accountId) {
        const account = await tx.account.findUnique({ where: { id: dto.accountId } });
        if (!account) throw new NotFoundException('Compte introuvable');
        if (!account.isActive) throw new BadRequestException('Le compte est désactivé');
      }

      const payment = await tx.customerPayment.create({
        data: {
          saleInvoiceId: dto.saleInvoiceId,
          amount: dto.amount,
          paymentDate: new Date(dto.paymentDate),
          paymentMethod: dto.paymentMethod,
          accountId: dto.accountId,
          note: dto.note,
          createdById: userId,
        },
      });

      // Écriture trésorerie (crédit) — uniquement si un compte est rattaché.
      // Les paiements CREDIT (vente à crédit, non encore réglée) ne touchent pas la caisse.
      if (dto.accountId && dto.paymentMethod !== SalePaymentMethod.CREDIT) {
        await this.treasury.writeEntry({
          tx,
          accountId: dto.accountId,
          entryDate: new Date(dto.paymentDate),
          amount: dto.amount,
          source: TreasuryEntrySource.CUSTOMER_PAYMENT,
          description: `Encaissement client ${invoice.reference} (${invoice.customer.name})`,
          customerPaymentId: payment.id,
          userId,
        });
      }

      const newAmountPaid = invoice.amountPaid + dto.amount;
      const newAmountRemaining = invoice.totalAmount - newAmountPaid;
      const newStatus =
        newAmountRemaining <= 0
          ? PaymentStatus.PAID
          : newAmountPaid > 0
            ? PaymentStatus.PARTIALLY_PAID
            : PaymentStatus.UNPAID;

      await tx.saleInvoice.update({
        where: { id: invoice.id },
        data: {
          amountPaid: newAmountPaid,
          amountRemaining: Math.max(0, newAmountRemaining),
          paymentStatus: newStatus,
        },
      });

      return { payment, invoice, newAmountRemaining };
    });

    // Envoi email confirmation au client (hors transaction, non-bloquant)
    if (result.invoice.customer.email) {
      this.sendPaymentReceiptSafely({
        to: result.invoice.customer.email,
        customerName: result.invoice.customer.name,
        invoiceReference: result.invoice.reference,
        amount: dto.amount,
        paymentDate: new Date(dto.paymentDate),
        paymentMethod: PAYMENT_METHOD_LABELS[dto.paymentMethod] ?? dto.paymentMethod,
        amountRemaining: Math.max(0, result.newAmountRemaining),
        totalAmount: result.invoice.totalAmount,
      });
    }

    return result.payment;
  }

  private sendPaymentReceiptSafely(opts: {
    to: string;
    customerName: string;
    invoiceReference: string;
    amount: number;
    paymentDate: Date;
    paymentMethod: string;
    amountRemaining: number;
    totalAmount: number;
  }) {
    this.mail.sendPaymentReceipt(opts).catch((err) => {
      this.logger.warn(
        `Échec envoi confirmation paiement à ${opts.to} : ${(err as Error).message}`,
      );
    });
  }

  async findAll(query: PaginationDto, filters: {
    customerId?: string;
    saleInvoiceId?: string;
    paymentMethod?: SalePaymentMethod;
    from?: string;
    to?: string;
  }) {
    const where: Prisma.CustomerPaymentWhereInput = {};
    if (filters.saleInvoiceId) where.saleInvoiceId = filters.saleInvoiceId;
    if (filters.paymentMethod) where.paymentMethod = filters.paymentMethod;
    if (filters.customerId) where.saleInvoice = { customerId: filters.customerId };
    if (filters.from || filters.to) {
      where.paymentDate = {};
      if (filters.from) where.paymentDate.gte = new Date(filters.from);
      if (filters.to) where.paymentDate.lte = new Date(filters.to);
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.customerPayment.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: { paymentDate: 'desc' },
        include: {
          saleInvoice: {
            select: {
              id: true,
              reference: true,
              customer: { select: { id: true, name: true } },
            },
          },
          createdBy: { select: { id: true, fullName: true } },
        },
      }),
      this.prisma.customerPayment.count({ where }),
    ]);

    return paginate(items, total, query.page, query.limit);
  }

  async findOne(id: string) {
    const payment = await this.prisma.customerPayment.findUnique({
      where: { id },
      include: {
        saleInvoice: {
          select: {
            id: true,
            reference: true,
            totalAmount: true,
            amountPaid: true,
            amountRemaining: true,
            customer: { select: { id: true, name: true } },
          },
        },
        account: { select: { id: true, name: true } },
        createdBy: { select: { id: true, fullName: true } },
      },
    });
    if (!payment) throw new NotFoundException('Paiement introuvable');
    return payment;
  }

  /**
   * Annule (hard-delete) un paiement client.
   * - Réajuste amountPaid/amountRemaining/paymentStatus de la facture
   * - Supprime l'écriture de trésorerie liée (cascade FK)
   */
  async remove(id: string) {
    const payment = await this.prisma.customerPayment.findUnique({
      where: { id },
      include: { saleInvoice: true },
    });
    if (!payment) throw new NotFoundException('Paiement introuvable');

    return this.prisma.$transaction(async (tx) => {
      const invoice = payment.saleInvoice;
      const newAmountPaid = Math.max(0, invoice.amountPaid - payment.amount);
      const newAmountRemaining = invoice.totalAmount - newAmountPaid;
      const newStatus: PaymentStatus =
        newAmountPaid === 0
          ? PaymentStatus.UNPAID
          : newAmountRemaining <= 0
            ? PaymentStatus.PAID
            : PaymentStatus.PARTIALLY_PAID;

      await tx.saleInvoice.update({
        where: { id: invoice.id },
        data: {
          amountPaid: newAmountPaid,
          amountRemaining: Math.max(0, newAmountRemaining),
          paymentStatus: newStatus,
        },
      });

      await tx.customerPayment.delete({ where: { id } });
      return { message: 'Paiement supprimé — facture mise à jour' };
    });
  }
}
