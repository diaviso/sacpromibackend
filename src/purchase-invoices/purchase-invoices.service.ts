import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  LotStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  PurchaseOrderStatus,
  RawStockMovementType,
  StockReferenceType,
  TreasuryEntrySource,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../common/services/sequence.service';
import { PurchaseOrdersService } from '../purchase-orders/purchase-orders.service';
import { RawStockService } from '../raw-stock/raw-stock.service';
import { TreasuryService } from '../treasury/treasury.service';
import { CreatePurchaseInvoiceDto } from './dto/create-purchase-invoice.dto';
import { QueryPurchaseInvoicesDto } from './dto/query-purchase-invoices.dto';
import { QuickPurchaseDto } from './dto/quick-purchase.dto';
import { paginate } from '../common/dto/pagination.dto';

@Injectable()
export class PurchaseInvoicesService {
  private readonly logger = new Logger(PurchaseInvoicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: SequenceService,
    private readonly purchaseOrdersService: PurchaseOrdersService,
    private readonly rawStockService: RawStockService,
    private readonly treasury: TreasuryService,
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
   * Met à jour les champs ADMIN d'une facture (n° fournisseur, dates, scan).
   * Refuse si la facture est annulée. Ne touche pas aux lignes (les lots
   * créés et le PMP sont déjà figés ; pour corriger les lignes il faut
   * annuler la facture et en saisir une nouvelle).
   */
  async updateAdmin(
    id: string,
    dto: import('./dto/update-purchase-invoice.dto').UpdatePurchaseInvoiceDto,
  ) {
    const invoice = await this.prisma.purchaseInvoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException(`Facture ${id} introuvable`);
    if (invoice.deletedAt) {
      throw new BadRequestException(
        "Impossible de modifier une facture annulée",
      );
    }
    const data: Record<string, unknown> = {};
    if (dto.supplierInvoiceNumber !== undefined) {
      data.supplierInvoiceNumber = dto.supplierInvoiceNumber;
    }
    if (dto.invoiceDate !== undefined) {
      data.invoiceDate = new Date(dto.invoiceDate);
    }
    if (dto.receptionDate !== undefined) {
      data.receptionDate = new Date(dto.receptionDate);
    }
    if (dto.scanUrl !== undefined) {
      data.scanUrl = dto.scanUrl || null;
    }
    if (Object.keys(data).length === 0) {
      return invoice;
    }
    return this.prisma.purchaseInvoice.update({
      where: { id },
      data,
      include: { supplier: { select: { id: true, name: true } } },
    });
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

  /**
   * Achat comptoir (POS achats) : creer + valider un BC, le receptionner et
   * (optionnellement) l'encaisser en une seule transaction atomique.
   *
   * Use case : achat au marche, prelevement immediat. Le geste est unique
   * cote utilisateur (un seul ecran), mais cote donnees on materialise les
   * 3 entites (BC, Reception, Paiement) pour preserver la coherence du
   * modele et de la comptabilite.
   *
   * Etapes (toutes dans le meme `prisma.$transaction`) :
   *   1. Validation fournisseur + matieres (existent, actives)
   *   2. Creation du BC en statut VALIDATED, validatedAt=now,
   *      expectedDate=purchaseDate (immediate)
   *   3. Creation de la PurchaseInvoice (reception) liee au BC :
   *      - lignes + repartition transport au prorata
   *      - lots crees via rawStockService.createLotFromPurchase
   *        (PMP recalcule + stock incremente)
   *      - quantites livrees mises a jour sur le BC -> bascule DELIVERED
   *   4. Si paidAmount > 0 :
   *      - validation : methode != CREDIT (ici c'est un encaissement reel),
   *        compte de tresorerie requis
   *      - creation SupplierPayment + ecriture tresorerie (amount negatif)
   *      - mise a jour de la facture (amountPaid, amountRemaining,
   *        paymentStatus)
   *
   * Retourne `{ order, invoice, payment? }`.
   */
  async quickPurchase(dto: QuickPurchaseDto, userId: string) {
    // ── Pre-validation hors TX (fail fast) ─────────────────────────────
    const supplier = await this.prisma.supplier.findUnique({ where: { id: dto.supplierId } });
    if (!supplier || !supplier.isActive) {
      throw new BadRequestException('Fournisseur introuvable ou inactif');
    }

    const materialIds = Array.from(new Set(dto.items.map((it) => it.rawMaterialId)));
    if (materialIds.length !== dto.items.length) {
      throw new BadRequestException(
        "Un achat comptoir ne peut pas contenir deux lignes pour la meme matiere premiere",
      );
    }
    const materials = await this.prisma.rawMaterial.findMany({
      where: { id: { in: materialIds } },
      select: { id: true, name: true, isActive: true },
    });
    if (materials.length !== materialIds.length) {
      throw new BadRequestException("Une ou plusieurs matieres premieres sont introuvables");
    }
    const inactive = materials.filter((m) => !m.isActive);
    if (inactive.length > 0) {
      throw new BadRequestException(
        `Matieres inactives : ${inactive.map((m) => m.name).join(', ')}`,
      );
    }

    // Validation paiement
    const paidAmount = dto.paidAmount ?? 0;
    if (paidAmount > 0) {
      if (!dto.paymentMethod) {
        throw new BadRequestException(
          "Methode de paiement requise quand un montant est encaisse",
        );
      }
      if (!dto.paymentAccountId) {
        throw new BadRequestException(
          "Compte de tresorerie requis pour enregistrer un encaissement comptoir",
        );
      }
      const account = await this.prisma.account.findUnique({
        where: { id: dto.paymentAccountId },
      });
      if (!account) throw new NotFoundException('Compte de tresorerie introuvable');
      if (!account.isActive) {
        throw new BadRequestException('Le compte de tresorerie est desactive');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const purchaseDate = dto.purchaseDate ? new Date(dto.purchaseDate) : new Date();
      const supplierInvoiceNumber =
        dto.supplierInvoiceNumber?.trim() || `COMPTOIR-${purchaseDate.getTime()}`;

      // ── 1. Creer le BC valide ─────────────────────────────────────────
      const bcReference = await this.sequence.nextReference(
        'BC',
        purchaseDate.getFullYear(),
        tx,
      );
      const totalEstimate = dto.items.reduce(
        (s, it) => s + Math.round(it.quantity * it.unitPrice),
        0,
      );
      const order = await tx.purchaseOrder.create({
        data: {
          reference: bcReference,
          supplierId: dto.supplierId,
          orderDate: purchaseDate,
          expectedDate: purchaseDate,
          status: PurchaseOrderStatus.VALIDATED,
          validatedAt: purchaseDate,
          totalAmount: totalEstimate,
          note: dto.note,
          createdById: userId,
          items: {
            create: dto.items.map((item) => ({
              rawMaterialId: item.rawMaterialId,
              itemName: item.itemName,
              unit: item.unit,
              quantityOrdered: item.quantity,
              unitPriceEstimate: item.unitPrice,
              lineAmount: Math.round(item.quantity * item.unitPrice),
            })),
          },
        },
        include: { items: true, supplier: { select: { id: true, name: true } } },
      });

      // ── 2. Repartition transport au prorata ────────────────────────────
      const itemsWithTransport = dto.items.map((it) => ({
        ...it,
        transportCost: 0,
      }));
      if (
        dto.transportCostTotal &&
        dto.transportCostTotal > 0 &&
        totalEstimate > 0
      ) {
        let allocated = 0;
        for (let i = 0; i < itemsWithTransport.length; i++) {
          const it = itemsWithTransport[i];
          const lineHT = Math.round(it.quantity * it.unitPrice);
          const share =
            i === itemsWithTransport.length - 1
              ? dto.transportCostTotal - allocated
              : Math.round((dto.transportCostTotal * lineHT) / totalEstimate);
          it.transportCost = share;
          allocated += share;
        }
      }
      const totalTransportCost = itemsWithTransport.reduce(
        (s, it) => s + it.transportCost,
        0,
      );

      // ── 3. Creer la facture / reception ───────────────────────────────
      const faReference = await this.sequence.nextReference(
        'FA',
        purchaseDate.getFullYear(),
        tx,
      );
      const invoice = await tx.purchaseInvoice.create({
        data: {
          reference: faReference,
          supplierInvoiceNumber,
          supplierId: dto.supplierId,
          purchaseOrderId: order.id,
          invoiceDate: purchaseDate,
          receptionDate: purchaseDate,
          totalAmount: totalEstimate,
          totalTransportCost,
          amountPaid: 0,
          amountRemaining: totalEstimate,
          scanUrl: dto.scanUrl,
          createdById: userId,
          items: {
            create: itemsWithTransport.map((item) => ({
              rawMaterialId: item.rawMaterialId,
              itemName: item.itemName,
              quantity: item.quantity,
              unit: item.unit,
              unitPrice: item.unitPrice,
              transportCost: item.transportCost,
              lineAmount: Math.round(item.quantity * item.unitPrice),
            })),
          },
        },
        include: { items: true, supplier: { select: { id: true, name: true } } },
      });

      // ── 4. Creer les lots + mouvements stock + PMP ────────────────────
      for (let i = 0; i < itemsWithTransport.length; i++) {
        const item = itemsWithTransport[i];
        const lotNumber = `${faReference}-L${(i + 1).toString().padStart(2, '0')}`;
        await this.rawStockService.createLotFromPurchase(tx, {
          rawMaterialId: item.rawMaterialId,
          lotNumber,
          purchaseInvoiceId: invoice.id,
          supplierId: dto.supplierId,
          quantity: item.quantity,
          receptionDate: purchaseDate,
          expirationDate: null,
          unitAcquisitionPrice: item.unitPrice,
          transportCost: item.transportCost,
          userId,
        });
      }

      // ── 5. MAJ BC : passe en DELIVERED ────────────────────────────────
      await this.purchaseOrdersService.updateDeliveryFromInvoice(
        tx,
        order.id,
        dto.items.map((it) => ({
          rawMaterialId: it.rawMaterialId,
          quantity: it.quantity,
        })),
      );

      // ── 6. Paiement embarque (optionnel) ──────────────────────────────
      let payment: Awaited<ReturnType<typeof tx.supplierPayment.create>> | null = null;
      if (paidAmount > 0) {
        // Garde-fou : on REJETTE explicitement les surpaiements > 1% du total.
        // Plafonner silencieusement provoquerait un ecart de caisse non
        // detectable (l'argent est sorti physiquement, l'ecriture est tronquee).
        // On tolere 1% pour absorber les arrondis "rendre de la monnaie".
        if (paidAmount > totalEstimate * 1.01) {
          throw new BadRequestException(
            `Montant paye (${paidAmount.toLocaleString('fr-FR')}) superieur au total ` +
              `(${totalEstimate.toLocaleString('fr-FR')} FCFA). Verifiez la saisie ou ` +
              `ajustez le panier avant de valider.`,
          );
        }
        const effectivePaid = Math.min(paidAmount, totalEstimate);
        if (dto.paymentMethod === PaymentMethod.OTHER) {
          // OTHER autorise mais on log pour audit
          this.logger.log(`Achat comptoir ${faReference} avec methode OTHER`);
        }
        payment = await tx.supplierPayment.create({
          data: {
            purchaseInvoiceId: invoice.id,
            amount: effectivePaid,
            paymentDate: purchaseDate,
            paymentMethod: dto.paymentMethod!,
            accountId: dto.paymentAccountId,
            note: 'Paiement comptoir',
            createdById: userId,
          },
        });
        await this.treasury.writeEntry({
          tx,
          accountId: dto.paymentAccountId!,
          entryDate: purchaseDate,
          amount: -effectivePaid,
          source: TreasuryEntrySource.SUPPLIER_PAYMENT,
          description: `Achat comptoir ${faReference} (${supplier.name})`,
          supplierPaymentId: payment.id,
          userId,
        });
        // Maj statut paiement facture
        const newRemaining = totalEstimate - effectivePaid;
        const paymentStatus =
          effectivePaid >= totalEstimate
            ? PaymentStatus.PAID
            : effectivePaid > 0
              ? PaymentStatus.PARTIALLY_PAID
              : PaymentStatus.UNPAID;
        await tx.purchaseInvoice.update({
          where: { id: invoice.id },
          data: {
            amountPaid: effectivePaid,
            amountRemaining: newRemaining,
            paymentStatus,
          },
        });
      }

      return { order, invoice, payment };
    });
  }
}
