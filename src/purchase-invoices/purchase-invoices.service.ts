import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { LotStatus, Prisma, RawStockMovementType, StockReferenceType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../common/services/sequence.service';
import { PurchaseOrdersService } from '../purchase-orders/purchase-orders.service';
import { RawStockService } from '../raw-stock/raw-stock.service';
import { CreatePurchaseInvoiceDto } from './dto/create-purchase-invoice.dto';
import { QueryPurchaseInvoicesDto } from './dto/query-purchase-invoices.dto';
import { paginate } from '../common/dto/pagination.dto';

@Injectable()
export class PurchaseInvoicesService {
  private readonly logger = new Logger(PurchaseInvoicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: SequenceService,
    private readonly purchaseOrdersService: PurchaseOrdersService,
    private readonly rawStockService: RawStockService,
  ) {}

  async create(dto: CreatePurchaseInvoiceDto, userId: string) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id: dto.supplierId } });
    if (!supplier || !supplier.isActive) {
      throw new BadRequestException('Fournisseur introuvable ou inactif');
    }

    if (dto.purchaseOrderId) {
      const order = await this.prisma.purchaseOrder.findUnique({
        where: { id: dto.purchaseOrderId },
      });
      if (!order) {
        throw new BadRequestException('Bon de commande introuvable');
      }
      if (order.supplierId !== dto.supplierId) {
        throw new BadRequestException(
          "Le fournisseur de la facture ne correspond pas à celui du bon de commande",
        );
      }
    }

    // Vérifier que toutes les matières existent et sont actives
    const materialIds = Array.from(new Set(dto.items.map((it) => it.rawMaterialId)));
    const materials = await this.prisma.rawMaterial.findMany({
      where: { id: { in: materialIds } },
    });
    if (materials.length !== materialIds.length) {
      throw new BadRequestException(
        "Une ou plusieurs matières premières référencées sont introuvables",
      );
    }
    const inactive = materials.filter((m) => !m.isActive);
    if (inactive.length > 0) {
      throw new BadRequestException(
        `Matières inactives : ${inactive.map((m) => m.name).join(', ')}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.purchaseOrderId) {
        await this.purchaseOrdersService.assertInvoiceMatchesOrder(
          tx,
          dto.purchaseOrderId,
          dto.supplierId,
          dto.items.map((it) => ({ rawMaterialId: it.rawMaterialId, quantity: it.quantity })),
        );
      }

      const invoiceDate = new Date(dto.invoiceDate);
      const receptionDate = new Date(dto.receptionDate);
      const reference = await this.sequence.nextReference('FA', invoiceDate.getFullYear(), tx);

      const totalAmount = dto.items.reduce(
        (sum, item) => sum + Math.round(item.quantity * item.unitPrice),
        0,
      );

      // Si l'UI a fourni un frais transport global, on le répartit au prorata
      // du montant HT de chaque ligne. Reste sur la première ligne pour gérer
      // les arrondis (somme reste = montant global).
      const itemsWithTransport = dto.items.map((it) => ({ ...it }));
      if (dto.transportCostTotal && dto.transportCostTotal > 0 && totalAmount > 0) {
        let allocated = 0;
        for (let i = 0; i < itemsWithTransport.length; i++) {
          const it = itemsWithTransport[i];
          const lineHT = Math.round(it.quantity * it.unitPrice);
          const share =
            i === itemsWithTransport.length - 1
              ? dto.transportCostTotal - allocated
              : Math.round((dto.transportCostTotal * lineHT) / totalAmount);
          it.transportCost = (it.transportCost ?? 0) + share;
          allocated += share;
        }
      }

      const totalTransportCost = itemsWithTransport.reduce(
        (sum, item) => sum + (item.transportCost ?? 0),
        0,
      );

      const invoice = await tx.purchaseInvoice.create({
        data: {
          reference,
          supplierInvoiceNumber: dto.supplierInvoiceNumber,
          supplierId: dto.supplierId,
          purchaseOrderId: dto.purchaseOrderId,
          invoiceDate,
          receptionDate,
          totalAmount,
          totalTransportCost,
          amountPaid: 0,
          amountRemaining: totalAmount,
          scanUrl: dto.scanUrl,
          createdById: userId,
          items: {
            create: itemsWithTransport.map((item) => ({
              rawMaterialId: item.rawMaterialId,
              itemName: item.itemName,
              quantity: item.quantity,
              unit: item.unit,
              unitPrice: item.unitPrice,
              transportCost: item.transportCost ?? 0,
              lineAmount: Math.round(item.quantity * item.unitPrice),
              lotNumber: item.lotNumber,
              expirationDate: item.expirationDate ? new Date(item.expirationDate) : null,
            })),
          },
        },
        include: { items: true, supplier: { select: { id: true, name: true } } },
      });

      // Créer un lot par ligne + entrée stock + recalcul prix moyen pondéré
      for (let i = 0; i < itemsWithTransport.length; i++) {
        const item = itemsWithTransport[i];
        const lotNumber =
          item.lotNumber ?? `${reference}-L${(i + 1).toString().padStart(2, '0')}`;

        await this.rawStockService.createLotFromPurchase(tx, {
          rawMaterialId: item.rawMaterialId,
          lotNumber,
          purchaseInvoiceId: invoice.id,
          supplierId: dto.supplierId,
          quantity: item.quantity,
          receptionDate,
          expirationDate: item.expirationDate ? new Date(item.expirationDate) : null,
          unitAcquisitionPrice: item.unitPrice,
          transportCost: item.transportCost ?? 0,
          userId,
        });
      }

      // MAJ statut BC lié
      if (dto.purchaseOrderId) {
        await this.purchaseOrdersService.updateDeliveryFromInvoice(
          tx,
          dto.purchaseOrderId,
          dto.items.map((it) => ({ rawMaterialId: it.rawMaterialId, quantity: it.quantity })),
        );
      }

      return invoice;
    });
  }

  async findAll(query: QueryPurchaseInvoicesDto) {
    const where: Prisma.PurchaseInvoiceWhereInput = {};
    // Exclure les factures annulées (soft-delete)
    where.deletedAt = null;
    if (query.paymentStatus) where.paymentStatus = query.paymentStatus;
    if (query.supplierId) where.supplierId = query.supplierId;
    if (query.from || query.to) {
      where.invoiceDate = {};
      if (query.from) where.invoiceDate.gte = new Date(query.from);
      if (query.to) where.invoiceDate.lte = new Date(query.to);
    }

    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      where.OR = [
        { reference: { contains: term, mode: 'insensitive' } },
        { supplierInvoiceNumber: { contains: term, mode: 'insensitive' } },
        { supplier: { name: { contains: term, mode: 'insensitive' } } },
      ];
    }

    const sortBy = query.sortBy ?? 'invoiceDate';
    const sortOrder = query.sortOrder ?? 'desc';
    const orderBy: Prisma.PurchaseInvoiceOrderByWithRelationInput = { [sortBy]: sortOrder };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.purchaseInvoice.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy,
        include: {
          supplier: { select: { id: true, name: true } },
          _count: { select: { items: true, payments: true } },
        },
      }),
      this.prisma.purchaseInvoice.count({ where }),
    ]);

    return paginate(items, total, query.page, query.limit);
  }

  async findOne(id: string) {
    const invoice = await this.prisma.purchaseInvoice.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            rawMaterial: { select: { id: true, code: true, name: true, unit: true } },
          },
        },
        supplier: true,
        purchaseOrder: { select: { id: true, reference: true, status: true } },
        createdBy: { select: { id: true, fullName: true, email: true } },
        payments: {
          orderBy: { paymentDate: 'desc' },
          include: { createdBy: { select: { id: true, fullName: true } } },
        },
        rawMaterialLots: {
          include: { rawMaterial: { select: { id: true, code: true, name: true } } },
        },
      },
    });
    if (!invoice) {
      throw new NotFoundException(`Facture ${id} introuvable`);
    }
    return invoice;
  }

  /**
   * Annulation totale d'une facture d'achat (soft-delete).
   *
   * Effets :
   * - Marque la facture `deletedAt` + `deletedReason`
   * - Pour chaque lot créé par cette facture :
   *   * Refuse si le lot a été partiellement ou totalement consommé
   *   * Sinon : marque le lot DEPLETED + crée mouvement ADJUSTMENT (-qty) + décrémente le stock
   * - Ne touche PAS au prix moyen pondéré (acceptable car les lots récents annulés
   *   ont peu de poids dans la moyenne pondérée déjà calculée).
   *
   * Refus si :
   * - Paiements liés (annuler d'abord)
   * - Au moins un lot a été (partiellement) consommé → trop tard, faire un avoir
   * - Déjà annulée
   *
   * Réservé au DIRECTOR.
   */
  async cancel(
    id: string,
    reason: string,
    userId: string,
  ): Promise<{ message: string; invoiceId: string }> {
    if (!reason || reason.trim().length < 3) {
      throw new BadRequestException("Motif d'annulation obligatoire (minimum 3 caractères)");
    }

    const invoice = await this.prisma.purchaseInvoice.findUnique({
      where: { id },
      include: {
        items: true,
        payments: true,
        rawMaterialLots: true,
      },
    });
    if (!invoice) throw new NotFoundException(`Facture ${id} introuvable`);
    if (invoice.deletedAt) throw new BadRequestException('Facture déjà annulée');
    if (invoice.payments.length > 0) {
      throw new BadRequestException(
        `Impossible : ${invoice.payments.length} paiement(s) enregistré(s). Annulez les paiements d'abord.`,
      );
    }

    // Vérifier qu'aucun lot n'a été consommé
    const consumedLots = invoice.rawMaterialLots.filter(
      (lot) => Number(lot.remainingQuantity) < Number(lot.initialQuantity),
    );
    if (consumedLots.length > 0) {
      throw new BadRequestException(
        `Impossible : ${consumedLots.length} lot(s) déjà partiellement consommé(s) : ` +
          consumedLots.map((l) => l.lotNumber).join(', ') +
          `. Utilisez un retour marchandise au lieu d'annuler.`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Pour chaque lot : invalider + mouvement d'ajustement négatif + décrémente stock
      for (const lot of invoice.rawMaterialLots) {
        const qty = Number(lot.remainingQuantity); // = initialQuantity puisque non consommé
        await tx.rawStockMovement.create({
          data: {
            rawMaterialId: lot.rawMaterialId,
            lotId: lot.id,
            type: RawStockMovementType.ADJUSTMENT,
            quantity: -qty,
            referenceType: StockReferenceType.PURCHASE_INVOICE,
            referenceId: invoice.id,
            reason: `Annulation facture ${invoice.reference} : ${reason}`,
            createdById: userId,
          },
        });
        await tx.rawMaterialLot.update({
          where: { id: lot.id },
          data: {
            remainingQuantity: 0,
            status: LotStatus.DEPLETED,
          },
        });
        await tx.rawMaterial.update({
          where: { id: lot.rawMaterialId },
          data: { currentStock: { decrement: qty } },
        });
      }

      // Si liée à un BC, revenir en arrière sur les quantités livrées
      if (invoice.purchaseOrderId) {
        await this.purchaseOrdersService.rollbackDeliveryFromInvoice(
          tx,
          invoice.purchaseOrderId,
          invoice.items.map((item) => ({
            rawMaterialId: item.rawMaterialId,
            quantity: Number(item.quantity),
          })),
        );
        // Note : on ne recalcule pas le statut du BC ici (DELIVERED → VALIDATED) —
        // ça resterait correct car le BC garde son statut historique.
      }

      // Soft-delete
      await tx.purchaseInvoice.update({
        where: { id },
        data: { deletedAt: new Date(), deletedReason: reason.trim() },
      });

      this.logger.warn(
        `Facture d'achat ${invoice.reference} annulée par user ${userId} — motif : ${reason}`,
      );
      return { message: 'Facture annulée — stock corrigé', invoiceId: id };
    });
  }
}
