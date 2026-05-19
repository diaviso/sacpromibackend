import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LotStatus, MeasurementUnit, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRawMaterialDto } from './dto/create-raw-material.dto';
import { UpdateRawMaterialDto } from './dto/update-raw-material.dto';
import { QueryRawMaterialsDto } from './dto/query-raw-materials.dto';
import { QueryMovementsDto } from './dto/query-movements.dto';
import { paginate } from '../common/dto/pagination.dto';

@Injectable()
export class RawMaterialsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateRawMaterialDto) {
    if (dto.unit === MeasurementUnit.BAG && !dto.weightPerBag) {
      throw new BadRequestException(
        "Un poids par sac (weightPerBag) est obligatoire pour l'unité BAG",
      );
    }
    return this.prisma.rawMaterial.create({ data: dto });
  }

  async findAll(query: QueryRawMaterialsDto) {
    const where: Prisma.RawMaterialWhereInput = {};
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { code: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.category) where.category = query.category;
    if (typeof query.isActive === 'boolean') where.isActive = query.isActive;

    const orderBy: Prisma.RawMaterialOrderByWithRelationInput = {};
    const sortBy = query.sortBy ?? 'name';
    const sortOrder = query.sortOrder ?? 'asc';
    (orderBy as Record<string, 'asc' | 'desc'>)[sortBy] = sortOrder;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.rawMaterial.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy,
      }),
      this.prisma.rawMaterial.count({ where }),
    ]);

    return paginate(items, total, query.page, query.limit);
  }

  async findOne(id: string) {
    const material = await this.prisma.rawMaterial.findUnique({
      where: { id },
      include: {
        lots: {
          where: { status: LotStatus.ACTIVE },
          orderBy: { receptionDate: 'asc' },
        },
      },
    });
    if (!material) {
      throw new NotFoundException(`Matière première ${id} introuvable`);
    }

    const recentPurchases = await this.prisma.purchaseInvoiceItem.findMany({
      where: { rawMaterialId: id },
      orderBy: { purchaseInvoice: { invoiceDate: 'desc' } },
      take: 10,
      include: {
        purchaseInvoice: {
          select: {
            id: true,
            reference: true,
            invoiceDate: true,
            supplier: { select: { id: true, name: true } },
          },
        },
      },
    });

    return { ...material, recentPurchases };
  }

  async findOneRaw(id: string) {
    const material = await this.prisma.rawMaterial.findUnique({ where: { id } });
    if (!material) {
      throw new NotFoundException(`Matière première ${id} introuvable`);
    }
    return material;
  }

  async update(id: string, dto: UpdateRawMaterialDto) {
    await this.findOneRaw(id);
    return this.prisma.rawMaterial.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    const lotsCount = await this.prisma.rawMaterialLot.count({ where: { rawMaterialId: id } });
    if (lotsCount > 0) {
      throw new ConflictException(
        'Impossible de supprimer une matière ayant des lots. Désactivez-la à la place.',
      );
    }
    await this.prisma.rawMaterial.delete({ where: { id } });
    return { message: 'Matière supprimée' };
  }

  async deactivate(id: string) {
    await this.findOneRaw(id);
    return this.prisma.rawMaterial.update({ where: { id }, data: { isActive: false } });
  }

  async activate(id: string) {
    await this.findOneRaw(id);
    return this.prisma.rawMaterial.update({ where: { id }, data: { isActive: true } });
  }

  async getLots(id: string) {
    await this.findOneRaw(id);
    return this.prisma.rawMaterialLot.findMany({
      where: { rawMaterialId: id },
      orderBy: { receptionDate: 'asc' },
      include: {
        supplier: { select: { id: true, name: true } },
        purchaseInvoice: { select: { id: true, reference: true } },
      },
    });
  }

  async getMovements(id: string, query: QueryMovementsDto) {
    await this.findOneRaw(id);
    const where: Prisma.RawStockMovementWhereInput = { rawMaterialId: id };
    if (query.type) where.type = query.type;
    if (query.from || query.to) {
      where.movementDate = {};
      if (query.from) where.movementDate.gte = new Date(query.from);
      if (query.to) where.movementDate.lte = new Date(query.to);
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.rawStockMovement.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: { movementDate: 'desc' },
        include: {
          lot: { select: { id: true, lotNumber: true } },
          createdBy: { select: { id: true, fullName: true } },
        },
      }),
      this.prisma.rawStockMovement.count({ where }),
    ]);

    return paginate(items, total, query.page, query.limit);
  }

  async getLowStock() {
    return this.prisma.rawMaterial.findMany({
      where: {
        isActive: true,
        currentStock: { lt: this.prisma.rawMaterial.fields.alertThreshold },
      },
      orderBy: { name: 'asc' },
    });
  }

  async getExpiring(daysAhead = 7) {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() + daysAhead);

    return this.prisma.rawMaterialLot.findMany({
      where: {
        status: LotStatus.ACTIVE,
        expirationDate: {
          not: null,
          lte: threshold,
        },
        remainingQuantity: { gt: 0 },
      },
      orderBy: { expirationDate: 'asc' },
      include: {
        rawMaterial: { select: { id: true, code: true, name: true, unit: true } },
        supplier: { select: { id: true, name: true } },
      },
    });
  }
}
