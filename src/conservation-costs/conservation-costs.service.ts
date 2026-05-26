import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateConservationCostDto } from './dto/create-conservation-cost.dto';
import { paginate, PaginationDto } from '../common/dto/pagination.dto';

@Injectable()
export class ConservationCostsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateConservationCostDto, userId: string) {
    const periodStart = new Date(dto.periodStart);
    const periodEnd = new Date(dto.periodEnd);
    if (periodStart > periodEnd) {
      throw new BadRequestException('La date de début doit précéder la date de fin');
    }

    return this.prisma.conservationCost.create({
      data: {
        periodStart,
        periodEnd,
        totalAmount: dto.totalAmount,
        note: dto.note,
        createdById: userId,
      },
    });
  }

  async findAll(
    pagination: PaginationDto,
    filters: {
      from?: string;
      to?: string;
      search?: string;
      sortBy?: 'periodStart' | 'totalAmount';
      sortOrder?: 'asc' | 'desc';
    } = {},
  ) {
    const where: Prisma.ConservationCostWhereInput = {};
    if (filters.from || filters.to) {
      where.periodStart = {};
      if (filters.from) where.periodStart.gte = new Date(filters.from);
      if (filters.to) where.periodStart.lte = new Date(filters.to);
    }

    if (filters.search && filters.search.trim()) {
      const term = filters.search.trim();
      where.OR = [{ note: { contains: term, mode: 'insensitive' } }];
    }

    const sortBy = filters.sortBy ?? 'periodStart';
    const sortOrder = filters.sortOrder ?? 'desc';
    const orderBy: Prisma.ConservationCostOrderByWithRelationInput = { [sortBy]: sortOrder };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.conservationCost.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy,
        include: { createdBy: { select: { id: true, fullName: true } } },
      }),
      this.prisma.conservationCost.count({ where }),
    ]);

    return paginate(items, total, pagination.page, pagination.limit);
  }

  async findOne(id: string) {
    const cost = await this.prisma.conservationCost.findUnique({
      where: { id },
      include: { createdBy: { select: { id: true, fullName: true } } },
    });
    if (!cost) {
      throw new NotFoundException(`Coût de conservation ${id} introuvable`);
    }
    return cost;
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.conservationCost.delete({ where: { id } });
    return { message: 'Coût de conservation supprimé' };
  }

  /**
   * Allocation du coût de conservation sur une période.
   * Réparti au prorata du stock courant des matières actives au moment de l'appel.
   * Retourne la répartition (utile pour intégration future en coût de revient).
   */
  async allocate(id: string) {
    const cost = await this.findOne(id);

    const materials = await this.prisma.rawMaterial.findMany({
      where: { isActive: true, currentStock: { gt: 0 } },
      select: { id: true, name: true, currentStock: true },
    });

    const totalStock = materials.reduce((sum, m) => sum + Number(m.currentStock), 0);
    if (totalStock === 0) {
      return { cost, allocations: [], totalStock: 0 };
    }

    const allocations = materials.map((m) => {
      const stockNum = Number(m.currentStock);
      const share = stockNum / totalStock;
      return {
        rawMaterialId: m.id,
        rawMaterialName: m.name,
        currentStock: stockNum,
        sharePercent: Math.round(share * 10000) / 100,
        allocatedAmount: Math.round(cost.totalAmount * share),
      };
    });

    return { cost, allocations, totalStock };
  }
}
