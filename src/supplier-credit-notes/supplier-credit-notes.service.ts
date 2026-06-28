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

      // ── 1bis. Cumul des avoirs deja emis sur cette facture ────────────
      // Pour chaque purchaseInvoiceItem, on agrege la qty deja retournee
      // via d'autres avoirs (actifs, non soft-deleted). Cela permet de
      // refuser un avoir qui depasserait la qty effectivement recue.
      const previousCredits = await tx.supplierCreditNoteItem.findMany({
        where: {
          supplierCreditNote: {
            purchaseInvoiceId: invoice.id,
            deletedAt: null,
          },
        },
        select: { purchaseInvoiceItemId: true, quantity: true, lineAmount: true },
      });
      const previousQtyByItem = new Map<string, number>();
      let previousAmountTotal = 0;
      for (const pc of previousCredits) {
        previousAmountTotal += pc.lineAmount;
        if (pc.purchaseInvoiceItemId) {
          previousQtyByItem.set(
            pc.purchaseInvoiceItemId,
            (previousQtyByItem.get(pc.purchaseInvoiceItemId) ?? 0) + Number(pc.quantity),
          );
        }
      }

      // ── 1ter. Aggregation des qty demandees par invoiceItem et par lot
      // pour gerer le cas ou plusieurs lignes DTO ciblent la meme ligne
      // facture ou le meme lot (cumulatif).
      const requestedByItem = new Map<string, number>();
      for (const dtoLine of dto.items) {
        if (dtoLine.quantity <= 0) {
          throw new BadRequestException(
            'Toutes les quantites doivent etre strictement positives',
          );
        }
        requestedByItem.set(
          dtoLine.purchaseInvoiceItemId,
          (requestedByItem.get(dtoLine.purchaseInvoiceItemId) ?? 0) + dtoLine.quantity,
        );
      }

      // ── 2. Resoudre chaque ligne demandee ────────────────────────────
      // Le lot d'origine est identifie par JOIN sur lotNumber (champ
      // present a la fois sur PurchaseInvoiceItem et RawMaterialLot, et
      // peuple par purchase-invoices.service depuis la refonte).
      // C'est la SEULE jointure fiable quand la facture a plusieurs lots
      // pour la meme matiere.
      interface ResolvedItem {
        purchaseInvoiceItemId: string;
        rawMaterialId: string;
        rawMaterialLotId: string;
        lotNumber: string;
        itemName: string;
        unit: string;
        unitPrice: number;
        quantity: number;
        lineAmount: number;
      }
      const itemsResolved: ResolvedItem[] = [];
      const requestedByLot = new Map<string, number>();

      for (const dtoLine of dto.items) {
        const invoiceItem = invoice.items.find(
          (it) => it.id === dtoLine.purchaseInvoiceItemId,
        );
        if (!invoiceItem) {
          throw new BadRequestException(
            `Ligne de facture ${dtoLine.purchaseInvoiceItemId} introuvable dans la reception ${invoice.reference}`,
          );
        }

        // Plafond par ligne : qty recue - qty deja retournee sur d'autres
        // avoirs - qty demandee sur cette ligne dto (et autres lignes dto
        // visant la meme purchaseInvoiceItem).
        const alreadyCredited = previousQtyByItem.get(invoiceItem.id) ?? 0;
        const requestedOnThisItem = requestedByItem.get(invoiceItem.id) ?? 0;
        const maxAllowed = Number(invoiceItem.quantity) - alreadyCredited;
        if (requestedOnThisItem > maxAllowed + 1e-6) {
          throw new BadRequestException(
            `Cumul retours sur "${invoiceItem.itemName}" (${requestedOnThisItem}) ` +
              `superieur au reste retournable (${maxAllowed} = recu ${invoiceItem.quantity} - ` +
              `deja avoire ${alreadyCredited}).`,
          );
        }

        if (!invoiceItem.lotNumber) {
          throw new BadRequestException(
            `Ligne "${invoiceItem.itemName}" n'a pas de lotNumber persiste — ` +
              `donnee heritage. Re-saisissez la reception via le nouveau workflow ` +
              `(les receptions creees depuis la refonte 2026-06-28 ont leur lotNumber).`,
          );
        }
        // Resolution par lotNumber (au sein de cette facture). Unique
        // car RawMaterialLot.lotNumber a une contrainte UNIQUE globale.
        const lot = invoice.rawMaterialLots.find(
          (l) => l.lotNumber === invoiceItem.lotNumber,
        );
        if (!lot) {
          throw new BadRequestException(
            `Lot ${invoiceItem.lotNumber} introuvable pour ${invoiceItem.itemName} — ` +
              `donnee corrompue ?`,
          );
        }
        if (lot.status !== LotStatus.ACTIVE) {
          throw new BadRequestException(
            `Lot ${lot.lotNumber} en statut ${lot.status} — impossible d'en retourner. ` +
              `Si la marchandise a deja ete consommee, faites une regularisation manuelle.`,
          );
        }

        // Cumul par lot : pour le check de qty restante, on accumule.
        const cumulOnLot = (requestedByLot.get(lot.id) ?? 0) + dtoLine.quantity;
        if (cumulOnLot > Number(lot.remainingQuantity) + 1e-6) {
          throw new BadRequestException(
            `Cumul retours sur le lot ${lot.lotNumber} (${cumulOnLot}) ` +
              `superieur au stock restant (${lot.remainingQuantity}).`,
          );
        }
        requestedByLot.set(lot.id, cumulOnLot);

        const lineAmount = Math.round(dtoLine.quantity * invoiceItem.unitPrice);
        itemsResolved.push({
          purchaseInvoiceItemId: invoiceItem.id,
          rawMaterialId: invoiceItem.rawMaterialId,
          rawMaterialLotId: lot.id,
          lotNumber: lot.lotNumber,
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

      // Garde-fou comptable : cumul des avoirs ne peut depasser totalAmount
      // de la facture parent. Sinon on creerait du credit pur jamais
      // remboursable proprement.
      if (previousAmountTotal + totalAmount > invoice.totalAmount + 1e-6) {
        throw new BadRequestException(
          `Cumul des avoirs (${previousAmountTotal + totalAmount} FCFA) ` +
            `superieur au total de la reception (${invoice.totalAmount} FCFA).`,
        );
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

      // ── 4. Effets stock par ligne (atomique) ─────────────────────────
      for (const it of itemsResolved) {
        // Mouvement ADJUSTMENT negatif — la `reason` cite explicitement
        // l'avoir pour audit (referenceType reste PURCHASE_INVOICE car le
        // mouvement est materiellement attache a la reception, mais la
        // raison nomme l'avoir source).
        await tx.rawStockMovement.create({
          data: {
            rawMaterialId: it.rawMaterialId,
            lotId: it.rawMaterialLotId,
            type: RawStockMovementType.ADJUSTMENT,
            quantity: -it.quantity,
            referenceType: StockReferenceType.PURCHASE_INVOICE,
            referenceId: invoice.id,
            reason: `Avoir ${reference} (${dto.reason.trim().slice(0, 80)})`,
            createdById: userId,
          },
        });

        // Decrement atomique du lot + bascule DEPLETED si vide.
        // On utilise `decrement` Prisma pour eviter le race condition
        // lecture-puis-ecriture du pattern precedent.
        const updatedLot = await tx.rawMaterialLot.update({
          where: { id: it.rawMaterialLotId },
          data: { remainingQuantity: { decrement: it.quantity } },
          select: { remainingQuantity: true },
        });
        if (Number(updatedLot.remainingQuantity) <= 1e-6) {
          await tx.rawMaterialLot.update({
            where: { id: it.rawMaterialLotId },
            data: { status: LotStatus.DEPLETED },
          });
        }

        // Decrement atomique du stock global de la matiere.
        // Le clamp >= 0 est garanti par le pre-check cumulatif (cumul
        // requested sur le lot <= remainingQuantity du lot).
        await tx.rawMaterial.update({
          where: { id: it.rawMaterialId },
          data: { currentStock: { decrement: it.quantity } },
        });
      }

      // ── 5. Mise a jour de la dette sur la facture parent ────────────
      // amountRemaining diminue de totalAmount.
      // Si depasse, devient negatif = avoir excedentaire (interpretation
      // metier : le fournisseur nous doit cette somme — credit a imputer
      // sur prochaine reception).
      const newAmountRemaining = invoice.amountRemaining - totalAmount;
      const newAmountPaid = invoice.amountPaid; // le paiement reel ne change pas
      // paymentStatus distingue trois cas :
      //   - remaining > 0 : il reste a payer (UNPAID ou PARTIALLY_PAID)
      //   - remaining == 0 : solde (PAID)
      //   - remaining < 0 : avoir excedentaire, le statut PAID est utilise
      //     (l'enum n'a pas de CREDIT_BALANCE) ; le signe negatif est lui
      //     suffisant cote rapports.
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
        `Avoir ${reference} cree sur reception ${invoice.reference} — total ${totalAmount} FCFA ` +
          `(amountRemaining ${invoice.amountRemaining} → ${newAmountRemaining})`,
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
