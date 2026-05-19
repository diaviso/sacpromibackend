import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InventoryStatus, InventoryType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../common/services/sequence.service';
import { RawStockService } from '../raw-stock/raw-stock.service';
import { FinishedStockService } from '../finished-stock/finished-stock.service';
import { CreateRawInventoryDto } from './dto/create-inventory.dto';
import { UpdateInventoryDto } from './dto/update-inventory.dto';
import { paginate, PaginationDto } from '../common/dto/pagination.dto';

const VARIANCE_ALERT_PERCENT = 5;

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: SequenceService,
    private readonly rawStockService: RawStockService,
    private readonly finishedStockService: FinishedStockService,
  ) {}

  async createForRawMaterials(dto: CreateRawInventoryDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const inventoryDate = dto.inventoryDate ? new Date(dto.inventoryDate) : new Date();
      const reference = await this.sequence.nextReference(
        'INV',
        inventoryDate.getFullYear(),
        tx,
      );

      // Sélection des matières à inventorier
      const where: Prisma.RawMaterialWhereInput = { isActive: true };
      if (dto.rawMaterialIds && dto.rawMaterialIds.length > 0) {
        where.id = { in: dto.rawMaterialIds };
      }
      const materials = await tx.rawMaterial.findMany({ where, orderBy: { name: 'asc' } });

      if (materials.length === 0) {
        throw new BadRequestException('Aucune matière première à inventorier');
      }

      const inventory = await tx.inventory.create({
        data: {
          reference,
          type: InventoryType.RAW_MATERIAL,
          inventoryDate,
          status: InventoryStatus.IN_PROGRESS,
          note: dto.note,
          createdById: userId,
          items: {
            create: materials.map((m) => ({
              rawMaterialId: m.id,
              theoreticalStock: m.currentStock,
            })),
          },
        },
        include: {
          items: {
            include: {
              rawMaterial: { select: { id: true, code: true, name: true, unit: true } },
            },
          },
        },
      });

      return inventory;
    });
  }

  async createForFinishedProducts(dto: CreateRawInventoryDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const inventoryDate = dto.inventoryDate ? new Date(dto.inventoryDate) : new Date();
      const reference = await this.sequence.nextReference('INV', inventoryDate.getFullYear(), tx);

      const where: Prisma.FinishedProductWhereInput = { isActive: true };
      if (dto.rawMaterialIds && dto.rawMaterialIds.length > 0) {
        where.id = { in: dto.rawMaterialIds }; // on réutilise le même DTO
      }
      const products = await tx.finishedProduct.findMany({ where, orderBy: { name: 'asc' } });

      if (products.length === 0) {
        throw new BadRequestException('Aucun produit fini à inventorier');
      }

      const inventory = await tx.inventory.create({
        data: {
          reference,
          type: InventoryType.FINISHED_PRODUCT,
          inventoryDate,
          status: InventoryStatus.IN_PROGRESS,
          note: dto.note,
          createdById: userId,
          items: {
            create: products.map((p) => ({
              finishedProductId: p.id,
              theoreticalStock: p.currentStock,
            })),
          },
        },
        include: {
          items: {
            include: {
              finishedProduct: { select: { id: true, code: true, name: true, unit: true } },
            },
          },
        },
      });

      return inventory;
    });
  }

  async findAll(pagination: PaginationDto, type?: InventoryType) {
    const where: Prisma.InventoryWhereInput = {};
    if (type) where.type = type;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.inventory.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { inventoryDate: 'desc' },
        include: {
          createdBy: { select: { id: true, fullName: true } },
          _count: { select: { items: true } },
        },
      }),
      this.prisma.inventory.count({ where }),
    ]);
    return paginate(items, total, pagination.page, pagination.limit);
  }

  async findOne(id: string) {
    const inventory = await this.prisma.inventory.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            rawMaterial: { select: { id: true, code: true, name: true, unit: true } },
            finishedProduct: { select: { id: true, code: true, name: true, unit: true } },
          },
        },
        createdBy: { select: { id: true, fullName: true, email: true } },
      },
    });
    if (!inventory) {
      throw new NotFoundException(`Inventaire ${id} introuvable`);
    }
    return inventory;
  }

  async updateActuals(id: string, dto: UpdateInventoryDto) {
    const inventory = await this.findOne(id);
    if (inventory.status === InventoryStatus.VALIDATED) {
      throw new BadRequestException(
        'Impossible de modifier un inventaire déjà validé',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      for (const dtoItem of dto.items) {
        const existing = inventory.items.find((it) => it.id === dtoItem.itemId);
        if (!existing) {
          throw new BadRequestException(
            `Ligne d'inventaire ${dtoItem.itemId} non trouvée dans cet inventaire`,
          );
        }
        const theoretical = Number(existing.theoreticalStock);
        const actual = dtoItem.actualStock;
        const variance = actual - theoretical;
        const variancePercent =
          theoretical !== 0 ? (variance / theoretical) * 100 : actual > 0 ? 100 : 0;

        await tx.inventoryItem.update({
          where: { id: dtoItem.itemId },
          data: {
            actualStock: actual,
            variance,
            variancePercent: Math.round(variancePercent * 100) / 100,
          },
        });
      }

      return tx.inventory.findUnique({
        where: { id },
        include: {
          items: {
            include: {
              rawMaterial: { select: { id: true, code: true, name: true, unit: true } },
              finishedProduct: { select: { id: true, code: true, name: true, unit: true } },
            },
          },
        },
      });
    });
  }

  async validate(id: string, userId: string) {
    const inventory = await this.findOne(id);
    if (inventory.status === InventoryStatus.VALIDATED) {
      throw new BadRequestException('Inventaire déjà validé');
    }

    const missingItems = inventory.items.filter((it) => it.actualStock === null);
    if (missingItems.length > 0) {
      throw new BadRequestException(
        `Stock réel non saisi sur ${missingItems.length} ligne(s). Saisissez toutes les valeurs avant validation.`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const significantVariances: Array<{
        materialId: string;
        materialName: string;
        variance: number;
        variancePercent: number;
      }> = [];

      for (const item of inventory.items) {
        if (item.actualStock === null) continue;
        const variance = Number(item.variance ?? 0);
        const variancePercent = Number(item.variancePercent ?? 0);

        if (variance !== 0) {
          if (item.rawMaterialId) {
            await this.rawStockService.adjustStock(
              tx,
              item.rawMaterialId,
              variance,
              id,
              userId,
              `Ajustement inventaire ${inventory.reference}`,
            );
          } else if (item.finishedProductId) {
            await this.finishedStockService.adjustFinishedStock(
              tx,
              item.finishedProductId,
              variance,
              id,
              userId,
              `Ajustement inventaire ${inventory.reference}`,
            );
          }
        }

        if (Math.abs(variancePercent) > VARIANCE_ALERT_PERCENT) {
          significantVariances.push({
            materialId: item.rawMaterialId ?? item.finishedProductId ?? '?',
            materialName: item.rawMaterial?.name ?? item.finishedProduct?.name ?? 'Inconnue',
            variance,
            variancePercent,
          });
        }
      }

      const validated = await tx.inventory.update({
        where: { id },
        data: { status: InventoryStatus.VALIDATED },
        include: {
          items: {
            include: {
              rawMaterial: { select: { id: true, code: true, name: true, unit: true } },
              finishedProduct: { select: { id: true, code: true, name: true, unit: true } },
            },
          },
        },
      });

      return { inventory: validated, significantVariances };
    });
  }
}
