import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CustomerPriceCategory,
  FinishedLotSource,
  FinishedStockMovementType,
  LotStatus,
  PaymentStatus,
  Prisma,
  SaleInvoiceType,
  SalePaymentMethod,
  StockReferenceType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../common/services/sequence.service';
import { FinishedStockService } from '../finished-stock/finished-stock.service';
import { CustomerOrdersService } from '../customer-orders/customer-orders.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { CreateCreditNoteDto } from './dto/create-credit-note.dto';
import { paginate, PaginationDto } from '../common/dto/pagination.dto';

@Injectable()
export class SalesService {
  private readonly logger = new Logger(SalesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: SequenceService,
    private readonly finishedStockService: FinishedStockService,
    private readonly customerOrdersService: CustomerOrdersService,
  ) {}

  async create(dto: CreateSaleDto, userId: string, options?: { overrideCreditLimit?: boolean }) {
    const customer = await this.prisma.customer.findUnique({ where: { id: dto.customerId } });
    if (!customer || !customer.isActive) {
      throw new BadRequestException('Client introuvable ou inactif');
    }

    const productIds = dto.items.map((it) => it.finishedProductId);
    const products = await this.prisma.finishedProduct.findMany({
      where: { id: { in: productIds } },
    });
    if (products.length !== new Set(productIds).size) {
      throw new BadRequestException('Une ou plusieurs produits finis introuvables');
    }

    // VALIDATION : refuser les produits désactivés ou en quantité <= 0
    const inactiveProducts = products.filter((p) => !p.isActive);
    if (inactiveProducts.length > 0) {
      throw new BadRequestException(
        `Vente impossible : produit(s) désactivé(s) — ${inactiveProducts.map((p) => p.name).join(', ')}`,
      );
    }
    for (const item of dto.items) {
      if (item.quantity <= 0) {
        throw new BadRequestException('Toutes les quantités doivent être strictement positives');
      }
    }

    // Calcul des montants
    const itemsResolved = dto.items.map((it) => {
      const product = products.find((p) => p.id === it.finishedProductId)!;
      const defaultPrice =
        customer.priceCategory === CustomerPriceCategory.WHOLESALE
          ? product.wholesalePrice
          : product.retailPrice;
      const unitPrice = it.unitPrice ?? defaultPrice;
      return {
        finishedProductId: it.finishedProductId,
        productName: product.name,
        quantity: it.quantity,
        unitPrice,
        lineAmount: Math.round(it.quantity * unitPrice),
      };
    });
    const totalAmount = itemsResolved.reduce((s, it) => s + it.lineAmount, 0);

    // VALIDATION : plafond crédit — blocage strict, sauf override explicite par directeur
    const warnings: string[] = [];
    if (dto.paymentMethod === SalePaymentMethod.CREDIT && customer.creditLimit > 0) {
      const currentDebt = await this.prisma.saleInvoice.aggregate({
        where: {
          customerId: dto.customerId,
          paymentStatus: { in: [PaymentStatus.UNPAID, PaymentStatus.PARTIALLY_PAID] },
        },
        _sum: { amountRemaining: true },
      });
      const currentBalance = currentDebt._sum.amountRemaining ?? 0;
      if (currentBalance + totalAmount > customer.creditLimit) {
        const msg =
          `Plafond crédit dépassé : créances actuelles ${currentBalance.toLocaleString('fr-FR')} ` +
          `+ cette vente ${totalAmount.toLocaleString('fr-FR')} > plafond ` +
          `${customer.creditLimit.toLocaleString('fr-FR')} FCFA`;
        if (options?.overrideCreditLimit) {
          // Bypass autorisé (directeur) : on log et on continue avec warning
          this.logger.warn(`Vente avec dépassement de crédit (override) — client ${customer.name} : ${msg}`);
          warnings.push(msg);
        } else {
          throw new BadRequestException(msg);
        }
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const invoiceDate = new Date(dto.invoiceDate);
      const prefix = dto.type === SaleInvoiceType.INVOICE ? 'FAC' : 'REC';
      const reference = await this.sequence.nextReference(prefix, invoiceDate.getFullYear(), tx);

      // VALIDATION ATOMIQUE : pré-check du stock DANS la transaction pour éviter
      // les race conditions entre 2 ventes concurrentes du même produit.
      // On agrège la quantité demandée par produit (au cas où plusieurs lignes
      // du même produit dans la même facture).
      const demandByProduct = new Map<string, number>();
      for (const item of itemsResolved) {
        demandByProduct.set(
          item.finishedProductId,
          (demandByProduct.get(item.finishedProductId) ?? 0) + item.quantity,
        );
      }
      for (const [productId, requestedQty] of demandByProduct.entries()) {
        const liveProduct = await tx.finishedProduct.findUnique({
          where: { id: productId },
          select: { name: true, currentStock: true, isActive: true, unit: true },
        });
        if (!liveProduct) {
          throw new BadRequestException(`Produit ${productId} introuvable`);
        }
        if (!liveProduct.isActive) {
          throw new BadRequestException(`Produit "${liveProduct.name}" désactivé`);
        }
        const available = Number(liveProduct.currentStock);
        if (available < requestedQty) {
          throw new BadRequestException(
            `Stock insuffisant pour "${liveProduct.name}" : ${available} ${liveProduct.unit.toLowerCase()} disponible(s), ${requestedQty} demandé(s)`,
          );
        }
      }

      // Statut paiement initial
      const isCredit = dto.paymentMethod === SalePaymentMethod.CREDIT;
      const paymentStatus = isCredit ? PaymentStatus.UNPAID : PaymentStatus.PAID;
      const amountPaid = isCredit ? 0 : totalAmount;
      const amountRemaining = isCredit ? totalAmount : 0;

      // Consommer le stock PF (FIFO) pour chaque ligne — récupère les lots utilisés
      const itemsWithLots: Array<typeof itemsResolved[0] & { lotId: string | null }> = [];
      for (const item of itemsResolved) {
        const result = await this.finishedStockService.consumeFinishedStock(tx, {
          finishedProductId: item.finishedProductId,
          quantity: item.quantity,
          movementType: FinishedStockMovementType.EXIT_SALE,
          referenceType: StockReferenceType.SALE_INVOICE,
          referenceId: '', // mis à jour après création de la facture
          userId,
        });
        // On prend le premier lot consommé pour la traçabilité (la consommation peut toucher plusieurs lots)
        const firstLotId = result.consumedLots.length > 0 ? result.consumedLots[0].lotId : null;
        itemsWithLots.push({ ...item, lotId: firstLotId });
      }

      const invoice = await tx.saleInvoice.create({
        data: {
          reference,
          type: dto.type,
          customerId: dto.customerId,
          customerOrderId: dto.customerOrderId,
          invoiceDate,
          totalAmount,
          paymentMethod: dto.paymentMethod,
          paymentStatus,
          amountPaid,
          amountRemaining,
          note: dto.note,
          createdById: userId,
          items: {
            create: itemsWithLots.map((it) => ({
              finishedProductId: it.finishedProductId,
              finishedLotId: it.lotId,
              productName: it.productName,
              quantity: it.quantity,
              unitPrice: it.unitPrice,
              lineAmount: it.lineAmount,
            })),
          },
        },
        include: {
          customer: { select: { id: true, name: true } },
          items: { include: { finishedProduct: { select: { id: true, code: true, name: true } } } },
        },
      });

      // Mettre à jour les références des mouvements de stock avec l'ID réel
      await tx.finishedStockMovement.updateMany({
        where: {
          referenceType: StockReferenceType.SALE_INVOICE,
          referenceId: '',
          createdById: userId,
        },
        data: { referenceId: invoice.id },
      });

      // Historique des prix
      for (const item of itemsResolved) {
        await tx.finishedProductPriceHistory.create({
          data: {
            finishedProductId: item.finishedProductId,
            customerId: dto.customerId,
            saleInvoiceId: invoice.id,
            unitPrice: item.unitPrice,
          },
        });
      }

      // MAJ commande client liée
      if (dto.customerOrderId) {
        await this.customerOrdersService.updateDeliveryFromSale(
          tx,
          dto.customerOrderId,
          itemsResolved.map((it) => ({ finishedProductId: it.finishedProductId, quantity: it.quantity })),
        );
      }

      return { invoice, warnings };
    });
  }

