import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  LotStatus,
  PaymentStatus,
  Prisma,
  RawStockMovementType,
  StockReferenceType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../common/services/sequence.service';
import { CreateSupplierCreditNoteDto } from './dto/create-supplier-credit-note.dto';
import { QuerySupplierCreditNotesDto } from './dto/query-supplier-credit-notes.dto';
import { paginate } from '../common/dto/pagination.dto';

@Injectable()
export class SupplierCreditNotesService {
  private readonly logger = new Logger(SupplierCreditNotesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: SequenceService,
  ) {}

  /**
   * Cree un avoir fournisseur (retour marchandise).
   *
   * Effets atomiques (dans une transaction Prisma) :
   *
   *   1. Valide que la facture parent existe, n'est pas annulee, et que
   *      chaque ligne reference une vraie purchase_invoice_item.
   *   2. Pour chaque ligne :
   *      - Verifie qty a retourner > 0 et <= qty disponible sur le lot
   *        (qui peut etre < qty initiale si deja partiellement consomme).
   *      - Cree un mouvement RawStockMovement ADJUSTMENT(-qty) avec
   *        referenceType=PURCHASE_INVOICE (pour audit).
   *      - Decremente RawMaterialLot.remainingQuantity, bascule en
   *        DEPLETED si remainingQuantity arrive a 0.
   *      - Decremente RawMaterial.currentStock.
   *   3. Cree le SupplierCreditNote + items (snapshot prix unitaire de
   *      la facture parent).
   *   4. Met a jour PurchaseInvoice.amountRemaining
   *      = max(-totalCreditCumulated, amountRemaining - totalAvoir)
   *      et recalcule paymentStatus.
   *
   * Important : on ne touche pas a averagePrice de la matiere. Le retour
   * ne corrige pas retroactivement les couts de production deja
   * consommee — c'est traite comme une regularisation.
   */
  async create(dto: CreateSupplierCreditNoteDto, userId: string) {
    if (dto.items.length === 0) {
      throw new BadRequestException('Au moins une ligne est requise');
    }

    return this.prisma.$transaction(async (tx) => {
      // ── 1. Charger et valider la facture parent ──────────────────────
      const invoice = await tx.purchaseInvoice.findUnique({
        where: { id: dto.purchaseInvoiceId },
        include: {
          items: {
            include: {
              rawMaterial: { select: { id: true, code: true, name: true } },
            },
          },
          rawMaterialLots: true,
          supplier: { select: { id: true, name: true } },
        },
      });
      if (!invoice) {
        throw new NotFoundException(`Reception ${dto.purchaseInvoiceId} introuvable`);
      }
      if (invoice.deletedAt) {
        throw new BadRequestException(
          'Reception annulee — impossible de creer un avoir dessus',
        );
      }

      // ── 2. Valider chaque ligne demandee ─────────────────────────────
      // Pour chaque ligne dto : on prend l'item de facture, on recupere
      // le lot correspondant (RawMaterialLot lie par purchaseInvoiceId +
      // rawMaterialId), on verifie la qty disponible.
      const itemsResolved: Array<{
        purchaseInvoiceItemId: string;
        rawMaterialId: string;
        rawMaterialLotId: string | null;
        itemName: string;
        unit: string;
        unitPrice: number;
        quantity: number;
        lineAmount: number;
      }> = [];

      for (const dtoLine of dto.items) {
        const invoiceItem = invoice.items.find(
          (it) => it.id === dtoLine.purchaseInvoiceItemId,
        );
        if (!invoiceItem) {
          throw new BadRequestException(
            `Ligne de facture ${dtoLine.purchaseInvoiceItemId} introuvable dans la reception ${invoice.reference}`,
          );
        }
        if (dtoLine.quantity > Number(invoiceItem.quantity) + 1e-6) {
          throw new BadRequestException(
            `Quantite retournee (${dtoLine.quantity}) superieure a la quantite recue ` +
              `(${invoiceItem.quantity}) pour ${invoiceItem.itemName}`,
          );
        }

        // Identifier le lot d'origine (un lot par ligne de facture)
        const lot = invoice.rawMaterialLots.find(
          (l) => l.rawMaterialId === invoiceItem.rawMaterialId,
        );
        if (!lot) {
          throw new BadRequestException(
            `Lot d'origine introuvable pour ${invoiceItem.itemName} — la reception est-elle corrompue ?`,
          );
        }
        if (Number(lot.remainingQuantity) + 1e-6 < dtoLine.quantity) {
          throw new BadRequestException(
            `Stock restant du lot ${lot.lotNumber} (${lot.remainingQuantity}) insuffisant ` +
              `pour retourner ${dtoLine.quantity} ${invoiceItem.unit}. ` +
              `Lot deja partiellement consomme — ajustez la quantite ou faites un avoir partiel.`,
          );
        }

        const lineAmount = Math.round(dtoLine.quantity * invoiceItem.unitPrice);
        itemsResolved.push({
          purchaseInvoiceItemId: invoiceItem.id,
          rawMaterialId: invoiceItem.rawMaterialId,
          rawMaterialLotId: lot.id,
          itemName: invoiceItem.itemName,
          unit: invoiceItem.unit,
          unitPrice: invoiceItem.unitPrice,
          quantity: dtoLine.quantity,
          lineAmount,
        });
      }

      const totalAmount = itemsResolved.reduce((s, it) => s + it.lineAmount, 0);
      if (totalAmount <= 0) {
        throw new BadRequestException('Total de l\'avoir doit etre > 0');
      }

      // ── 3. Generer reference + creer SupplierCreditNote ──────────────
      const creditDate = new Date(dto.creditDate);
      const reference = await this.sequence.nextReference(
        'AVR',
        creditDate.getFullYear(),
        tx,
      );

      const creditNote = await tx.supplierCreditNote.create({
        data: {
          reference,
          purchaseInvoiceId: invoice.id,
          supplierId: invoice.supplierId,
          creditDate,
          totalAmount,
          reason: dto.reason.trim(),
          createdById: userId,
          items: {
            create: itemsResolved.map((it) => ({
              purchaseInvoiceItemId: it.purchaseInvoiceItemId,
              rawMaterialId: it.rawMaterialId,
              rawMaterialLotId: it.rawMaterialLotId,
              itemName: it.itemName,
              quantity: it.quantity,
              unit: it.unit,
              unitPrice: it.unitPrice,
              lineAmount: it.lineAmount,
            })),
          },
        },
        include: {
          items: true,
          supplier: { select: { id: true, name: true } },
          purchaseInvoice: { select: { id: true, reference: true } },
        },
      });

      // ── 4. Effets stock par ligne ────────────────────────────────────
      for (const it of itemsResolved) {
        // Mouvement ADJUSTMENT negatif
        await tx.rawStockMovement.create({
          data: {
            rawMaterialId: it.rawMaterialId,
            lotId: it.rawMaterialLotId,
            type: RawStockMovementType.ADJUSTMENT,
            quantity: -it.quantity,
            referenceType: StockReferenceType.PURCHASE_INVOICE,
            referenceId: invoice.id,
            reason: `Avoir ${reference} — ${dto.reason.trim().slice(0, 100)}`,
            createdById: userId,
          },
        });

        // Decrement lot + bascule DEPLETED si vide
        const newRemaining =
          Number(
            (
              await tx.rawMaterialLot.findUnique({
                where: { id: it.rawMaterialLotId! },
                select: { remainingQuantity: true },
              })
            )!.remainingQuantity,
          ) - it.quantity;
        await tx.rawMaterialLot.update({
          where: { id: it.rawMaterialLotId! },
          data: {
            remainingQuantity: Math.max(0, newRemaining),
            status: newRemaining <= 0 ? LotStatus.DEPLETED : undefined,
          },
        });

        // Decrement currentStock de la matiere
        await tx.rawMaterial.update({
          where: { id: it.rawMaterialId },
          data: { currentStock: { decrement: it.quantity } },
        });
      }

      // ── 5. Mise a jour de la dette sur la facture parent ────────────
      // amountRemaining diminue de totalAmount.
      // Si depasse, devient negatif = avoir a utiliser (interpretation
      // metier : le fournisseur nous doit cette somme).
      const newAmountRemaining = invoice.amountRemaining - totalAmount;
      const newAmountPaid = invoice.amountPaid; // le paiement reel ne change pas
      const newStatus: PaymentStatus =
        newAmountRemaining <= 0
          ? PaymentStatus.PAID
          : newAmountPaid > 0
            ? PaymentStatus.PARTIALLY_PAID
            : PaymentStatus.UNPAID;

      await tx.purchaseInvoice.update({
        where: { id: invoice.id },
        data: {
          amountRemaining: newAmountRemaining,
          paymentStatus: newStatus,
        },
      });

      this.logger.log(
        `Avoir ${reference} cree sur reception ${invoice.reference} — total ${totalAmount} FCFA`,
      );

      return creditNote;
    });
  }

