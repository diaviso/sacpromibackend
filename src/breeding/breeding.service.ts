import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  BreedingBatchStatus,
  FinishedLotSource,
  FinishedStockMovementType,
  Prisma,
  StockReferenceType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../common/services/sequence.service';
import { FinishedStockService } from '../finished-stock/finished-stock.service';
import { CreateBreedingBatchDto } from './dto/create-breeding-batch.dto';
import { CreateBreedingRecordDto } from './dto/create-breeding-record.dto';
import { CloseBreedingBatchDto } from './dto/close-breeding-batch.dto';
import { paginate, PaginationDto } from '../common/dto/pagination.dto';

const MORTALITY_THRESHOLD_PERCENT = 5;
const STALE_BATCH_DAYS = 60;

@Injectable()
export class BreedingService {
  private readonly logger = new Logger(BreedingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: SequenceService,
    private readonly finishedStockService: FinishedStockService,
  ) {}

  private recomputeBatchCosts = async (tx: Prisma.TransactionClient, batchId: string) => {
    const batch = await tx.breedingBatch.findUnique({
      where: { id: batchId },
      include: { records: true },
    });
    if (!batch) return;

    const totalFeedCost = batch.records.reduce((sum, r) => sum + r.feedCost, 0);
    const totalVetCost = batch.records.reduce((sum, r) => sum + r.vetCost, 0);
    const totalCost = batch.chicksCost + totalFeedCost + totalVetCost + batch.fixedCharges;
    const costPerHead = batch.currentCount > 0 ? Math.round(totalCost / batch.currentCount) : 0;

    await tx.breedingBatch.update({
      where: { id: batchId },
      data: {
        totalFeedCost,
        totalVetCost,
        totalCost,
        costPerHead,
      },
    });
  };

