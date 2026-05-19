import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CustomerType, CustomerPriceCategory, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { paginate, PaginatedResult, PaginationDto } from '../common/dto/pagination.dto';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCustomerDto) {
    return this.prisma.customer.create({ data: dto });
  }

  async findAll(filters: {
    page: number;
    limit: number;
    search?: string;
    type?: CustomerType;
    priceCategory?: CustomerPriceCategory;
    isActive?: boolean;
  }) {
    const where: Prisma.CustomerWhereInput = {};
    if (filters.search) where.name = { contains: filters.search, mode: 'insensitive' };
    if (filters.type) where.type = filters.type;
    if (filters.priceCategory) where.priceCategory = filters.priceCategory;
    if (typeof filters.isActive === 'boolean') where.isActive = filters.isActive;

    const skip = (filters.page - 1) * filters.limit;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        skip,
        take: filters.limit,
        orderBy: { name: 'asc' },
      }),
      this.prisma.customer.count({ where }),
    ]);

    return paginate(items, total, filters.page, filters.limit);
  }

  async findOneRaw(id: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) {
      throw new NotFoundException(`Client ${id} introuvable`);
    }
    return customer;
  }

  async findOne(id: string) {
    const customer = await this.findOneRaw(id);

    const [invoiceCount, totalsAgg, debtAgg, volumeAgg] = await this.prisma.$transaction([
      this.prisma.saleInvoice.count({ where: { customerId: id } }),
      this.prisma.saleInvoice.aggregate({
        where: { customerId: id },
        _sum: { totalAmount: true },
      }),
      this.prisma.saleInvoice.aggregate({
        where: { customerId: id, paymentStatus: { in: ['UNPAID', 'PARTIALLY_PAID'] } },
        _sum: { amountRemaining: true },
      }),
      this.prisma.saleInvoiceItem.aggregate({
        where: { saleInvoice: { customerId: id } },
        _sum: { quantity: true },
      }),
    ]);

    return {
      ...customer,
      stats: {
        invoiceCount,
        revenue: totalsAgg._sum.totalAmount ?? 0,
        receivablesBalance: debtAgg._sum.amountRemaining ?? 0,
        volumeSold: Number(volumeAgg._sum.quantity ?? 0),
      },
    };
  }

  async update(id: string, dto: Partial<CreateCustomerDto>) {
    await this.findOneRaw(id);
    return this.prisma.customer.update({ where: { id }, data: dto });
  }

  async deactivate(id: string) {
    await this.findOneRaw(id);
    return this.prisma.customer.update({ where: { id }, data: { isActive: false } });
  }

  async activate(id: string) {
    await this.findOneRaw(id);
    return this.prisma.customer.update({ where: { id }, data: { isActive: true } });
  }

  async remove(id: string) {
    const invoiceCount = await this.prisma.saleInvoice.count({ where: { customerId: id } });
    if (invoiceCount > 0) {
      throw new ConflictException(
        'Impossible de supprimer un client avec des factures. Désactivez-le.',
      );
    }
    await this.prisma.customer.delete({ where: { id } });
    return { message: 'Client supprimé' };
  }

  async getInvoices(id: string, pagination: PaginationDto): Promise<PaginatedResult<unknown>> {
    await this.findOneRaw(id);
    const where = { customerId: id };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.saleInvoice.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { invoiceDate: 'desc' },
      }),
      this.prisma.saleInvoice.count({ where }),
    ]);
    return paginate(items, total, pagination.page, pagination.limit);
  }

  async getPayments(id: string, pagination: PaginationDto): Promise<PaginatedResult<unknown>> {
    await this.findOneRaw(id);
    const where = { saleInvoice: { customerId: id } };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.customerPayment.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { paymentDate: 'desc' },
        include: {
          saleInvoice: { select: { reference: true } },
        },
      }),
      this.prisma.customerPayment.count({ where }),
    ]);
    return paginate(items, total, pagination.page, pagination.limit);
  }
}
