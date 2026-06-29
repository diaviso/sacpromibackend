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
  TreasuryEntrySource,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../common/services/sequence.service';
import { FinishedStockService } from '../finished-stock/finished-stock.service';
import { CustomerOrdersService } from '../customer-orders/customer-orders.service';
import { TreasuryService } from '../treasury/treasury.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { CreateCreditNoteDto } from './dto/create-credit-note.dto';
import { recomputeSaleInvoiceState } from './sale-invoice-state';
import { paginate, PaginationDto } from '../common/dto/pagination.dto';

@Injectable()
export class SalesService {
  private readonly logger = new Logger(SalesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: SequenceService,
    private readonly finishedStockService: FinishedStockService,
    private readonly customerOrdersService: CustomerOrdersService,
    private readonly treasury: TreasuryService,
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
    const subtotalAmount = itemsResolved.reduce((s, it) => s + it.lineAmount, 0);

    // ── Remise globale (mode CAISSE) ────────────────────────────────────────
    // La remise doit etre >= 0 et ne peut pas depasser le sous-total
    // (sinon le total devient negatif). On la persiste sur la facture pour
    // que la comptabilite et la reedition du PDF restent fideles.
    const discountAmount = Math.max(0, dto.discountAmount ?? 0);
    if (discountAmount > subtotalAmount) {
      throw new BadRequestException(
        `Remise (${discountAmount.toLocaleString('fr-FR')} FCFA) superieure au sous-total ` +
          `(${subtotalAmount.toLocaleString('fr-FR')} FCFA)`,
      );
    }
    const totalAmount = subtotalAmount - discountAmount;

    // ── Mode paiement embarque (POS) ───────────────────────────────────────
    // Quand paidAmount est explicitement fourni, on encaisse dans la meme
    // transaction. Sinon, comportement legacy : facture posee selon
    // paymentMethod (CREDIT = impaye, autre = paye integralement).
    const posMode = dto.paidAmount !== undefined;
    if (posMode) {
      // En POS, on encaisse via un moyen physique : refuser le mode CREDIT
      // (qui veut dire "le client n'a rien paye"). Pour faire du credit pur
      // depuis la caisse, l'utilisateur met paidAmount=0 — mais alors le
      // paymentMethod doit etre CREDIT pour rester coherent.
      if (dto.paidAmount! > 0 && dto.paymentMethod === SalePaymentMethod.CREDIT) {
        throw new BadRequestException(
          'Incoherent : montant encaisse > 0 mais methode de paiement = CREDIT. ' +
            'Choisir une methode de paiement reelle (CASH, WAVE, TRANSFER...).',
        );
      }
      if (dto.paidAmount! > 0 && !dto.paymentAccountId) {
        throw new BadRequestException(
          'Un compte de tresorerie est requis pour enregistrer un encaissement.',
        );
      }
      // Limite haute : on ne sauvegarde jamais plus que le total (le rendu
      // monnaie est gere a l'affichage, pas en base).
      if (dto.paidAmount! > totalAmount) {
        // On accepte mais on plafonne — le frontend a deja calcule le rendu.
        // Note : aucun warning, c'est attendu pour un POS classique.
      }
    }

    // VALIDATION : plafond crédit — blocage strict, sauf override explicite par directeur.
    // Le plafond s'applique sur la creance reelle = total net - encaissement immediat.
    const warnings: string[] = [];
    const immediatePaid = posMode ? Math.min(dto.paidAmount!, totalAmount) : 0;
    const futureDebt = totalAmount - immediatePaid;
    const isCredit = dto.paymentMethod === SalePaymentMethod.CREDIT;
    const createsDebt = isCredit || (posMode && futureDebt > 0);
    if (createsDebt && customer.creditLimit > 0) {
      const currentDebt = await this.prisma.saleInvoice.aggregate({
        where: {
          customerId: dto.customerId,
          paymentStatus: { in: [PaymentStatus.UNPAID, PaymentStatus.PARTIALLY_PAID] },
        },
        _sum: { amountRemaining: true },
      });
      const currentBalance = currentDebt._sum.amountRemaining ?? 0;
      const addedDebt = posMode ? futureDebt : totalAmount;
      if (currentBalance + addedDebt > customer.creditLimit) {
        const msg =
          `Plafond crédit dépassé : créances actuelles ${currentBalance.toLocaleString('fr-FR')} ` +
          `+ creance generee ${addedDebt.toLocaleString('fr-FR')} > plafond ` +
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

      // ── Statut paiement initial ─────────────────────────────────────────
      // Mode POS (paidAmount fourni) : on respecte exactement le montant
      // encaisse, plafonne au total (le rendu monnaie est cote front).
      // Mode legacy : binaire selon paymentMethod (CREDIT = impaye, sinon paye).
      let amountPaid: number;
      let amountRemaining: number;
      let paymentStatus: PaymentStatus;
      if (posMode) {
        amountPaid = Math.min(dto.paidAmount!, totalAmount);
        amountRemaining = totalAmount - amountPaid;
        paymentStatus =
          amountPaid >= totalAmount
            ? PaymentStatus.PAID
            : amountPaid > 0
              ? PaymentStatus.PARTIALLY_PAID
              : PaymentStatus.UNPAID;
      } else {
        amountPaid = isCredit ? 0 : totalAmount;
        amountRemaining = isCredit ? totalAmount : 0;
        paymentStatus = isCredit ? PaymentStatus.UNPAID : PaymentStatus.PAID;
      }

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
          subtotalAmount,
          discountAmount,
          discountReason: discountAmount > 0 ? (dto.discountReason ?? null) : null,
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

      // ── Encaissement embarque (mode CAISSE) ──────────────────────────────
      // Si paidAmount > 0 a ete fourni, on cree un CustomerPayment dans la
      // meme transaction. C'est l'equivalent d'un appel separe a
      // POST /customer-payments mais atomique avec la facture.
      // Le treasury entry est ecrit si paymentAccountId est fourni (et
      // paymentMethod != CREDIT, garde-fou meme si deja valide plus haut).
      if (posMode && amountPaid > 0) {
        // Verification du compte (existe + actif)
        const account = await tx.account.findUnique({
          where: { id: dto.paymentAccountId! },
        });
        if (!account) throw new NotFoundException('Compte de tresorerie introuvable');
        if (!account.isActive) throw new BadRequestException('Le compte de tresorerie est desactive');

        const payment = await tx.customerPayment.create({
          data: {
            saleInvoiceId: invoice.id,
            amount: amountPaid,
            paymentDate: invoiceDate,
            paymentMethod: dto.paymentMethod,
            accountId: dto.paymentAccountId,
            note: 'Encaissement comptant (caisse)',
            createdById: userId,
          },
        });

        // Ecriture tresorerie — credit du compte (montant positif).
        // Source = CUSTOMER_PAYMENT pour que les rapports d'encaissements
        // remontent bien cette vente comptant.
        if (dto.paymentMethod !== SalePaymentMethod.CREDIT) {
          await this.treasury.writeEntry({
            tx,
            accountId: dto.paymentAccountId!,
            entryDate: invoiceDate,
            amount: amountPaid,
            source: TreasuryEntrySource.CUSTOMER_PAYMENT,
            description: `Encaissement comptant ${reference} (${invoice.customer.name})`,
            customerPaymentId: payment.id,
            userId,
          });
        }
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
    includeDeleted?: boolean;
  }) {
    const where: Prisma.SaleInvoiceWhereInput = {};
    // Par défaut, exclure les factures annulées (soft-delete)
    if (!filters.includeDeleted) where.deletedAt = null;
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

      // Réduire le montant dû par le client (audit C1) : recalcul depuis la
      // source de vérité — l'avoir (facture enfant, montant négatif) est désormais
      // pris en compte sans gonfler artificiellement `amountPaid`.
      await recomputeSaleInvoiceState(tx, saleInvoiceId);

      return creditNote;
    });
  }