  async create(dto: CreateBreedingBatchDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const startDate = new Date(dto.startDate);
      const reference = await this.sequence.nextReference('B', startDate.getFullYear(), tx);

      const batch = await tx.breedingBatch.create({
        data: {
          reference,
          startDate,
          strain: dto.strain,
          initialCount: dto.initialCount,
          currentCount: dto.initialCount,
          chickSupplier: dto.chickSupplier,
          chicksCost: dto.chicksCost,
          fixedCharges: dto.fixedCharges ?? 0,
          totalCost: dto.chicksCost + (dto.fixedCharges ?? 0),
          costPerHead:
            dto.initialCount > 0
              ? Math.round((dto.chicksCost + (dto.fixedCharges ?? 0)) / dto.initialCount)
              : 0,
          note: dto.note,
          createdById: userId,
        },
      });

      return batch;
    });
  }

  async findAll(query: PaginationDto, status?: BreedingBatchStatus) {
    const where: Prisma.BreedingBatchWhereInput = {};
    if (status) where.status = status;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.breedingBatch.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: { startDate: 'desc' },
        include: { _count: { select: { records: true } } },
      }),
      this.prisma.breedingBatch.count({ where }),
    ]);

    return paginate(items, total, query.page, query.limit);
  }

  async findOne(id: string) {
    const batch = await this.prisma.breedingBatch.findUnique({
      where: { id },
      include: {
        records: {
          orderBy: { recordDate: 'desc' },
          include: { createdBy: { select: { id: true, fullName: true } } },
        },
        finishedProductLots: {
          include: { finishedProduct: { select: { id: true, code: true, name: true } } },
        },
        createdBy: { select: { id: true, fullName: true } },
      },
    });
    if (!batch) {
      throw new NotFoundException(`Bande ${id} introuvable`);
    }

    const mortalityRate =
      batch.initialCount > 0
        ? ((batch.initialCount - batch.currentCount) / batch.initialCount) * 100
        : 0;
    const ageDays = Math.floor(
      (Date.now() - batch.startDate.getTime()) / (1000 * 60 * 60 * 24),
    );

    return {
      ...batch,
      mortalityRate: Math.round(mortalityRate * 100) / 100,
      ageDays,
    };
  }

  async getRecords(id: string) {
    const batch = await this.prisma.breedingBatch.findUnique({ where: { id } });
    if (!batch) throw new NotFoundException(`Bande ${id} introuvable`);
    return this.prisma.breedingRecord.findMany({
      where: { breedingBatchId: id },
      orderBy: { recordDate: 'desc' },
      include: {
        createdBy: { select: { id: true, fullName: true } },
      },
    });
  }

  async addRecord(batchId: string, dto: CreateBreedingRecordDto, userId: string) {
    const batch = await this.prisma.breedingBatch.findUnique({ where: { id: batchId } });
    if (!batch) throw new NotFoundException(`Bande ${batchId} introuvable`);
    if (batch.status === BreedingBatchStatus.CLOSED) {
      throw new BadRequestException('Impossible d\'ajouter un relevé sur une bande clôturée');
    }

    const mortality = dto.mortality ?? 0;
    if (mortality > batch.currentCount) {
      throw new BadRequestException(
        `Mortalité ${mortality} > sujets vivants ${batch.currentCount}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      let feedCost = 0;

      // Si aliment distribué, consommer le stock PF
      if (dto.feedFinishedProductId && dto.feedQuantity && dto.feedQuantity > 0) {
        const result = await this.finishedStockService.consumeFinishedStock(tx, {
          finishedProductId: dto.feedFinishedProductId,
          quantity: dto.feedQuantity,
          movementType: FinishedStockMovementType.EXIT_BREEDING_FEED,
          referenceType: StockReferenceType.BREEDING_BATCH,
          referenceId: batchId,
          userId,
        });
        feedCost = result.totalCost;
      }

      const record = await tx.breedingRecord.create({
        data: {
          breedingBatchId: batchId,
          recordDate: new Date(dto.recordDate),
          mortality,
          mortalityCause: dto.mortalityCause,
          feedFinishedProductId: dto.feedFinishedProductId,
          feedQuantity: dto.feedQuantity ?? 0,
          feedCost,
          averageWeight: dto.averageWeight,
          vetTreatment: dto.vetTreatment,
          vetCost: dto.vetCost ?? 0,
          observations: dto.observations,
          createdById: userId,
        },
      });

      // MAJ batch (mortalité + poids)
      await tx.breedingBatch.update({
        where: { id: batchId },
        data: {
          currentCount: { decrement: mortality },
          averageWeight: dto.averageWeight ?? batch.averageWeight,
        },
      });

      await this.recomputeBatchCosts(tx, batchId);

      // Alerte mortalité anormale
      const updated = await tx.breedingBatch.findUnique({ where: { id: batchId } });
      if (updated) {
        const rate =
          updated.initialCount > 0
            ? ((updated.initialCount - updated.currentCount) / updated.initialCount) * 100
            : 0;
        if (rate > MORTALITY_THRESHOLD_PERCENT) {
          this.logger.warn(
            `⚠️ Mortalité anormale bande ${updated.reference} : ${rate.toFixed(2)}% (seuil ${MORTALITY_THRESHOLD_PERCENT}%)`,
          );
        }
      }

      return record;
    });
  }

  async close(id: string, dto: CloseBreedingBatchDto, userId: string) {
    const batch = await this.prisma.breedingBatch.findUnique({ where: { id } });
    if (!batch) throw new NotFoundException(`Bande ${id} introuvable`);
    if (batch.status === BreedingBatchStatus.CLOSED) {
      throw new BadRequestException('Bande déjà clôturée');
    }

    const liveForSale = dto.liveForSale ?? dto.finalCount;
    const toSlaughter = dto.toSlaughter ?? 0;
    if (liveForSale + toSlaughter > dto.finalCount) {
      throw new BadRequestException(
        `Total vivants + abattage (${liveForSale + toSlaughter}) > ${dto.finalCount} sujets`,
      );
    }

    // Trouver les produits finis "Poulet vivant" et "Poulet abattu"
    const liveProduct = await this.prisma.finishedProduct.findFirst({
      where: { category: 'LIVE_CHICKEN', isActive: true },
    });
    const slaughteredProduct = await this.prisma.finishedProduct.findFirst({
      where: { category: 'SLAUGHTERED_CHICKEN', isActive: true },
    });

    return this.prisma.$transaction(async (tx) => {
      // Recalcul final costs avec nombre final
      const totalFeedCost = await tx.breedingRecord.aggregate({
        where: { breedingBatchId: id },
        _sum: { feedCost: true },
      });
      const totalVetCost = await tx.breedingRecord.aggregate({
        where: { breedingBatchId: id },
        _sum: { vetCost: true },
      });

      const totalCost =
        batch.chicksCost +
        (totalFeedCost._sum.feedCost ?? 0) +
        (totalVetCost._sum.vetCost ?? 0) +
        batch.fixedCharges;
      const costPerLiveHead =
        dto.finalCount > 0 ? Math.round(totalCost / dto.finalCount) : 0;

      const closeDate = dto.closeDate ? new Date(dto.closeDate) : new Date();

      // Lot poulets vivants
      if (liveForSale > 0 && liveProduct) {
        const lotNumber = `${batch.reference}-VIVANT`;
        await this.finishedStockService.createLot(tx, {
          finishedProductId: liveProduct.id,
          lotNumber,
          source: FinishedLotSource.BREEDING,
          quantity: liveForSale,
          manufactureDate: closeDate,
          unitCost: costPerLiveHead,
          movementType: FinishedStockMovementType.ENTRY_BREEDING,
          referenceType: StockReferenceType.BREEDING_BATCH,
          referenceId: id,
          userId,
        });
        // Lier le lot à la bande
        await tx.finishedProductLot.updateMany({
          where: { lotNumber },
          data: { breedingBatchId: id },
        });
      }

      // Lot poulets abattus (avec coût ajusté)
      if (toSlaughter > 0 && slaughteredProduct) {
        const lotNumber = `${batch.reference}-ABATTU`;
        const slaughterCostPer = toSlaughter > 0 ? Math.round((dto.slaughterCost ?? 0) / toSlaughter) : 0;
        const totalWeightKg = toSlaughter * Number(dto.finalAverageWeight) * 0.7; // rendement abattage ~70%
        const totalCostSlaughtered = toSlaughter * costPerLiveHead + (dto.slaughterCost ?? 0);
        const unitCostKg = totalWeightKg > 0 ? Math.round(totalCostSlaughtered / totalWeightKg) : 0;

        await this.finishedStockService.createLot(tx, {
          finishedProductId: slaughteredProduct.id,
          lotNumber,
          source: FinishedLotSource.BREEDING,
          quantity: totalWeightKg,
          manufactureDate: closeDate,
          unitCost: unitCostKg,
          movementType: FinishedStockMovementType.ENTRY_BREEDING,
          referenceType: StockReferenceType.BREEDING_BATCH,
          referenceId: id,
          userId,
        });
        await tx.finishedProductLot.updateMany({
          where: { lotNumber },
          data: { breedingBatchId: id },
        });
      }

      const updated = await tx.breedingBatch.update({
        where: { id },
        data: {
          status: BreedingBatchStatus.CLOSED,
          closeDate,
          currentCount: dto.finalCount,
          averageWeight: dto.finalAverageWeight,
          slaughterCost: dto.slaughterCost ?? 0,
          totalFeedCost: totalFeedCost._sum.feedCost ?? 0,
          totalVetCost: totalVetCost._sum.vetCost ?? 0,
          totalCost,
          costPerHead: costPerLiveHead,
        },
        include: { finishedProductLots: true },
      });

      return updated;
    });
  }

  /** Renvoie les bandes nécessitant une attention (mortalité > 5% ou âge > 60 jours) */
  async getAlerts() {
    const active = await this.prisma.breedingBatch.findMany({
      where: { status: BreedingBatchStatus.ACTIVE },
    });
    const alerts = active
      .map((b) => {
        const mortalityRate =
          b.initialCount > 0
            ? ((b.initialCount - b.currentCount) / b.initialCount) * 100
            : 0;
        const ageDays = Math.floor(
          (Date.now() - b.startDate.getTime()) / (1000 * 60 * 60 * 24),
        );
        const issues: string[] = [];
        if (mortalityRate > MORTALITY_THRESHOLD_PERCENT) {
          issues.push(`Mortalité ${mortalityRate.toFixed(1)}% > ${MORTALITY_THRESHOLD_PERCENT}%`);
        }
        if (ageDays > STALE_BATCH_DAYS) {
          issues.push(`Bande active depuis ${ageDays} jours (> ${STALE_BATCH_DAYS}j)`);
        }
        return issues.length > 0
          ? {
              batchId: b.id,
              reference: b.reference,
              strain: b.strain,
              mortalityRate: Math.round(mortalityRate * 100) / 100,
              ageDays,
              issues,
            }
          : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    return alerts;
  }
}
