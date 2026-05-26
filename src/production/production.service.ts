import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  FinishedLotSource,
  FinishedStockMovementType,
  Prisma,
  ProductionOrderStatus,
  RawStockMovementType,
  StockReferenceType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../common/services/sequence.service';
import { RawStockService } from '../raw-stock/raw-stock.service';
import { FinishedStockService } from '../finished-stock/finished-stock.service';
import { CreateProductionOrderDto } from './dto/create-production-order.dto';
import { CompleteProductionDto } from './dto/complete-production.dto';
import { CancelProductionDto } from './dto/cancel-production.dto';
import { QueryProductionOrdersDto } from './dto/query-production.dto';
import { paginate } from '../common/dto/pagination.dto';

@Injectable()
export class ProductionService {
  private readonly logger = new Logger(ProductionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: SequenceService,
    private readonly rawStockService: RawStockService,
    private readonly finishedStockService: FinishedStockService,
  ) {}

  async create(dto: CreateProductionOrderDto, userId: string) {
    const formula = await this.prisma.formula.findUnique({
      where: { id: dto.formulaId },
      include: {
        finishedProduct: { select: { id: true, isActive: true } },
        items: { include: { rawMaterial: { select: { id: true, name: true, currentStock: true } } } },
      },
    });
    if (!formula) {
      throw new NotFoundException('Formule introuvable');
    }
    if (!formula.finishedProduct.isActive) {
      throw new BadRequestException('Le produit fini est inactif');
    }

    // Calcul des matières nécessaires + warning si stock insuffisant
    const shortages: Array<{ rawMaterialId: string; rawMaterialName: string; needed: number; available: number; missing: number }> = [];
    for (const item of formula.items) {
      const needed = Number(item.quantity) * dto.targetQuantity;
      const available = Number(item.rawMaterial.currentStock);
      if (available < needed) {
        shortages.push({
          rawMaterialId: item.rawMaterial.id,
          rawMaterialName: item.rawMaterial.name,
          needed,
          available,
          missing: needed - available,
        });
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const productionDate = new Date(dto.productionDate);
      const reference = await this.sequence.nextReference('OP', productionDate.getFullYear(), tx);

      const order = await tx.productionOrder.create({
        data: {
          reference,
          formulaId: dto.formulaId,
          finishedProductId: formula.finishedProductId,
          targetQuantity: dto.targetQuantity,
          productionDate,
          expirationDate: dto.expirationDate ? new Date(dto.expirationDate) : null,
          status: ProductionOrderStatus.PLANNED,
          note: dto.note,
          createdById: userId,
        },
        include: {
          formula: true,
          finishedProduct: { select: { id: true, code: true, name: true } },
        },
      });

      return { ...order, shortages };
    });
  }