  /**
   * Annulation totale d'une facture de vente (soft-delete).
   *
   * Effets :
   * - Marque la facture `deletedAt` + `deletedReason` (préserve l'audit trail)
   * - Crée un mouvement de stock ADJUSTMENT (+qty) pour chaque ligne (réintègre le stock)
   * - Met à jour le `currentStock` des produits concernés
   * - Si la facture était liée à une commande client, décrémente la quantité livrée
   *
   * Refus si :
   * - La facture a déjà des paiements enregistrés (annuler d'abord les paiements)
   * - La facture a déjà des avoirs (notes de crédit) liés
   * - La facture est déjà annulée
   *
   * Note : ne touche PAS au prix moyen pondéré du produit (les lots originaux
   * ne sont pas recréés, on fait juste un mouvement d'ajustement). Pour un
   * retour partiel avec recréation de lot, utiliser `createCreditNote` à la place.
   */
  async cancel(
    saleInvoiceId: string,
    reason: string,
    userId: string,
  ): Promise<{ message: string; invoiceId: string }> {
    if (!reason || reason.trim().length < 3) {
      throw new BadRequestException('Motif d\'annulation obligatoire (minimum 3 caractères)');
    }

    const invoice = await this.prisma.saleInvoice.findUnique({
      where: { id: saleInvoiceId },
      include: { items: true, payments: true, creditNotes: true },
    });
    if (!invoice) {
      throw new NotFoundException(`Facture ${saleInvoiceId} introuvable`);
    }
    if (invoice.deletedAt) {
      throw new BadRequestException('Facture déjà annulée');
    }
    if (invoice.payments.length > 0) {
      throw new BadRequestException(
        `Impossible : ${invoice.payments.length} paiement(s) enregistré(s). Supprimez d'abord les paiements.`,
      );
    }
    if (invoice.creditNotes.length > 0) {
      throw new BadRequestException(
        `Impossible : ${invoice.creditNotes.length} avoir(s) lié(s) à cette facture.`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Pour chaque ligne, créer un mouvement d'ajustement (+ quantité) qui réintègre le stock
      for (const item of invoice.items) {
        await tx.finishedStockMovement.create({
          data: {
            finishedProductId: item.finishedProductId,
            lotId: item.finishedLotId,
            type: FinishedStockMovementType.ADJUSTMENT,
            quantity: item.quantity,
            referenceType: StockReferenceType.SALE_INVOICE,
            referenceId: invoice.id,
            reason: `Annulation facture ${invoice.reference} : ${reason}`,
            createdById: userId,
          },
        });
        await tx.finishedProduct.update({
          where: { id: item.finishedProductId },
          data: { currentStock: { increment: item.quantity } },
        });
        // Si on a tracé le lot, on réincrémente sa qty restante
        if (item.finishedLotId) {
          await tx.finishedProductLot.update({
            where: { id: item.finishedLotId },
            data: {
              remainingQuantity: { increment: item.quantity },
              status: LotStatus.ACTIVE, // au cas où il était DEPLETED
            },
          });
        }
      }

      // Si liée à une commande client, ajuster la quantité livrée (décrément)
      if (invoice.customerOrderId) {
        for (const item of invoice.items) {
          await tx.customerOrderItem.updateMany({
            where: {
              customerOrderId: invoice.customerOrderId,
              finishedProductId: item.finishedProductId,
            },
            data: { quantityDelivered: { decrement: item.quantity } },
          });
        }
      }

      // Soft-delete de la facture
      await tx.saleInvoice.update({
        where: { id: saleInvoiceId },
        data: {
          deletedAt: new Date(),
          deletedReason: reason.trim(),
        },
      });

      this.logger.warn(
        `Facture ${invoice.reference} annulée par user ${userId} — motif : ${reason}`,
      );
      return { message: 'Facture annulée — stock réintégré', invoiceId: saleInvoiceId };
    });
  }
}
