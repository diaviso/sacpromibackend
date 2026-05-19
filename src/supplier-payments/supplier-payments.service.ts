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

      const newAmountPaid = invoice.amountPaid + dto.amount;
      const newAmountRemaining = invoice.totalAmount - newAmountPaid;
      const newStatus: PaymentStatus =
        newAmountRemaining <= 0
          ? PaymentStatus.PAID
          : newAmountPaid > 0
            ? PaymentStatus.PARTIALLY_PAID
            : PaymentStatus.UNPAID;

      await tx.purchaseInvoice.update({
        where: { id: invoice.id },
        data: {
          amountPaid: newAmountPaid,
          amountRemaining: Math.max(0, newAmountRemaining),
          paymentStatus: newStatus,
        },
      });

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

    const [items, total] = await this.prisma.$transaction([
      this.prisma.supplierPayment.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: { paymentDate: 'desc' },
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
}
