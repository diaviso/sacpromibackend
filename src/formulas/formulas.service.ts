import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFormulaDto } from './dto/create-formula.dto';
import { UpdateFormulaDto } from './dto/update-formula.dto';

@Injectable()
export class FormulasService {
  constructor(private readonly prisma: PrismaService) {}

  /** Calcule le coût matières estimé d'une formule à partir des prix moyens actuels. */
  private async computeMaterialsCost(formulaId: string): Promise<number> {
    const formula = await this.prisma.formula.findUnique({
      where: { id: formulaId },
      include: {
        items: {
          include: { rawMaterial: { select: { averagePrice: true } } },
        },
      },
    });
    if (!formula) return 0;

    return formula.items.reduce(
      (sum, item) => sum + Math.round(Number(item.quantity) * item.rawMaterial.averagePrice),
      0,
    );
  }

  private computeProportions(items: { quantity: number }[]): number[] {
    const total = items.reduce((s, it) => s + it.quantity, 0);
    if (total === 0) return items.map(() => 0);
    return items.map((it) => Math.round((it.quantity / total) * 10000) / 100);
  }

  async create(dto: CreateFormulaDto) {
    const product = await this.prisma.finishedProduct.findUnique({
      where: { id: dto.finishedProductId },
    });
    if (!product) {
      throw new BadRequestException('Produit fini introuvable');
    }

    const materialIds = Array.from(new Set(dto.items.map((it) => it.rawMaterialId)));
    const materials = await this.prisma.rawMaterial.findMany({
      where: { id: { in: materialIds } },
    });
    if (materials.length !== materialIds.length) {
      throw new BadRequestException('Une ou plusieurs matières premières sont introuvables');
    }

    const proportions = this.computeProportions(dto.items.map((it) => ({ quantity: it.quantity })));

    return this.prisma.$transaction(async (tx) => {
      // Si une autre formule active existe pour ce produit, la désactiver si on demande l'activation
      if (dto.isActive) {
        await tx.formula.updateMany({
          where: { finishedProductId: dto.finishedProductId, isActive: true },
          data: { isActive: false },
        });
      }

      // Calculer la prochaine version
      const last = await tx.formula.findFirst({
        where: { finishedProductId: dto.finishedProductId },
        orderBy: { version: 'desc' },
      });
      const version = (last?.version ?? 0) + 1;

      return tx.formula.create({
        data: {
          finishedProductId: dto.finishedProductId,
          name: dto.name,
          version,
          productionUnit: dto.productionUnit,
          unitWeightKg: dto.unitWeightKg,
          isActive: dto.isActive ?? false,
          technicalNote: dto.technicalNote,
          items: {
            create: dto.items.map((it, i) => ({
              rawMaterialId: it.rawMaterialId,
              quantity: it.quantity,
              proportion: proportions[i],
            })),
          },
        },
        include: {
          items: { include: { rawMaterial: { select: { id: true, code: true, name: true, averagePrice: true } } } },
          finishedProduct: { select: { id: true, code: true, name: true } },
        },
      });
    });
  }

  async findAll(filters: { finishedProductId?: string; isActive?: boolean }) {
    const where: Prisma.FormulaWhereInput = {};
    if (filters.finishedProductId) where.finishedProductId = filters.finishedProductId;
    if (typeof filters.isActive === 'boolean') where.isActive = filters.isActive;

    return this.prisma.formula.findMany({
      where,
      orderBy: [{ finishedProductId: 'asc' }, { version: 'desc' }],
      include: {
        finishedProduct: { select: { id: true, code: true, name: true } },
        _count: { select: { items: true } },
      },
    });
  }

  async findOne(id: string) {
    const formula = await this.prisma.formula.findUnique({
      where: { id },
      include: {
        finishedProduct: { select: { id: true, code: true, name: true, unit: true } },
        items: {
          include: {
            rawMaterial: {
              select: { id: true, code: true, name: true, unit: true, averagePrice: true, currentStock: true },
            },
          },
        },
      },
    });
    if (!formula) {
      throw new NotFoundException(`Formule ${id} introuvable`);
    }

    const estimatedMaterialsCost = formula.items.reduce(
      (sum, item) => sum + Math.round(Number(item.quantity) * item.rawMaterial.averagePrice),
      0,
    );

    return { ...formula, estimatedMaterialsCost };
  }

  async update(id: string, dto: UpdateFormulaDto) {
    const existing = await this.findOne(id);

    return this.prisma.$transaction(async (tx) => {
      // Archive l'existante en désactivant + crée une nouvelle version
      await tx.formula.update({ where: { id }, data: { isActive: false } });

      const last = await tx.formula.findFirst({
        where: { finishedProductId: existing.finishedProductId },
        orderBy: { version: 'desc' },
      });
      const version = (last?.version ?? 0) + 1;

      const itemsInput =
        dto.items ??
        existing.items.map((it) => ({ rawMaterialId: it.rawMaterialId, quantity: Number(it.quantity) }));
      const proportions = this.computeProportions(
        itemsInput.map((it) => ({ quantity: Number(it.quantity) })),
      );

      // Si on demande l'activation, désactiver les autres
      if (dto.isActive) {
        await tx.formula.updateMany({
          where: { finishedProductId: existing.finishedProductId, isActive: true },
          data: { isActive: false },
        });
      }

      return tx.formula.create({
        data: {
          finishedProductId: existing.finishedProductId,
          name: dto.name ?? existing.name,
          version,
          productionUnit: dto.productionUnit ?? existing.productionUnit,
          unitWeightKg: dto.unitWeightKg ?? Number(existing.unitWeightKg),
          isActive: dto.isActive ?? false,
          technicalNote: dto.technicalNote ?? existing.technicalNote ?? null,
          items: {
            create: itemsInput.map((it, i) => ({
              rawMaterialId: it.rawMaterialId,
              quantity: Number(it.quantity),
              proportion: proportions[i],
            })),
          },
        },
        include: {
          items: { include: { rawMaterial: { select: { id: true, code: true, name: true } } } },
          finishedProduct: { select: { id: true, code: true, name: true } },
        },
      });
    });
  }

  async activate(id: string) {
    const formula = await this.prisma.formula.findUnique({ where: { id } });
    if (!formula) {
      throw new NotFoundException(`Formule ${id} introuvable`);
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.formula.updateMany({
        where: { finishedProductId: formula.finishedProductId, id: { not: id }, isActive: true },
        data: { isActive: false },
      });
      return tx.formula.update({ where: { id }, data: { isActive: true } });
    });
  }

  async remove(id: string) {
    const formula = await this.prisma.formula.findUnique({ where: { id } });
    if (!formula) {
      throw new NotFoundException(`Formule ${id} introuvable`);
    }
    if (formula.isActive) {
      throw new BadRequestException(
        'Impossible de supprimer une formule active. Désactivez-la d’abord.',
      );
    }
    const usedCount = await this.prisma.productionOrder.count({ where: { formulaId: id } });
    if (usedCount > 0) {
      throw new BadRequestException(
        `Cette formule a déjà été utilisée dans ${usedCount} ordre(s) de production. Suppression interdite.`,
      );
    }
    await this.prisma.formula.delete({ where: { id } });
    return { message: 'Formule supprimée' };
  }
}