  async findAll(query: PaginationDto, filters: {
    type?: SaleInvoiceType;
    paymentStatus?: PaymentStatus;
    customerId?: string;
    paymentMethod?: SalePaymentMethod;
    from?: string;
    to?: string;
  }) {
    const where: Prisma.SaleInvoiceWhereInput = {};
    if (filters.type) where.type = filters.type;
    if (filters.paymentStatus) where.paymentStatus = filters.paymentStatus;
    if (filters.customerId) where.customerId = filters.customerId;
    if (filters.paymentMethod) where.paymentMethod = filters.paymentMethod;
    if (filters.from || filters.to) {
      where.invoiceDate = {};
      if (filters.from) where.invoiceDate.gte = new Date(filters.from);
      if (filters.to) where.invoiceDate.lte = new Date(filters.to);
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.saleInvoice.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: { invoiceDate: 'desc' },
        include: {
          customer: { select: { id: true, name: true } },
          _count: { select: { items: true, payments: true } },
        },
      }),
      this.prisma.saleInvoice.count({ where }),
    ]);
    return paginate(items, total, query.page, query.limit);
  }

  async findOne(id: string) {
    const invoice = await this.prisma.saleInvoice.findUnique({
      where: { id },
      include: {
        customer: true,
        customerOrder: { select: { id: true, reference: true, status: true } },
        items: {
          include: {
            finishedProduct: { select: { id: true, code: true, name: true, unit: true } },
            finishedLot: { select: { id: true, lotNumber: true } },
          },
        },
        payments: { orderBy: { paymentDate: 'desc' } },
        creditNotes: { select: { id: true, reference: true, totalAmount: true, invoiceDate: true } },
        parentInvoice: { select: { id: true, reference: true } },
        createdBy: { select: { id: true, fullName: true } },
      },
    });
    if (!invoice) {
      throw new NotFoundException(`Facture ${id} introuvable`);
    }
    return invoice;
  }

  async createCreditNote(saleInvoiceId: string, dto: CreateCreditNoteDto, userId: string) {
    const original = await this.prisma.saleInvoice.findUnique({
      where: { id: saleInvoiceId },
      include: { items: true, customer: true },
    });
    if (!original) {
      throw new NotFoundException(`Facture ${saleInvoiceId} introuvable`);
    }

    // Vérifier que toutes les lignes existent dans la facture source
    const itemsToReturn = dto.items.map((dtoItem) => {
      const original_item = original.items.find((i) => i.id === dtoItem.saleItemId);
      if (!original_item) {
        throw new BadRequestException(`Ligne ${dtoItem.saleItemId} non trouvée dans la facture`);
      }
      if (Number(dtoItem.quantity) > Number(original_item.quantity)) {
        throw new BadRequestException(
          `Quantité retournée ${dtoItem.quantity} > quantité originale ${original_item.quantity}`,
        );
      }
      return { original_item, returnQty: dtoItem.quantity };
    });

    return this.prisma.$transaction(async (tx) => {
      const today = new Date();
      const reference = await this.sequence.nextReference('AVO', today.getFullYear(), tx);

      let totalAmount = 0;
      const lotsToCreate: Array<{
        finishedProductId: string;
        productName: string;
        quantity: number;
        unitPrice: number;
        lotId: string | null;
      }> = [];

      for (const { original_item, returnQty } of itemsToReturn) {
        const lineAmount = Math.round(returnQty * original_item.unitPrice);
        totalAmount += lineAmount;
        lotsToCreate.push({
          finishedProductId: original_item.finishedProductId,
          productName: original_item.productName,
          quantity: returnQty,
          unitPrice: original_item.unitPrice,
          lotId: original_item.finishedLotId,
        });
      }

      // Créer la note de crédit (avoir)
      const creditNote = await tx.saleInvoice.create({
        data: {
          reference,
          type: original.type,
          customerId: original.customerId,
          parentInvoiceId: saleInvoiceId,
          invoiceDate: today,
          totalAmount: -totalAmount,
          paymentMethod: original.paymentMethod,
          paymentStatus: PaymentStatus.PAID,
          amountPaid: -totalAmount,
          amountRemaining: 0,
          note: `Avoir : ${dto.reason}`,
          createdById: userId,
          items: {
            create: lotsToCreate.map((item) => ({
              finishedProductId: item.finishedProductId,
              finishedLotId: item.lotId,
              productName: item.productName,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              lineAmount: -Math.round(item.quantity * item.unitPrice),
            })),
          },
        },
      });

      // Réintégrer le stock PF (création d'un lot d'avoir avec coût moyen actuel)
      for (const item of lotsToCreate) {
        const product = await tx.finishedProduct.findUnique({ where: { id: item.finishedProductId } });
        if (!product) continue;
        const lotNumber = `AVO-${creditNote.reference}-${item.finishedProductId.slice(0, 6)}`;
        await this.finishedStockService.createLot(tx, {
          finishedProductId: item.finishedProductId,
          lotNumber,
          source: FinishedLotSource.PRODUCTION,
          quantity: item.quantity,
          manufactureDate: today,
          unitCost: product.averageCost,
          movementType: FinishedStockMovementType.ADJUSTMENT,
          referenceType: StockReferenceType.SALE_INVOICE,
          referenceId: creditNote.id,
          userId,
        });
      }

      // Réduire le montant dû par le client (sur la facture originale)
      const newRemaining = Math.max(0, original.amountRemaining - totalAmount);
      const newAmountPaid = original.totalAmount - newRemaining;
      let newStatus = original.paymentStatus;
      if (newRemaining === 0) newStatus = PaymentStatus.PAID;
      else if (newAmountPaid > 0) newStatus = PaymentStatus.PARTIALLY_PAID;

      await tx.saleInvoice.update({
        where: { id: saleInvoiceId },
        data: {
          amountPaid: newAmountPaid,
          amountRemaining: newRemaining,
          paymentStatus: newStatus,
        },
      });

      return creditNote;
    });
  }
}
