import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { QuerySuppliersDto } from './dto/query-suppliers.dto';
import { paginate, PaginatedResult, PaginationDto } from '../common/dto/pagination.dto';

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSupplierDto) {
    return this.prisma.supplier.create({ data: dto });
  }

  async findAll(query: QuerySuppliersDto) {
    const where: Prisma.SupplierWhereInput = {};
    if (query.search) {
      where.name = { contains: query.search, mode: 'insensitive' };
    }
    if (typeof query.isActive === 'boolean') {
      where.isActive = query.isActive;
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.supplier.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: { name: 'asc' },
      }),
      this.prisma.supplier.count({ where }),
    ]);

    return paginate(items, total, query.page, query.limit);
  }

  async findOneRaw(id: string) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id } });
    if (!supplier) {
      throw new NotFoundException(`Fournisseur ${id} introuvable`);
    }
    return supplier;
  }

  /**
   * Fiche fournisseur enrichie : stats (nb receptions, total receptionne,
   * dettes reelle, engagement BC).
   *
   * Tous les agregats excluent les receptions annulees (soft-delete) et
   * remontent egalement l'engagement estimatif issu des BC valides en
   * cours de reception — vue alignee avec le nouveau workflow Achats.
   */
  async findOne(id: string) {
    const supplier = await this.findOneRaw(id);

    const [receptionCount, totalsAgg, debtAgg, activeOrders] = await this.prisma.$transaction([
      this.prisma.purchaseInvoice.count({
        where: { supplierId: id, deletedAt: null },
      }),
      this.prisma.purchaseInvoice.aggregate({
        where: { supplierId: id, deletedAt: null },
        _sum: { totalAmount: true },
      }),
      this.prisma.purchaseInvoice.aggregate({
        where: {
          supplierId: id,
          paymentStatus: { in: ['UNPAID', 'PARTIALLY_PAID'] },
          deletedAt: null,
        },
        _sum: { amountRemaining: true },
      }),
      this.prisma.purchaseOrder.findMany({
        where: {
          supplierId: id,
          status: { in: ['VALIDATED', 'PARTIALLY_DELIVERED'] },
        },
        select: {
          totalAmount: true,
          purchaseInvoices: {
            where: { deletedAt: null },
            select: { totalAmount: true },
          },
        },
      }),
    ]);

    const engagedDebt = activeOrders.reduce((sum, o) => {
      const received = o.purchaseInvoices.reduce((s, i) => s + i.totalAmount, 0);
      return sum + Math.max(0, o.totalAmount - received);
    }, 0);

    return {
      ...supplier,
      stats: {
        receptionCount,
        totalReceived: totalsAgg._sum.totalAmount ?? 0,
        debtBalance: debtAgg._sum.amountRemaining ?? 0,
        engagedDebt,
        activeOrderCount: activeOrders.length,
      },
    };
  }

  async update(id: string, dto: UpdateSupplierDto) {
    await this.findOneRaw(id);
    return this.prisma.supplier.update({ where: { id }, data: dto });
  }

  async deactivate(id: string) {
    await this.findOneRaw(id);
    return this.prisma.supplier.update({ where: { id }, data: { isActive: false } });
  }

  async activate(id: string) {
    await this.findOneRaw(id);
    return this.prisma.supplier.update({ where: { id }, data: { isActive: true } });
  }

  async remove(id: string) {
    const receptionCount = await this.prisma.purchaseInvoice.count({
      where: { supplierId: id, deletedAt: null },
    });
    if (receptionCount > 0) {
      throw new ConflictException(
        'Impossible de supprimer un fournisseur ayant des réceptions. Désactivez-le à la place.',
      );
    }
    await this.prisma.supplier.delete({ where: { id } });
    return { message: 'Fournisseur supprimé' };
  }

  async getInvoices(id: string, pagination: PaginationDto): Promise<PaginatedResult<unknown>> {
    await this.findOneRaw(id);
    const where = { supplierId: id };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.purchaseInvoice.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { invoiceDate: 'desc' },
        include: { items: true },
      }),
      this.prisma.purchaseInvoice.count({ where }),
    ]);
    return paginate(items, total, pagination.page, pagination.limit);
  }

  async getPayments(id: string, pagination: PaginationDto): Promise<PaginatedResult<unknown>> {
    await this.findOneRaw(id);
    const where = { purchaseInvoice: { supplierId: id } };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.supplierPayment.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { paymentDate: 'desc' },
        include: {
          purchaseInvoice: { select: { reference: true, supplierInvoiceNumber: true } },
        },
      }),
      this.prisma.supplierPayment.count({ where }),
    ]);
    return paginate(items, total, pagination.page, pagination.limit);
  }
}