  async findAll(query: QuerySupplierCreditNotesDto) {
    const where: Prisma.SupplierCreditNoteWhereInput = { deletedAt: null };
    if (query.supplierId) where.supplierId = query.supplierId;
    if (query.purchaseInvoiceId) where.purchaseInvoiceId = query.purchaseInvoiceId;
    if (query.from || query.to) {
      where.creditDate = {};
      if (query.from) where.creditDate.gte = new Date(query.from);
      if (query.to) where.creditDate.lte = new Date(query.to);
    }
    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { reference: { contains: term, mode: 'insensitive' } },
        { reason: { contains: term, mode: 'insensitive' } },
        { supplier: { name: { contains: term, mode: 'insensitive' } } },
      ];
    }

    const sortBy = query.sortBy ?? 'creditDate';
    const sortOrder = query.sortOrder ?? 'desc';
    const orderBy: Prisma.SupplierCreditNoteOrderByWithRelationInput = {
      [sortBy]: sortOrder,
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.supplierCreditNote.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy,
        include: {
          supplier: { select: { id: true, name: true } },
          purchaseInvoice: { select: { id: true, reference: true } },
          _count: { select: { items: true } },
        },
      }),
      this.prisma.supplierCreditNote.count({ where }),
    ]);

    return paginate(items, total, query.page, query.limit);
  }

  async findOne(id: string) {
    const note = await this.prisma.supplierCreditNote.findUnique({
      where: { id },
      include: {
        supplier: true,
        purchaseInvoice: {
          select: {
            id: true,
            reference: true,
            supplierInvoiceNumber: true,
            invoiceDate: true,
            totalAmount: true,
            amountPaid: true,
            amountRemaining: true,
            paymentStatus: true,
          },
        },
        items: {
          include: {
            rawMaterial: { select: { id: true, code: true, name: true, unit: true } },
            rawMaterialLot: {
              select: { id: true, lotNumber: true },
            },
          },
        },
        createdBy: { select: { id: true, fullName: true } },
      },
    });
    if (!note) throw new NotFoundException(`Avoir ${id} introuvable`);
    return note;
  }
}