  async findAll(query: QueryProductionOrdersDto) {
    const where: Prisma.ProductionOrderWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.finishedProductId) where.finishedProductId = query.finishedProductId;
    if (query.from || query.to) {
      where.productionDate = {};
      if (query.from) where.productionDate.gte = new Date(query.from);
      if (query.to) where.productionDate.lte = new Date(query.to);
    }
    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      where.OR = [
        { reference: { contains: term, mode: 'insensitive' } },
        { note: { contains: term, mode: 'insensitive' } },
        { finishedProduct: { name: { contains: term, mode: 'insensitive' } } },
      ];
    }

    const sortBy = query.sortBy ?? 'productionDate';
    const sortOrder = query.sortOrder ?? 'desc';
    const orderBy: Prisma.ProductionOrderOrderByWithRelationInput = { [sortBy]: sortOrder };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.productionOrder.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy,
        include: {
          finishedProduct: { select: { id: true, code: true, name: true, unit: true } },
          formula: { select: { id: true, name: true, version: true, productionUnit: true } },
        },
      }),
      this.prisma.productionOrder.count({ where }),
    ]);

    return paginate(items, total, query.page, query.limit);
  }

  async findOne(id: string) {
    const order = await this.prisma.productionOrder.findUnique({
      where: { id },
      include: {
        formula: {
          include: {
            items: { include: { rawMaterial: { select: { id: true, code: true, name: true, unit: true, currentStock: true } } } },
          },
        },
        finishedProduct: true,
        createdBy: { select: { id: true, fullName: true, email: true } },
        lots: true,
      },
    });
    if (!order) {
      throw new NotFoundException(`Ordre de production ${id} introuvable`);
    }
    return order;
  }

  async start(id: string) {
    const order = await this.findOne(id);
    if (order.status !== ProductionOrderStatus.PLANNED) {
      throw new BadRequestException(
        `Seuls les ordres en statut PLANNED peuvent être démarrés (actuel : ${order.status})`,
      );
    }
    return this.prisma.productionOrder.update({
      where: { id },
      data: { status: ProductionOrderStatus.IN_PROGRESS },
    });
  }

  async complete(id: string, dto: CompleteProductionDto, userId: string) {
    const order = await this.findOne(id);
    if (
      order.status !== ProductionOrderStatus.PLANNED &&
      order.status !== ProductionOrderStatus.IN_PROGRESS
    ) {
      throw new BadRequestException(
        `Seuls les ordres PLANNED ou IN_PROGRESS peuvent être clôturés (actuel : ${order.status})`,
      );
    }

    const formula = order.formula;
    const ratio = dto.producedQuantity / Number(order.targetQuantity);

    return this.prisma.$transaction(async (tx) => {
      // Consommer chaque matière de la formule (ratio ajusté à la quantité réellement produite)
      let totalMaterialsCost = 0;
      for (const item of formula.items) {
        const formulaQty = Number(item.quantity);
        const consumeQty = formulaQty * dto.producedQuantity;
        const result = await this.rawStockService.consumeStock(tx, {
          rawMaterialId: item.rawMaterialId,
          quantity: consumeQty,
          movementType: RawStockMovementType.EXIT_PRODUCTION,
          referenceType: StockReferenceType.PRODUCTION_ORDER,
          referenceId: order.id,
          userId,
        });
        totalMaterialsCost += result.totalCost;
      }

      const totalCost = totalMaterialsCost + dto.transformationCost;
      const unitCost = dto.producedQuantity > 0 ? Math.round(totalCost / dto.producedQuantity) : 0;
      const productionLoss =
        Number(order.targetQuantity) > dto.producedQuantity
          ? Number(order.targetQuantity) - dto.producedQuantity
          : 0;

      // Créer le lot PF + entrée stock + recalcul prix moyen
      const lotNumber = `${order.reference}-L01`;
      await this.finishedStockService.createLot(tx, {
        finishedProductId: order.finishedProductId,
        lotNumber,
        source: FinishedLotSource.PRODUCTION,
        productionOrderId: order.id,
        quantity: dto.producedQuantity,
        manufactureDate: order.productionDate,
        expirationDate: dto.expirationDate
          ? new Date(dto.expirationDate)
          : order.expirationDate,
        unitCost,
        movementType: FinishedStockMovementType.ENTRY_PRODUCTION,
        referenceType: StockReferenceType.PRODUCTION_ORDER,
        referenceId: order.id,
        userId,
      });

      return tx.productionOrder.update({
        where: { id },
        data: {
          status: ProductionOrderStatus.COMPLETED,
          producedQuantity: dto.producedQuantity,
          productionLoss,
          totalMaterialsCost,
          transformationCost: dto.transformationCost,
          totalCost,
          unitCost,
          expirationDate: dto.expirationDate ? new Date(dto.expirationDate) : order.expirationDate,
        },
        include: {
          finishedProduct: { select: { id: true, code: true, name: true, unit: true } },
          formula: { select: { id: true, name: true, version: true } },
          lots: true,
        },
      });
    });
  }

  async cancel(id: string, dto: CancelProductionDto) {
    const order = await this.findOne(id);
    if (
      order.status === ProductionOrderStatus.COMPLETED ||
      order.status === ProductionOrderStatus.CANCELLED
    ) {
      throw new BadRequestException(
        `Impossible d'annuler un ordre en statut ${order.status}`,
      );
    }
    // L'annulation ici suppose qu'aucune matière n'a encore été consommée
    // (la consommation a lieu uniquement à la complétion)
    return this.prisma.productionOrder.update({
      where: { id },
      data: {
        status: ProductionOrderStatus.CANCELLED,
        cancelReason: dto.reason,
      },
    });
  }
}
