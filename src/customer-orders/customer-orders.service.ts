import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CustomerOrderStatus, CustomerPriceCategory, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../common/services/sequence.service';
import { CreateCustomerOrderDto } from './dto/create-customer-order.dto';
import { paginate, PaginationDto } from '../common/dto/pagination.dto';

@Injectable()
export class CustomerOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: SequenceService,
  ) {}

  async create(dto: CreateCustomerOrderDto, userId: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id: dto.customerId } });
    if (!customer || !customer.isActive) {
      throw new BadRequestException('Client introuvable ou inactif');
    }

    const productIds = dto.items.map((it) => it.finishedProductId);
    const products = await this.prisma.finishedProduct.findMany({
      where: { id: { in: productIds } },
    });

    return this.prisma.$transaction(async (tx) => {
      const orderDate = new Date(dto.orderDate);
      const reference = await this.sequence.nextReference('CMD', orderDate.getFullYear(), tx);

      const itemsData = dto.items.map((it) => {
        const product = products.find((p) => p.id === it.finishedProductId);
        if (!product) {
          throw new BadRequestException(`Produit fini ${it.finishedProductId} introuvable`);
        }
        const defaultPrice =
          customer.priceCategory === CustomerPriceCategory.WHOLESALE
            ? product.wholesalePrice
            : product.retailPrice;
        const unitPrice = it.unitPrice ?? defaultPrice;
        return {
          finishedProductId: it.finishedProductId,
          quantityOrdered: it.quantityOrdered,
          unitPrice,
          lineAmount: Math.round(it.quantityOrdered * unitPrice),
        };
      });

      const totalAmount = itemsData.reduce((s, it) => s + it.lineAmount, 0);

      return tx.customerOrder.create({
        data: {
          reference,
          customerId: dto.customerId,
          orderDate,
          expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : null,
          totalAmount,
          note: dto.note,
          createdById: userId,
          items: { create: itemsData },
        },
        include: {
          customer: { select: { id: true, name: true } },
          items: { include: { finishedProduct: { select: { id: true, code: true, name: true, unit: true } } } },
        },
      });
    });
  }

  async findAll(
    query: PaginationDto,
    filters: {
      status?: CustomerOrderStatus;
      customerId?: string;
      search?: string;
      from?: string;
      to?: string;
      sortBy?: 'orderDate' | 'reference' | 'totalAmount' | 'status';
      sortOrder?: 'asc' | 'desc';
    },
  ) {
    const where: Prisma.CustomerOrderWhereInput = {};
    if (filters.status) where.status = filters.status;
    if (filters.customerId) where.customerId = filters.customerId;
    if (filters.from || filters.to) {
      where.orderDate = {};
      if (filters.from) where.orderDate.gte = new Date(filters.from);
      if (filters.to) where.orderDate.lte = new Date(filters.to);
    }
    if (filters.search && filters.search.trim()) {
      const term = filters.search.trim();
      where.OR = [
        { reference: { contains: term, mode: 'insensitive' } },
        { note: { contains: term, mode: 'insensitive' } },
        { customer: { name: { contains: term, mode: 'insensitive' } } },
      ];
    }

    const sortBy = filters.sortBy ?? 'orderDate';
    const sortOrder = filters.sortOrder ?? 'desc';
    const orderBy: Prisma.CustomerOrderOrderByWithRelationInput = { [sortBy]: sortOrder };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.customerOrder.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy,
        include: {
          customer: { select: { id: true, name: true } },
          _count: { select: { items: true } },
        },
      }),
      this.prisma.customerOrder.count({ where }),
    ]);

    return paginate(items, total, query.page, query.limit);
  }

  async findOne(id: string) {
    const order = await this.prisma.customerOrder.findUnique({
      where: { id },
      include: {
        customer: true,
        items: {
          include: {
            finishedProduct: { select: { id: true, code: true, name: true, unit: true } },
          },
        },
        invoices: {
          select: { id: true, reference: true, totalAmount: true, paymentStatus: true, type: true },
        },
        createdBy: { select: { id: true, fullName: true } },
      },
    });
    if (!order) {
      throw new NotFoundException(`Commande ${id} introuvable`);
    }
    return order;
  }

  async confirm(id: string) {
    const order = await this.findOne(id);
    if (order.status !== CustomerOrderStatus.PENDING) {
      throw new BadRequestException(
        `Seules les commandes PENDING peuvent être confirmées (actuel : ${order.status})`,
      );
    }
    return this.prisma.customerOrder.update({
      where: { id },
      data: { status: CustomerOrderStatus.CONFIRMED },
    });
  }

  /**
   * Met à jour une commande PENDING. Les lignes peuvent être remplacées,
   * les dates et le client modifiés. Refuse dès qu'une livraison existe
   * (PARTIALLY_DELIVERED, DELIVERED, etc.) — annuler et recréer dans ce cas.
   */
  async update(
    id: string,
    dto: import('./dto/update-customer-order.dto').UpdateCustomerOrderDto,
    _userId: string,
  ) {
    const order = await this.findOne(id);
    if (order.status !== CustomerOrderStatus.PENDING) {
      throw new BadRequestException(
        `Seules les commandes PENDING peuvent être modifiées (actuel : ${order.status}).`,
      );
    }
    return this.prisma.$transaction(async (tx) => {
      if (dto.items) {
        await tx.customerOrderItem.deleteMany({ where: { customerOrderId: id } });
      }
      const totalAmount = dto.items
        ? dto.items.reduce(
            (sum, it) => sum + Math.round(it.quantityOrdered * (it.unitPrice ?? 0)),
            0,
          )
        : undefined;
      return tx.customerOrder.update({
        where: { id },
        data: {
          customerId: dto.customerId ?? undefined,
          orderDate: dto.orderDate ? new Date(dto.orderDate) : undefined,
          expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : undefined,
          totalAmount,
          items: dto.items
            ? {
                create: dto.items.map((it) => ({
                  finishedProductId: it.finishedProductId,
                  quantityOrdered: it.quantityOrdered,
                  quantityDelivered: 0,
                  unitPrice: it.unitPrice ?? 0,
                  lineAmount: Math.round(it.quantityOrdered * (it.unitPrice ?? 0)),
                })),
              }
            : undefined,
        },
        include: { items: true },
      });
    });
  }

  async cancel(id: string, reason: string) {
    const order = await this.findOne(id);
    if (
      order.status === CustomerOrderStatus.DELIVERED ||
      order.status === CustomerOrderStatus.CLOSED ||
      order.status === CustomerOrderStatus.CANCELLED
    ) {
      throw new BadRequestException(
        `Impossible d'annuler une commande en statut ${order.status}`,
      );
    }
    return this.prisma.customerOrder.update({
      where: { id },
      data: { status: CustomerOrderStatus.CANCELLED, cancelReason: reason },
    });
  }

  /** À appeler dans une transaction depuis sales — met à jour quantités livrées + statut */
  async updateDeliveryFromSale(
    tx: Prisma.TransactionClient,
    customerOrderId: string,
    saleItems: { finishedProductId: string; quantity: number }[],
  ) {
    const order = await tx.customerOrder.findUnique({
      where: { id: customerOrderId },
      include: { items: true },
    });
    if (!order) return;

    for (const orderItem of order.items) {
      const matching = saleItems.filter((s) => s.finishedProductId === orderItem.finishedProductId);
      const additionalDelivered = matching.reduce((s, it) => s + it.quantity, 0);
      if (additionalDelivered > 0) {
        await tx.customerOrderItem.update({
          where: { id: orderItem.id },
          data: { quantityDelivered: { increment: additionalDelivered } },
        });
      }
    }

    const refreshed = await tx.customerOrder.findUnique({
      where: { id: customerOrderId },
      include: { items: true },
    });
    if (!refreshed) return;

    const allDelivered = refreshed.items.every(
      (it) => Number(it.quantityDelivered) >= Number(it.quantityOrdered),
    );
    const someDelivered = refreshed.items.some((it) => Number(it.quantityDelivered) > 0);

    let newStatus: CustomerOrderStatus | undefined;
    if (allDelivered) newStatus = CustomerOrderStatus.DELIVERED;
    else if (someDelivered) newStatus = CustomerOrderStatus.PARTIALLY_DELIVERED;

    if (newStatus && newStatus !== refreshed.status) {
      await tx.customerOrder.update({ where: { id: customerOrderId }, data: { status: newStatus } });
    }
  }
}
