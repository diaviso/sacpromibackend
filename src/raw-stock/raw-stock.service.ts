import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  LotStatus,
  Prisma,
  RawStockMovementType,
  StockReferenceType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface ConsumeStockParams {
  rawMaterialId: string;
  quantity: number;
  movementType: RawStockMovementType;
  referenceType?: StockReferenceType;
  referenceId?: string;
  reason?: string;
  movementDate?: Date;
  userId: string;
}

export interface ConsumedLotEntry {
  lotId: string;
  lotNumber: string;
  quantity: number;
  unitAcquisitionPrice: number;
  cost: number;
}

export interface ConsumeStockResult {
  consumedLots: ConsumedLotEntry[];
  totalQuantity: number;
  totalCost: number;
}

export interface CreateLotParams {
  rawMaterialId: string;
  lotNumber: string;
  purchaseInvoiceId?: string;
  supplierId?: string;
  quantity: number;
  receptionDate: Date;
  expirationDate?: Date | null;
  unitAcquisitionPrice: number;
  transportCost?: number;
  userId: string;
  invoiceItemId?: string;
}

@Injectable()
export class RawStockService {
  private readonly logger = new Logger(RawStockService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Crée un lot suite à une réception (facture d'achat) :
   * - création du lot avec quantité initiale et restante = quantity
   * - création d'un mouvement ENTRY_PURCHASE
   * - mise à jour du stock courant de la matière
   * - recalcul du prix unitaire moyen pondéré
   *
   * À appeler dans une transaction Prisma.
   */
  async createLotFromPurchase(
    tx: Prisma.TransactionClient,
    params: CreateLotParams,
  ) {
    const material = await tx.rawMaterial.findUnique({
      where: { id: params.rawMaterialId },
    });
    if (!material) {
      throw new NotFoundException(`Matière première ${params.rawMaterialId} introuvable`);
    }

    const lot = await tx.rawMaterialLot.create({
      data: {
        lotNumber: params.lotNumber,
        rawMaterialId: params.rawMaterialId,
        purchaseInvoiceId: params.purchaseInvoiceId,
        supplierId: params.supplierId,
        initialQuantity: params.quantity,
        remainingQuantity: params.quantity,
        receptionDate: params.receptionDate,
        expirationDate: params.expirationDate ?? null,
        unitAcquisitionPrice: params.unitAcquisitionPrice,
        transportCost: params.transportCost ?? 0,
        status: LotStatus.ACTIVE,
      },
    });

    await tx.rawStockMovement.create({
      data: {
        rawMaterialId: params.rawMaterialId,
        lotId: lot.id,
        type: RawStockMovementType.ENTRY_PURCHASE,
        quantity: params.quantity,
        movementDate: params.receptionDate,
        referenceType: params.purchaseInvoiceId ? StockReferenceType.PURCHASE_INVOICE : null,
        referenceId: params.purchaseInvoiceId,
        createdById: params.userId,
      },
    });

    // Recalcul du prix unitaire moyen pondéré
    const oldStock = Number(material.currentStock);
    const oldAvg = material.averagePrice;
    const newQty = Number(params.quantity);
    const unitCost =
      params.unitAcquisitionPrice + (params.transportCost ?? 0) / Math.max(newQty, 1);
    const newAvg =
      oldStock + newQty > 0
        ? Math.round((oldStock * oldAvg + newQty * unitCost) / (oldStock + newQty))
        : Math.round(unitCost);

    await tx.rawMaterial.update({
      where: { id: params.rawMaterialId },
      data: {
        currentStock: { increment: params.quantity },
        averagePrice: newAvg,
      },
    });

    return lot;
  }

  /**
   * Consomme une quantité de stock en suivant la règle FIFO (First In First Out).
   * Génère un mouvement de sortie par lot touché et met à jour les statuts (DEPLETED).
   * À appeler dans une transaction Prisma.
   *
   * Lance BadRequestException si stock insuffisant.
   */
  async consumeStock(
    tx: Prisma.TransactionClient,
    params: ConsumeStockParams,
  ): Promise<ConsumeStockResult> {
    if (params.quantity <= 0) {
      throw new BadRequestException('La quantité à consommer doit être positive');
    }
    if (
      (params.movementType === RawStockMovementType.LOSS ||
        params.movementType === RawStockMovementType.ADJUSTMENT) &&
      !params.reason
    ) {
      throw new BadRequestException(
        `Un motif est obligatoire pour les mouvements de type ${params.movementType}`,
      );
    }

    const material = await tx.rawMaterial.findUnique({
      where: { id: params.rawMaterialId },
    });
    if (!material) {
      throw new NotFoundException(`Matière première ${params.rawMaterialId} introuvable`);
    }

    const currentStock = Number(material.currentStock);
    if (currentStock < params.quantity) {
      throw new BadRequestException(
        `Stock insuffisant pour ${material.name} : disponible ${currentStock}, demandé ${params.quantity}`,
      );
    }

    const activeLots = await tx.rawMaterialLot.findMany({
      where: {
        rawMaterialId: params.rawMaterialId,
        status: LotStatus.ACTIVE,
        remainingQuantity: { gt: 0 },
      },
      orderBy: [{ receptionDate: 'asc' }, { createdAt: 'asc' }],
    });

    let remainingToConsume = params.quantity;
    const consumedLots: ConsumedLotEntry[] = [];
    const movementDate = params.movementDate ?? new Date();

    for (const lot of activeLots) {
      if (remainingToConsume <= 0) break;

      const available = Number(lot.remainingQuantity);
      const take = Math.min(available, remainingToConsume);

      const newRemaining = available - take;
      const newStatus: LotStatus = newRemaining <= 0 ? LotStatus.DEPLETED : LotStatus.ACTIVE;

      await tx.rawMaterialLot.update({
        where: { id: lot.id },
        data: {
          remainingQuantity: newRemaining,
          status: newStatus,
        },
      });

      await tx.rawStockMovement.create({
        data: {
          rawMaterialId: params.rawMaterialId,
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
        unitAcquisitionPrice: lot.unitAcquisitionPrice,
        cost: Math.round(take * lot.unitAcquisitionPrice),
      });

      remainingToConsume -= take;
    }

    if (remainingToConsume > 0) {
      throw new BadRequestException(
        `Stock insuffisant en lots actifs pour ${material.name} : reste ${remainingToConsume} à consommer`,
      );
    }

    await tx.rawMaterial.update({
      where: { id: params.rawMaterialId },
      data: { currentStock: { decrement: params.quantity } },
    });

    const totalCost = consumedLots.reduce((sum, l) => sum + l.cost, 0);

    const updatedMaterial = await tx.rawMaterial.findUnique({
      where: { id: params.rawMaterialId },
      select: { currentStock: true, alertThreshold: true, name: true },
    });
    if (updatedMaterial && Number(updatedMaterial.currentStock) < Number(updatedMaterial.alertThreshold)) {
      this.logger.warn(
        `⚠️ Stock bas — ${updatedMaterial.name} : ${updatedMaterial.currentStock} (seuil ${updatedMaterial.alertThreshold})`,
      );
    }

    return {
      consumedLots,
      totalQuantity: params.quantity,
      totalCost,
    };
  }

  /**
   * Ajustement manuel de stock (pour inventaire) :
   * - écart positif : crée un lot d'ajustement avec prix moyen actuel + entrée
   * - écart négatif : consomme via FIFO en mode ADJUSTMENT
   */
  async adjustStock(
    tx: Prisma.TransactionClient,
    rawMaterialId: string,
    delta: number,
    referenceId: string,
    userId: string,
    reason: string,
  ) {
    if (delta === 0) return;

    if (delta > 0) {
      const material = await tx.rawMaterial.findUnique({ where: { id: rawMaterialId } });
      if (!material) {
        throw new NotFoundException(`Matière première ${rawMaterialId} introuvable`);
      }

      // Crée un lot d'ajustement (numéro lot ADJ-)
      const adjLotNumber = `ADJ-${rawMaterialId.slice(0, 8)}-${Date.now()}`;
      const lot = await tx.rawMaterialLot.create({
        data: {
          lotNumber: adjLotNumber,
          rawMaterialId,
          initialQuantity: delta,
          remainingQuantity: delta,
          receptionDate: new Date(),
          unitAcquisitionPrice: material.averagePrice,
          status: LotStatus.ACTIVE,
        },
      });

      await tx.rawStockMovement.create({
        data: {
          rawMaterialId,
          lotId: lot.id,
          type: RawStockMovementType.ADJUSTMENT,
          quantity: delta,
          referenceType: StockReferenceType.INVENTORY,
          referenceId,
          reason,
          createdById: userId,
        },
      });

      await tx.rawMaterial.update({
        where: { id: rawMaterialId },
        data: { currentStock: { increment: delta } },
      });
    } else {
      await this.consumeStock(tx, {
        rawMaterialId,
        quantity: Math.abs(delta),
        movementType: RawStockMovementType.ADJUSTMENT,
        referenceType: StockReferenceType.INVENTORY,
        referenceId,
        reason,
        userId,
      });
    }
  }
}
