import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LotStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFinishedProductDto } from './dto/create-finished-product.dto';
import { UpdateFinishedProductDto } from './dto/update-finished-product.dto';
import { QueryFinishedProductsDto } from './dto/query-finished-products.dto';
import { paginate } from '../common/dto/pagination.dto';

@Injectable()
export class FinishedProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateFinishedProductDto) {
    return this.prisma.finishedProduct.create({ data: dto });
  }

  async findAll(query: QueryFinishedProductsDto) {
    const where: Prisma.FinishedProductWhereInput = {};
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { code: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.category) where.category = query.category;
    if (typeof query.isActive === 'boolean') where.isActive = query.isActive;

    const sortBy = query.sortBy ?? 'name';
    const sortOrder = query.sortOrder ?? 'asc';
    const orderBy: Prisma.FinishedProductOrderByWithRelationInput = { [sortBy]: sortOrder };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.finishedProduct.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy,
      }),
      this.prisma.finishedProduct.count({ where }),
    ]);

    return paginate(items, total, query.page, query.limit);
  }

  async findOneRaw(id: string) {
    const product = await this.prisma.finishedProduct.findUnique({ where: { id } });
    if (!product) {
      throw new NotFoundException(`Produit fini ${id} introuvable`);
    }
    return product;
  }

  async findOne(id: string) {
    const product = await this.prisma.finishedProduct.findUnique({
      where: { id },
      include: {
        lots: {
          where: { status: LotStatus.ACTIVE },
          orderBy: { manufactureDate: 'asc' },
        },
        formulas: {
          where: { isActive: true },
          include: { items: { include: { rawMaterial: { select: { id: true, code: true, name: true } } } } },
        },
      },
    });
    if (!product) {
      throw new NotFoundException(`Produit fini ${id} introuvable`);
    }
    return product;
  }

  async update(id: string, dto: UpdateFinishedProductDto) {
    await this.findOneRaw(id);
    return this.prisma.finishedProduct.update({ where: { id }, data: dto });
  }

  async deactivate(id: string) {
    await this.findOneRaw(id);
    return this.prisma.finishedProduct.update({ where: { id }, data: { isActive: false } });
  }

  async activate(id: string) {
    await this.findOneRaw(id);
    return this.prisma.finishedProduct.update({ where: { id }, data: { isActive: true } });
  }

  async remove(id: string) {
    const lotsCount = await this.prisma.finishedProductLot.count({ where: { finishedProductId: id } });
    if (lotsCount > 0) {
      throw new ConflictException(
        'Impossible de supprimer un produit ayant des lots. Désactivez-le à la place.',
      );
    }
    await this.prisma.finishedProduct.delete({ where: { id } });
    return { message: 'Produit supprimé' };
  }

  async getLots(id: string) {
    await this.findOneRaw(id);
    return this.prisma.finishedProductLot.findMany({
      where: { finishedProductId: id },
      orderBy: { manufactureDate: 'asc' },
      include: {
        productionOrder: { select: { id: true, reference: true } },
      },
    });
  }

  async getMovements(id: string, page = 1, limit = 50) {
    await this.findOneRaw(id);
    const where: Prisma.FinishedStockMovementWhereInput = { finishedProductId: id };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.finishedStockMovement.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { movementDate: 'desc' },
        include: {
          lot: { select: { id: true, lotNumber: true } },
          createdBy: { select: { id: true, fullName: true } },
        },
      }),
      this.prisma.finishedStockMovement.count({ where }),
    ]);
    return paginate(items, total, page, limit);
  }

  async getLowStock() {
    return this.prisma.finishedProduct.findMany({
      where: {
        isActive: true,
        currentStock: { lt: this.prisma.finishedProduct.fields.alertThreshold },
      },
      orderBy: { name: 'asc' },
    });
  }

  async getExpiring(daysAhead = 7) {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() + daysAhead);

    return this.prisma.finishedProductLot.findMany({
      where: {
        status: LotStatus.ACTIVE,
        expirationDate: { not: null, lte: threshold },
        remainingQuantity: { gt: 0 },
      },
      orderBy: { expirationDate: 'asc' },
      include: {
        finishedProduct: { select: { id: true, code: true, name: true, unit: true } },
      },
    });
  }
}
