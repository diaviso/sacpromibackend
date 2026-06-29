import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaymentStatus, Prisma, TreasuryEntrySource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSupplierPaymentDto } from './dto/create-supplier-payment.dto';
import { QuerySupplierPaymentsDto } from './dto/query-supplier-payments.dto';
import { paginate } from '../common/dto/pagination.dto';
import { TreasuryService } from '../treasury/treasury.service';

@Injectable()
export class SupplierPaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly treasury: TreasuryService,
  ) {}

  /**
   * Recalcule l'état de paiement d'une facture d'achat à partir de la SOURCE DE
   * VÉRITÉ (audit C1) :
   *   amountPaid       = Σ paiements
   *   amountRemaining  = totalAmount − Σ avoirs actifs − amountPaid
   *
   * Auparavant `create`/`remove` faisaient `totalAmount − amountPaid`, ce qui
   * EFFAÇAIT la réduction de dette opérée par les avoirs (dette fantôme).
   * `amountRemaining` peut devenir négatif (= crédit fournisseur), comportement
   * documenté dans le schéma.
   */
  private async recomputeInvoiceState(
    tx: Prisma.TransactionClient,
    invoiceId: string,
  ) {
    const invoice = await tx.purchaseInvoice.findUnique({
      where: { id: invoiceId },
      select: { totalAmount: true },
    });
    if (!invoice) return;
    const [paidAgg, creditAgg] = await Promise.all([
      tx.supplierPayment.aggregate({
        where: { purchaseInvoiceId: invoiceId },
        _sum: { amount: true },
      }),
      tx.supplierCreditNote.aggregate({
        where: { purchaseInvoiceId: invoiceId, deletedAt: null },
        _sum: { totalAmount: true },
      }),
    ]);
    const amountPaid = paidAgg._sum.amount ?? 0;
    const totalCredits = creditAgg._sum.totalAmount ?? 0;
    const amountRemaining = invoice.totalAmount - totalCredits - amountPaid;
    const paymentStatus: PaymentStatus =
      amountRemaining <= 0
        ? PaymentStatus.PAID
        : amountPaid > 0
          ? PaymentStatus.PARTIALLY_PAID
          : PaymentStatus.UNPAID;
    await tx.purchaseInvoice.update({
      where: { id: invoiceId },
      data: { amountPaid, amountRemaining, paymentStatus },
    });
  }

  async create(dto: CreateSupplierPaymentDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.purchaseInvoice.findUnique({
        where: { id: dto.purchaseInvoiceId },
        include: { supplier: { select: { id: true, name: true } } },
      });
      if (!invoice) {
        throw new NotFoundException("Facture d'achat introuvable");
      }
      if (invoice.paymentStatus === PaymentStatus.PAID) {
        throw new BadRequestException('Cette facture est déjà entièrement payée');
      }

      const remaining = invoice.amountRemaining;
      if (dto.amount > remaining) {
        throw new BadRequestException(
          `Le montant payé (${dto.amount} FCFA) dépasse le montant restant dû (${remaining} FCFA)`,
        );
      }

      // Validation du compte si fourni
      if (dto.accountId) {
        const account = await tx.account.findUnique({ where: { id: dto.accountId } });
        if (!account) throw new NotFoundException('Compte introuvable');
        if (!account.isActive) throw new BadRequestException('Le compte est désactivé');
      }

      const payment = await tx.supplierPayment.create({
        data: {
          purchaseInvoiceId: dto.purchaseInvoiceId,
          amount: dto.amount,
          paymentDate: new Date(dto.paymentDate),
          paymentMethod: dto.paymentMethod,
          accountId: dto.accountId,
          note: dto.note,
          createdById: userId,
        },
      });

      // Écriture trésorerie (débit) — uniquement si un compte est rattaché.
      if (dto.accountId) {
        await this.treasury.writeEntry({
          tx,
          accountId: dto.accountId,
          entryDate: new Date(dto.paymentDate),
          amount: -dto.amount,
          source: TreasuryEntrySource.SUPPLIER_PAYMENT,
          description: `Paiement fournisseur ${invoice.reference} (${invoice.supplier.name})`,
          supplierPaymentId: payment.id,
          userId,
        });
      }

      // Recalcul depuis la source de vérité (tient compte des avoirs).
      await this.recomputeInvoiceState(tx, invoice.id);

      return payment;
    });
  }

  async findAll(query: QuerySupplierPaymentsDto) {
    const where: Prisma.SupplierPaymentWhereInput = {};
    if (query.purchaseInvoiceId) where.purchaseInvoiceId = query.purchaseInvoiceId;
    if (query.paymentMethod) where.paymentMethod = query.paymentMethod;
    if (query.supplierId) {
      where.purchaseInvoice = { supplierId: query.supplierId };
    }
    if (query.from || query.to) {
      where.paymentDate = {};
      if (query.from) where.paymentDate.gte = new Date(query.from);
      if (query.to) where.paymentDate.lte = new Date(query.to);
    }

    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      where.OR = [
        { note: { contains: term, mode: 'insensitive' } },
        {
          purchaseInvoice: {
            OR: [
              { reference: { contains: term, mode: 'insensitive' } },
              { supplierInvoiceNumber: { contains: term, mode: 'insensitive' } },
              { supplier: { name: { contains: term, mode: 'insensitive' } } },
            ],
          },
        },
      ];
    }

    const sortBy = query.sortBy ?? 'paymentDate';
    const sortOrder = query.sortOrder ?? 'desc';
    const orderBy: Prisma.SupplierPaymentOrderByWithRelationInput = { [sortBy]: sortOrder };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.supplierPayment.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy,
        include: {
          purchaseInvoice: {
            select: {
              id: true,
              reference: true,
              supplierInvoiceNumber: true,
              supplier: { select: { id: true, name: true } },
            },
          },
          createdBy: { select: { id: true, fullName: true } },
        },
      }),
      this.prisma.supplierPayment.count({ where }),
    ]);

    return paginate(items, total, query.page, query.limit);
  }

  async findOne(id: string) {
    const payment = await this.prisma.supplierPayment.findUnique({
      where: { id },
      include: {
        purchaseInvoice: {
          select: {
            id: true,
            reference: true,
            supplierInvoiceNumber: true,
            totalAmount: true,
            amountPaid: true,
            amountRemaining: true,
            supplier: { select: { id: true, name: true } },
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
   * Annule (hard-delete) un paiement fournisseur.
   * - Réajuste `amountPaid`/`amountRemaining`/`paymentStatus` de la facture
   * - Supprime l'écriture de trésorerie liée (cascade via FK Prisma)
   */
  async remove(id: string) {
    const payment = await this.prisma.supplierPayment.findUnique({
      where: { id },
      include: { purchaseInvoice: true },
    });
    if (!payment) throw new NotFoundException('Paiement introuvable');

    return this.prisma.$transaction(async (tx) => {
      const invoiceId = payment.purchaseInvoiceId;

      // Les TreasuryEntry liées ont `onDelete: Cascade` sur supplierPaymentId
      // donc elles disparaissent à la suppression du paiement.
      await tx.supplierPayment.delete({ where: { id } });

      // Recalcul depuis la source de vérité APRÈS suppression (tient compte des
      // avoirs : on ne regonfle plus la dette à tort — audit C1).
      await this.recomputeInvoiceState(tx, invoiceId);

      return { message: 'Paiement supprimé — facture mise à jour' };
    });
  }
}
