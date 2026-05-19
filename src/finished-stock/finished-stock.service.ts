import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  FinishedLotSource,
  FinishedStockMovementType,
  LotStatus,
  Prisma,
  StockReferenceType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateFinishedLotParams {
  finishedProductId: string;
  lotNumber: string;
  source: FinishedLotSource;
  productionOrderId?: string;
  quantity: number;
  manufactureDate: Date;
  expirationDate?: Date | null;
  unitCost: number;
  movementType: FinishedStockMovementType;
  referenceType?: StockReferenceType;
  referenceId?: string;
  userId: string;
}

export interface ConsumeFinishedStockParams {
  finishedProductId: string;
  quantity: number;
  movementType: FinishedStockMovementType;
  referenceType?: StockReferenceType;
  referenceId?: string;
  reason?: string;
  movementDate?: Date;
  userId: string;
}

export interface ConsumedFinishedLotEntry {
  lotId: string;
  lotNumber: string;
  quantity: number;
  unitCost: number;
  cost: number;
}

export interface ConsumeFinishedStockResult {
  consumedLots: ConsumedFinishedLotEntry[];
  totalQuantity: number;
  totalCost: number;
}

@Injectable()
export class FinishedStockService {
  private readonly logger = new Logger(FinishedStockService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Crée un lot de produit fini (depuis production ou élevage) :
   * - création du lot
   * - mouvement d'entrée
   * - MAJ stock courant + recalcul coût de revient moyen pondéré
   * À appeler dans une transaction Prisma.
   */
  async createLot(tx: Prisma.TransactionClient, params: CreateFinishedLotParams) {
    const product = await tx.finishedProduct.findUnique({
      where: { id: params.finishedProductId },
    });
    if (!product) {
      throw new NotFoundException(`Produit fini ${params.finishedProductId} introuvable`);
    }

    const lot = await tx.finishedProductLot.create({
      data: {
        lotNumber: params.lotNumber,
        finishedProductId: params.finishedProductId,
        source: params.source,
        productionOrderId: params.productionOrderId,
        initialQuantity: params.quantity,
        remainingQuantity: params.quantity,
        manufactureDate: params.manufactureDate,
        expirationDate: params.expirationDate ?? null,
        unitCost: params.unitCost,
        status: LotStatus.ACTIVE,
      },
    });

    await tx.finishedStockMovement.create({
      data: {
        finishedProductId: params.finishedProductId,
        lotId: lot.id,
        type: params.movementType,
        quantity: params.quantity,
        movementDate: params.manufactureDate,
        referenceType: params.referenceType,
        referenceId: params.referenceId,
        createdById: params.userId,
      },
    });

    // Recalcul coût de revient moyen pondéré
    const oldStock = Number(product.currentStock);
    const oldAvg = product.averageCost;
    const newQty = Number(params.quantity);
    const newAvg =
      oldStock + newQty > 0
        ? Math.round((oldStock * oldAvg + newQty * params.unitCost) / (oldStock + newQty))
        : params.unitCost;

    await tx.finishedProduct.update({
      where: { id: params.finishedProductId },
      data: {
        currentStock: { increment: params.quantity },
        averageCost: newAvg,
      },
    });

    return lot;
  }

  /**
   * Consomme une quantité de stock produit fini en FIFO.
   * À appeler dans une transaction Prisma.
   */
  async consumeFinishedStock(
    tx: Prisma.TransactionClient,
    params: ConsumeFinishedStockParams,
  ): Promise<ConsumeFinishedStockResult> {
    if (params.quantity <= 0) {
      throw new BadRequestException('La quantité à consommer doit être positive');
    }
    if (
      (params.movementType === FinishedStockMovementType.LOSS ||
        params.movementType === FinishedStockMovementType.ADJUSTMENT) &&
      !params.reason
    ) {
      throw new BadRequestException(
        `Un motif est obligatoire pour les mouvements de type ${params.movementType}`,
      );
    }

    const product = await tx.finishedProduct.findUnique({
      where: { id: params.finishedProductId },
    });
    if (!product) {
      throw new NotFoundException(`Produit fini ${params.finishedProductId} introuvable`);
    }

    const currentStock = Number(product.currentStock);
    if (currentStock < params.quantity) {
      throw new BadRequestException(
        `Stock insuffisant pour ${product.name} : disponible ${currentStock}, demandé ${params.quantity}`,
      );
    }

    const activeLots = await tx.finishedProductLot.findMany({
      where: {
        finishedProductId: params.finishedProductId,
        status: LotStatus.ACTIVE,
        remainingQuantity: { gt: 0 },
      },
      orderBy: [{ manufactureDate: 'asc' }, { createdAt: 'asc' }],
    });

    let remaining = params.quantity;
    const consumedLots: ConsumedFinishedLotEntry[] = [];
    const movementDate = params.movementDate ?? new Date();

    for (const lot of activeLots) {
      if (remaining <= 0) break;
      const available = Number(lot.remainingQuantity);
      const take = Math.min(available, remaining);
      const newRemaining = available - take;

      await tx.finishedProductLot.update({
        where: { id: lot.id },
        data: {
          remainingQuantity: newRemaining,
          status: newRemaining <= 0 ? LotStatus.DEPLETED : LotStatus.ACTIVE,
        },
      });

      await tx.finishedStockMovement.create({
        data: {
          finishedProductId: params.finishedProductId,
          lotId: lot.id,
          type: params.movementType,
          quantity: -take,
          movementDate,
          referenceType: params.referenceType,
          referenceId: params.referenceId,
          reason: params.reason,
          createdById: params.userId,
        },
      });

      consumedLots.push({
        lotId: lot.id,
        lotNumber: lot.lotNumber,
        quantity: take,
        unitCost: lot.unitCost,
        cost: Math.round(take * lot.unitCost),
      });

      remaining -= take;
    }

    if (remaining > 0) {
      throw new BadRequestException(
        `Stock insuffisant en lots actifs pour ${product.name} : reste ${remaining} à consommer`,
      );
    }

    await tx.finishedProduct.update({
      where: { id: params.finishedProductId },
      data: { currentStock: { decrement: params.quantity } },
    });

    const totalCost = consumedLots.reduce((sum, l) => sum + l.cost, 0);

    const updated = await tx.finishedProduct.findUnique({
      where: { id: params.finishedProductId },
      select: { currentStock: true, alertThreshold: true, name: true },
    });
    if (
      updated &&
      Number(updated.currentStock) < Number(updated.alertThreshold)
    ) {
      this.logger.warn(
        `⚠️ Stock PF bas — ${updated.name} : ${updated.currentStock} (seuil ${updated.alertThreshold})`,
      );
    }

    return { consumedLots, totalQuantity: params.quantity, totalCost };
  }

  /**
   * Ajustement manuel de stock PF (pour inventaire des produits finis).
   */
  async adjustFinishedStock(
    tx: Prisma.TransactionClient,
    finishedProductId: string,
    delta: number,
    referenceId: string,
    userId: string,
    reason: string,
  ) {
    if (delta === 0) return;

    if (delta > 0) {
      const product = await tx.finishedProduct.findUnique({ where: { id: finishedProductId } });
      if (!product) {
        throw new NotFoundException(`Produit fini ${finishedProductId} introuvable`);
      }

      const adjLotNumber = `ADJ-PF-${finishedProductId.slice(0, 8)}-${Date.now()}`;
      const lot = await tx.finishedProductLot.create({
        data: {
          lotNumber: adjLotNumber,
          finishedProductId,
          source: FinishedLotSource.PRODUCTION,
          initialQuantity: delta,
          remainingQuantity: delta,
          manufactureDate: new Date(),
          unitCost: product.averageCost,
          status: LotStatus.ACTIVE,
        },
      });

      await tx.finishedStockMovement.create({
        data: {
          finishedProductId,
          lotId: lot.id,
          type: FinishedStockMovementType.ADJUSTMENT,
          quantity: delta,
          referenceType: StockReferenceType.INVENTORY,
          referenceId,
          reason,
          createdById: userId,
        },
      });

      await tx.finishedProduct.update({
        where: { id: finishedProductId },
        data: { currentStock: { increment: delta } },
      });
    } else {
      await this.consumeFinishedStock(tx, {
        finishedProductId,
        quantity: Math.abs(delta),
        movementType: FinishedStockMovementType.ADJUSTMENT,
        referenceType: StockReferenceType.INVENTORY,
        referenceId,
        reason,
        userId,
      });
    }
  }
}
