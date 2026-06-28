import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PurchaseOrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../common/services/sequence.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto';
import { CancelPurchaseOrderDto } from './dto/cancel-purchase-order.dto';
import { QueryPurchaseOrdersDto } from './dto/query-purchase-orders.dto';
import { paginate } from '../common/dto/pagination.dto';

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: SequenceService,
  ) {}

  private ensureNoDuplicateMaterials(items: { rawMaterialId: string }[]) {
    const seen = new Set<string>();
    for (const item of items) {
      if (seen.has(item.rawMaterialId)) {
        throw new BadRequestException(
          'Un bon de commande ne peut pas contenir deux lignes pour la meme matiere premiere',
        );
      }
      seen.add(item.rawMaterialId);
    }
  }

  private async ensureOrderMaterialsExist(
    tx: Prisma.TransactionClient,
    items: { rawMaterialId: string }[],
  ) {
    this.ensureNoDuplicateMaterials(items);

    const materialIds = items.map((item) => item.rawMaterialId);
    const materials = await tx.rawMaterial.findMany({
      where: { id: { in: materialIds } },
      select: { id: true, name: true, isActive: true },
    });

    if (materials.length !== materialIds.length) {
      throw new BadRequestException(
        "Une ou plusieurs matieres premieres du bon de commande sont introuvables",
      );
    }

    const inactive = materials.filter((material) => !material.isActive);
    if (inactive.length > 0) {
      throw new BadRequestException(
        `Matieres inactives : ${inactive.map((material) => material.name).join(', ')}`,
      );
    }
  }

  private aggregateInvoiceItems(items: { rawMaterialId: string; quantity: number }[]) {
    const byMaterial = new Map<string, number>();
    for (const item of items) {
      byMaterial.set(
        item.rawMaterialId,
        (byMaterial.get(item.rawMaterialId) ?? 0) + item.quantity,
      );
    }
    return byMaterial;
  }

  private async recalculateDeliveryStatus(
    tx: Prisma.TransactionClient,
    purchaseOrderId: string,
  ) {
    const order = await tx.purchaseOrder.findUnique({
      where: { id: purchaseOrderId },
      include: { items: true },
    });
    if (!order) return;
    // Statuts terminaux : on ne bascule jamais hors de ces etats par
    // recalcul automatique. Sinon le rollback d'une reception sur un BC
    // EXPIRED le retrograde en VALIDATED — incoherent (un BC expire reste
    // expire meme si on annule une de ses receptions).
    if (
      order.status === PurchaseOrderStatus.CANCELLED ||
      order.status === PurchaseOrderStatus.CLOSED ||
      order.status === PurchaseOrderStatus.EXPIRED
    ) {
      return;
    }

    const allDelivered = order.items.every(
      (item) => Number(item.quantityDelivered) >= Number(item.quantityOrdered),
    );
    const someDelivered = order.items.some((item) => Number(item.quantityDelivered) > 0);
    const status = allDelivered
      ? PurchaseOrderStatus.DELIVERED
      : someDelivered
        ? PurchaseOrderStatus.PARTIALLY_DELIVERED
        : PurchaseOrderStatus.VALIDATED;

    if (status !== order.status) {
      await tx.purchaseOrder.update({
        where: { id: purchaseOrderId },
        data: { status },
      });
    }
  }

  private assertNoDelivery(order: Awaited<ReturnType<PurchaseOrdersService['findOne']>>) {
    const hasDelivery = order.items.some((item) => Number(item.quantityDelivered) > 0);
    if (hasDelivery) {
      throw new BadRequestException(
        "Impossible : ce bon de commande a deja des quantites receptionnees",
      );
    }
    if ((order.purchaseInvoices?.length ?? 0) > 0) {
      throw new BadRequestException(
        "Impossible : ce bon de commande est deja lie a une facture active",
      );
    }
  }

  async create(dto: CreatePurchaseOrderDto, userId: string) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id: dto.supplierId } });
    if (!supplier || !supplier.isActive) {
      throw new BadRequestException('Fournisseur introuvable ou inactif');
    }

    return this.prisma.$transaction(async (tx) => {
      await this.ensureOrderMaterialsExist(tx, dto.items);

      const orderDate = new Date(dto.orderDate);
      const reference = await this.sequence.nextReference('BC', orderDate.getFullYear(), tx);

      const totalAmount = dto.items.reduce(
        (sum, item) => sum + Math.round(item.quantityOrdered * item.unitPriceEstimate),
        0,
      );

      return tx.purchaseOrder.create({
        data: {
          reference,
          supplierId: dto.supplierId,
          orderDate,
          expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : null,
          note: dto.note,
          totalAmount,
          createdById: userId,
          items: {
            create: dto.items.map((item) => ({
              rawMaterialId: item.rawMaterialId,
              itemName: item.itemName,
              unit: item.unit,
              quantityOrdered: item.quantityOrdered,
              unitPriceEstimate: item.unitPriceEstimate,
              lineAmount: Math.round(item.quantityOrdered * item.unitPriceEstimate),
            })),
          },
        },
        include: {
          items: true,
          supplier: { select: { id: true, name: true } },
        },
      });
    });
  }

  async findAll(query: QueryPurchaseOrdersDto) {
    const where: Prisma.PurchaseOrderWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.supplierId) where.supplierId = query.supplierId;
    if (query.from || query.to) {
      where.orderDate = {};
      if (query.from) where.orderDate.gte = new Date(query.from);
      if (query.to) where.orderDate.lte = new Date(query.to);
    }

    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      where.OR = [
        { reference: { contains: term, mode: 'insensitive' } },
        { note: { contains: term, mode: 'insensitive' } },
        { supplier: { name: { contains: term, mode: 'insensitive' } } },
      ];
    }

    const sortBy = query.sortBy ?? 'orderDate';
    const sortOrder = query.sortOrder ?? 'desc';
    const orderBy: Prisma.PurchaseOrderOrderByWithRelationInput = { [sortBy]: sortOrder };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.purchaseOrder.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy,
        include: {
          supplier: { select: { id: true, name: true } },
          _count: { select: { items: true } },
        },
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);

    return paginate(items, total, query.page, query.limit);
  }

  async findOne(id: string) {
    const order = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            rawMaterial: { select: { id: true, code: true, name: true, unit: true } },
          },
        },
        supplier: true,
        createdBy: { select: { id: true, fullName: true, email: true } },
        purchaseInvoices: {
          where: { deletedAt: null },
          orderBy: { receptionDate: 'desc' },
          include: {
            items: {
              include: {
                rawMaterial: { select: { id: true, code: true, name: true, unit: true } },
              },
            },
            payments: {
              orderBy: { paymentDate: 'desc' },
              include: {
                account: { select: { id: true, name: true, type: true } },
                createdBy: { select: { id: true, fullName: true } },
              },
            },
            rawMaterialLots: {
              include: {
                rawMaterial: { select: { id: true, code: true, name: true } },
              },
            },
          },
        },
      },
    });
    if (!order) {
      throw new NotFoundException(`Bon de commande ${id} introuvable`);
    }
    return order;
  }

  /**
   * Calcule la synthese financiere d'un BC : dette estimee a la validation,
   * dette reelle generee par les receptions, encaisse, restant a payer.
   *
   * Distinction importante :
   *  - `estimatedTotalAmount` : ce que vaut le BC a sa validation (engagement
   *    pris envers le fournisseur — somme qty * prix unitaire estimatif des
   *    lignes).
   *  - `receivedAmount` : ce qui a effectivement ete receptionne via les
   *    factures fournisseur (somme PurchaseInvoice.totalAmount actives).
   *  - `paidAmount` : ce qui a deja ete encaisse au fournisseur (somme
   *    SupplierPayment.amount via les factures actives).
   *  - `remainingToReceive` = estime - receptionne (peut etre negatif si la
   *    facture finale est plus elevee que l'estimatif — l'utilisateur l'aura
   *    confirme a la reception).
   *  - `remainingToPay` = receptionne - paye.
   *  - `unbilledEstimate` = estime - receptionne (positif uniquement) =
   *    portion non encore facturee de la dette engagee.
   */
  async getPaymentSummary(id: string) {
    const order = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        totalAmount: true,
        purchaseInvoices: {
          where: { deletedAt: null },
          select: {
            totalAmount: true,
            amountPaid: true,
            amountRemaining: true,
          },
        },
      },
    });
    if (!order) throw new NotFoundException(`Bon de commande ${id} introuvable`);

    const estimatedTotalAmount = order.totalAmount;
    const receivedAmount = order.purchaseInvoices.reduce((s, i) => s + i.totalAmount, 0);
    const paidAmount = order.purchaseInvoices.reduce((s, i) => s + i.amountPaid, 0);
    const remainingToPay = order.purchaseInvoices.reduce(
      (s, i) => s + i.amountRemaining,
      0,
    );
    const unbilledEstimate = Math.max(0, estimatedTotalAmount - receivedAmount);

    return {
      estimatedTotalAmount,
      receivedAmount,
      paidAmount,
      remainingToPay,
      unbilledEstimate,
      receptionCount: order.purchaseInvoices.length,
    };
  }

  async update(id: string, dto: UpdatePurchaseOrderDto) {
    const order = await this.findOne(id);
    if (order.status !== PurchaseOrderStatus.DRAFT) {
      throw new BadRequestException(
        'Seuls les bons de commande en statut DRAFT peuvent etre modifies',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.items) {
        await this.ensureOrderMaterialsExist(tx, dto.items);
        await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } });
      }

      const totalAmount = dto.items
        ? dto.items.reduce(
            (sum, item) => sum + Math.round(item.quantityOrdered * item.unitPriceEstimate),
            0,
          )
        : order.totalAmount;

      return tx.purchaseOrder.update({
        where: { id },
        data: {
          orderDate: dto.orderDate ? new Date(dto.orderDate) : undefined,
          expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : undefined,
          note: dto.note,
          totalAmount,
          items: dto.items
            ? {
                create: dto.items.map((item) => ({
                  rawMaterialId: item.rawMaterialId,
                  itemName: item.itemName,
                  unit: item.unit,
                  quantityOrdered: item.quantityOrdered,
                  unitPriceEstimate: item.unitPriceEstimate,
                  lineAmount: Math.round(item.quantityOrdered * item.unitPriceEstimate),
                })),
              }
            : undefined,
        },
        include: { items: true, supplier: { select: { id: true, name: true } } },
      });
    });
  }

  /**
   * Validation d'un BC.
   *
   * Cette etape n'est plus un simple "feu vert administratif" :
   *  - Elle EXIGE une date de livraison attendue (expectedDate) — c'est elle
   *    qui justifie la dette engagee envers le fournisseur.
   *  - Elle stamp `validatedAt` (utile pour calcul d'expiration auto).
   *  - Comptablement, c'est le moment ou la dette ESTIMATIVE nait : le total
   *    estimatif du BC devient une dette engagee, visible dans les rapports.
   *
   * La dette definitive sera affinee a chaque reception (PurchaseInvoice).
   */
  async validate(id: string) {
    const order = await this.findOne(id);
    if (order.status !== PurchaseOrderStatus.DRAFT) {
      throw new BadRequestException('Seuls les bons de commande DRAFT peuvent etre valides');
    }
    if (!order.expectedDate) {
      throw new BadRequestException(
        "Date de livraison attendue requise pour valider le BC. Modifiez le BC pour la renseigner.",
      );
    }
    return this.prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: PurchaseOrderStatus.VALIDATED,
        validatedAt: new Date(),
      },
      include: { items: true, supplier: { select: { id: true, name: true } } },
    });
  }

  async invalidate(id: string) {
    const order = await this.findOne(id);
    if (order.status !== PurchaseOrderStatus.VALIDATED) {
      throw new BadRequestException(
        'Seuls les bons de commande valides et non receptionnes peuvent etre invalides',
      );
    }
    this.assertNoDelivery(order);

    return this.prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: PurchaseOrderStatus.DRAFT,
        validatedAt: null,
      },
      include: { items: true, supplier: { select: { id: true, name: true } } },
    });
  }

  /**
   * Cloture officiellement un BC.
   *
   * Conditions strictes :
   *   - Statut DELIVERED (toutes les lignes receptionnees)
   *   - Toutes les receptions sont entierement payees
   *     (amountRemaining = 0 sur chacune)
   *
   * La cloture transitionne DELIVERED -> CLOSED. C'est un etat terminal
   * qui marque la fin de vie du BC (engagement entierement satisfait,
   * trace conservee mais retiree du portefeuille actif).
   */
  async close(id: string) {
    const order = await this.findOne(id);
    if (order.status !== PurchaseOrderStatus.DELIVERED) {
      throw new BadRequestException(
        `Seuls les BC entierement receptionnes peuvent etre clotures (statut actuel : ${order.status})`,
      );
    }
    const unpaidReceptions = (order.purchaseInvoices ?? []).filter(
      (inv) => inv.amountRemaining > 0,
    );
    if (unpaidReceptions.length > 0) {
      const refs = unpaidReceptions.map((r) => r.reference).join(', ');
      throw new BadRequestException(
        `Impossible de cloturer : ${unpaidReceptions.length} reception(s) non solde(es) ` +
          `(${refs}). Reglez d'abord les paiements.`,
      );
    }
    return this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: PurchaseOrderStatus.CLOSED },
      include: { items: true, supplier: { select: { id: true, name: true } } },
    });
  }

  /**
   * Bascule un BC en statut EXPIRED.
   *
   * Cas d'usage : BC valide depuis longtemps qui ne sera jamais receptionne
   * (fournisseur defaillant, commande oubliee, etc.). On retire la dette
   * estimative du portefeuille actif sans le supprimer (audit conserve).
   *
   * Seuls les statuts VALIDATED ou PARTIALLY_DELIVERED peuvent expirer.
   * Si des receptions existent (PARTIALLY_DELIVERED), l'expiration solde
   * les lignes restantes (la dette definitive reste la somme des receptions
   * deja faites).
   */
  async expire(id: string, reason?: string) {
    const order = await this.findOne(id);
    if (
      order.status !== PurchaseOrderStatus.VALIDATED &&
      order.status !== PurchaseOrderStatus.PARTIALLY_DELIVERED
    ) {
      throw new BadRequestException(
        `Seuls les BC valides ou partiellement livres peuvent expirer (statut actuel : ${order.status})`,
      );
    }
    const cancelReason = reason?.trim()
      ? `Expire : ${reason.trim()}`
      : 'BC expire (aucune reception attendue)';
    return this.prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: PurchaseOrderStatus.EXPIRED,
        cancelReason,
      },
      include: { items: true, supplier: { select: { id: true, name: true } } },
    });
  }

  /**
   * Remet un BC annulé dans le circuit (CANCELLED → DRAFT).
   *
   * Le BC redevient modifiable et peut être re-validé ensuite. Le motif
   * d'annulation est effacé. Réservé aux rôles autorisés.
   * Refuse si le BC a déjà été partiellement livré (devrait être impossible
   * pour un CANCELLED, mais on garde la sécurité).
   */
  async reactivate(id: string) {
    const order = await this.findOne(id);
    if (order.status !== PurchaseOrderStatus.CANCELLED) {
      throw new BadRequestException(
        'Seuls les bons de commande annulés peuvent être remis en circuit',
      );
    }
    this.assertNoDelivery(order);

    return this.prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: PurchaseOrderStatus.DRAFT,
        cancelReason: null,
      },
      include: { items: true, supplier: { select: { id: true, name: true } } },
    });
  }

  async cancel(id: string, dto: CancelPurchaseOrderDto) {
    const order = await this.findOne(id);
    this.assertNoDelivery(order);
    if (
      order.status === PurchaseOrderStatus.DELIVERED ||
      order.status === PurchaseOrderStatus.CLOSED ||
      order.status === PurchaseOrderStatus.CANCELLED ||
      order.status === PurchaseOrderStatus.EXPIRED
    ) {
      throw new BadRequestException(`Impossible d'annuler un BC en statut ${order.status}`);
    }
    return this.prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: PurchaseOrderStatus.CANCELLED,
        cancelReason: dto.reason,
      },
    });
  }

  async remove(id: string) {
    const order = await this.findOne(id);
    this.assertNoDelivery(order);

    if (
      order.status !== PurchaseOrderStatus.DRAFT &&
      order.status !== PurchaseOrderStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'Seuls les bons de commande brouillons ou annules peuvent etre supprimes',
      );
    }

    await this.prisma.purchaseOrder.delete({ where: { id } });
    return { message: 'Bon de commande supprime', id };
  }

  async assertInvoiceMatchesOrder(
    tx: Prisma.TransactionClient,
    purchaseOrderId: string,
    supplierId: string,
    invoiceItems: { rawMaterialId: string; quantity: number }[],
  ) {
    const order = await tx.purchaseOrder.findUnique({
      where: { id: purchaseOrderId },
      include: { items: true },
    });
    if (!order) {
      throw new BadRequestException('Bon de commande introuvable');
    }
    if (order.supplierId !== supplierId) {
      throw new BadRequestException(
        "Le fournisseur de la facture ne correspond pas a celui du bon de commande",
      );
    }
    if (
      order.status !== PurchaseOrderStatus.VALIDATED &&
      order.status !== PurchaseOrderStatus.PARTIALLY_DELIVERED
    ) {
      throw new BadRequestException(
        'Seuls les bons de commande valides ou partiellement livres peuvent etre factures',
      );
    }

    const orderItemsByMaterial = new Map<string, (typeof order.items)[number]>();
    for (const item of order.items) {
      if (!item.rawMaterialId) {
        throw new BadRequestException(
          `Le bon de commande ${order.reference} contient une ligne sans matiere premiere liee`,
        );
      }
      if (orderItemsByMaterial.has(item.rawMaterialId)) {
        throw new BadRequestException(
          `Le bon de commande ${order.reference} contient plusieurs lignes pour la meme matiere premiere`,
        );
      }
      orderItemsByMaterial.set(item.rawMaterialId, item);
    }

    const invoiceQuantities = this.aggregateInvoiceItems(invoiceItems);
    for (const [rawMaterialId, invoiceQuantity] of invoiceQuantities) {
      const orderItem = orderItemsByMaterial.get(rawMaterialId);
      if (!orderItem) {
        throw new BadRequestException(
          'La facture contient une matiere premiere qui ne figure pas dans le bon de commande',
        );
      }

      const remaining = Number(orderItem.quantityOrdered) - Number(orderItem.quantityDelivered);
      if (invoiceQuantity > remaining + 0.000001) {
        throw new BadRequestException(
          `Quantite recue trop elevee pour ${orderItem.itemName}. Reste a livrer : ${remaining}`,
        );
      }
    }

    return order;
  }

  async updateDeliveryFromInvoice(
    tx: Prisma.TransactionClient,
    purchaseOrderId: string,
    invoiceItems: { rawMaterialId: string; quantity: number }[],
  ) {
    const order = await tx.purchaseOrder.findUnique({
      where: { id: purchaseOrderId },
      include: { items: true },
    });
    if (!order) return;

    const invoiceQuantities = this.aggregateInvoiceItems(invoiceItems);
    for (const [rawMaterialId, additionalDelivered] of invoiceQuantities) {
      const orderItem = order.items.find((item) => item.rawMaterialId === rawMaterialId);
      if (orderItem && additionalDelivered > 0) {
        await tx.purchaseOrderItem.update({
          where: { id: orderItem.id },
          data: {
            quantityDelivered: {
              increment: additionalDelivered,
            },
          },
        });
      }
    }

    await this.recalculateDeliveryStatus(tx, purchaseOrderId);
  }

  async rollbackDeliveryFromInvoice(
    tx: Prisma.TransactionClient,
    purchaseOrderId: string,
    invoiceItems: { rawMaterialId: string; quantity: number }[],
  ) {
    const order = await tx.purchaseOrder.findUnique({
      where: { id: purchaseOrderId },
      include: { items: true },
    });
    if (!order) return;

    const invoiceQuantities = this.aggregateInvoiceItems(invoiceItems);
    for (const [rawMaterialId, deliveredToRollback] of invoiceQuantities) {
      const orderItem = order.items.find((item) => item.rawMaterialId === rawMaterialId);
      if (orderItem && deliveredToRollback > 0) {
        await tx.purchaseOrderItem.update({
          where: { id: orderItem.id },
          data: {
            quantityDelivered: Math.max(
              0,
              Number(orderItem.quantityDelivered) - deliveredToRollback,
            ),
          },
        });
      }
    }

    await this.recalculateDeliveryStatus(tx, purchaseOrderId);
  }
}
