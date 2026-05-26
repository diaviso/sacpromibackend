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

  async create(dto: CreatePurchaseOrderDto, userId: string) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id: dto.supplierId } });
    if (!supplier || !supplier.isActive) {
      throw new BadRequestException('Fournisseur introuvable ou inactif');
    }

    return this.prisma.$transaction(async (tx) => {
      const orderDate = new Date(dto.orderDate);
      const reference = await this.sequence.nextReference('BC', orderDate.getFullYear(), tx);

      const totalAmount = dto.items.reduce(
        (sum, item) =>
          sum + Math.round(item.quantityOrdered * item.unitPriceEstimate),
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

    // Recherche : sur la référence du BC, le nom du fournisseur et la note
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
        items: true,
        supplier: true,
        createdBy: { select: { id: true, fullName: true, email: true } },
        purchaseInvoices: {
          select: { id: true, reference: true, totalAmount: true, paymentStatus: true },
        },
      },
    });
    if (!order) {
      throw new NotFoundException(`Bon de commande ${id} introuvable`);
    }
    return order;
  }

  async update(id: string, dto: UpdatePurchaseOrderDto) {
    const order = await this.findOne(id);
    if (order.status !== PurchaseOrderStatus.DRAFT) {
      throw new BadRequestException(
        'Seuls les bons de commande en statut DRAFT peuvent être modifiés',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.items) {
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

  async validate(id: string) {
    const order = await this.findOne(id);
    if (order.status !== PurchaseOrderStatus.DRAFT) {
      throw new BadRequestException(
        'Seuls les bons de commande DRAFT peuvent être validés',
      );
    }
    return this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: PurchaseOrderStatus.VALIDATED },
      include: { items: true },
    });
  }

  async cancel(id: string, dto: CancelPurchaseOrderDto) {
    const order = await this.findOne(id);
    if (
      order.status === PurchaseOrderStatus.DELIVERED ||
      order.status === PurchaseOrderStatus.CLOSED ||
      order.status === PurchaseOrderStatus.CANCELLED
    ) {
      throw new BadRequestException(
        `Impossible d'annuler un BC en statut ${order.status}`,
      );
    }
    return this.prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: PurchaseOrderStatus.CANCELLED,
        cancelReason: dto.reason,
      },
    });
  }

  /**
   * Met à jour les quantités livrées des lignes du BC à partir d'une facture d'achat.
   * Recalcule le statut : DELIVERED si tout livré, PARTIALLY_DELIVERED si partiel, sinon inchangé.
   * À appeler dans une transaction Prisma (depuis purchase-invoices).
   */
  async updateDeliveryFromInvoice(
    tx: Prisma.TransactionClient,
    purchaseOrderId: string,
    invoiceItems: { itemName: string; quantity: number }[],
  ) {
    const order = await tx.purchaseOrder.findUnique({
      where: { id: purchaseOrderId },
      include: { items: true },
    });
    if (!order) return;

    for (const orderItem of order.items) {
      const matching = invoiceItems.filter((it) => it.itemName === orderItem.itemName);
      const additionalDelivered = matching.reduce((sum, it) => sum + it.quantity, 0);
      if (additionalDelivered > 0) {
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

    const refreshed = await tx.purchaseOrder.findUnique({
      where: { id: purchaseOrderId },
      include: { items: true },
    });
    if (!refreshed) return;

    const allDelivered = refreshed.items.every(
      (it) => Number(it.quantityDelivered) >= Number(it.quantityOrdered),
    );
    const someDelivered = refreshed.items.some((it) => Number(it.quantityDelivered) > 0);

    let newStatus: PurchaseOrderStatus | undefined;
    if (allDelivered) {
      newStatus = PurchaseOrderStatus.DELIVERED;
    } else if (someDelivered) {
      newStatus = PurchaseOrderStatus.PARTIALLY_DELIVERED;
    }

    if (newStatus && newStatus !== refreshed.status) {
      await tx.purchaseOrder.update({
        where: { id: purchaseOrderId },
        data: { status: newStatus },
      });
    }
  }
}
