import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  DepreciationMethod,
  FixedAssetCategory,
  FixedAssetStatus,
  Prisma,
  TreasuryEntrySource,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { paginate, PaginationDto } from '../common/dto/pagination.dto';
import { TreasuryService } from '../treasury/treasury.service';

interface CreateFixedAssetInput {
  name: string;
  category: FixedAssetCategory;
  acquisitionDate: string;
  acquisitionCost: number;
  salvageValue?: number;
  usefulLifeMonths: number;
  method?: DepreciationMethod;
  decliningRate?: number;
  paymentAccountId?: string;
  recordPurchaseAsTreasury?: boolean;
  serialNumber?: string;
  location?: string;
  note?: string;
}

interface DisposeFixedAssetInput {
  disposalDate: string;
  disposalAmount?: number;
  reason: 'SOLD' | 'SCRAPPED' | 'WRITTEN_OFF';
  proceedsAccountId?: string;
}

@Injectable()
export class FixedAssetsService {
  private readonly logger = new Logger(FixedAssetsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly treasury: TreasuryService,
  ) {}

  async create(dto: CreateFixedAssetInput, userId: string) {
    if (dto.acquisitionCost <= 0) {
      throw new BadRequestException('Le coût d\'acquisition doit être positif');
    }
    if (dto.usefulLifeMonths <= 0) {
      throw new BadRequestException('Durée d\'utilité invalide');
    }
    if ((dto.salvageValue ?? 0) < 0 || (dto.salvageValue ?? 0) >= dto.acquisitionCost) {
      throw new BadRequestException('Valeur résiduelle invalide');
    }
    if (dto.method === DepreciationMethod.DECLINING_BALANCE && !dto.decliningRate) {
      throw new BadRequestException('Le taux dégressif est requis pour la méthode DECLINING_BALANCE');
    }

    return this.prisma.$transaction(async (tx) => {
      const reference = await this.nextReference(tx);

      const asset = await tx.fixedAsset.create({
        data: {
          reference,
          name: dto.name,
          category: dto.category,
          acquisitionDate: new Date(dto.acquisitionDate),
          acquisitionCost: dto.acquisitionCost,
          salvageValue: dto.salvageValue ?? 0,
          usefulLifeMonths: dto.usefulLifeMonths,
          method: dto.method ?? DepreciationMethod.STRAIGHT_LINE,
          decliningRate:
            dto.decliningRate !== undefined ? new Prisma.Decimal(dto.decliningRate) : null,
          paymentAccountId: dto.paymentAccountId,
          recordPurchaseAsTreasury: dto.recordPurchaseAsTreasury ?? true,
          serialNumber: dto.serialNumber,
          location: dto.location,
          note: dto.note,
          createdById: userId,
        },
      });

      // Si recordPurchaseAsTreasury et compte fourni → débit du compte au titre de l'acquisition
      // (c'est de la trésorerie qui sort, mais ça n'affecte PAS le P&L : c'est une immobilisation,
      // pas une charge — la charge sera la dotation mensuelle aux amortissements)
      if (asset.recordPurchaseAsTreasury && dto.paymentAccountId) {
        await this.treasury.writeEntry({
          tx,
          accountId: dto.paymentAccountId,
          entryDate: asset.acquisitionDate,
          amount: -asset.acquisitionCost,
          source: TreasuryEntrySource.FIXED_ASSET_ACQUISITION,
          description: `Acquisition immobilisation ${reference} : ${asset.name}`,
          fixedAssetId: asset.id,
          userId,
        });
      }

      return asset;
    });
  }

  async findAll(
    query: PaginationDto,
    filters: { category?: FixedAssetCategory; status?: FixedAssetStatus },
  ) {
    const where: Prisma.FixedAssetWhereInput = {};
    if (filters.category) where.category = filters.category;
    if (filters.status) where.status = filters.status;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.fixedAsset.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: { acquisitionDate: 'desc' },
        include: {
          paymentAccount: { select: { id: true, name: true } },
          depreciations: {
            orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
            take: 1,
            select: { netBookValue: true, accumulatedDepreciation: true },
          },
        },
      }),
      this.prisma.fixedAsset.count({ where }),
    ]);

    const enriched = items.map((a) => {
      const last = a.depreciations[0];
      return {
        ...a,
        netBookValue: last?.netBookValue ?? a.acquisitionCost,
        accumulatedDepreciation: last?.accumulatedDepreciation ?? 0,
      };
    });

    return paginate(enriched, total, query.page, query.limit);
  }

  async findOne(id: string) {
    const asset = await this.prisma.fixedAsset.findUnique({
      where: { id },
      include: {
        paymentAccount: true,
        depreciations: { orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }] },
      },
    });
    if (!asset) throw new NotFoundException('Immobilisation introuvable');
    const last = asset.depreciations[0];
    return {
      ...asset,
      netBookValue: last?.netBookValue ?? asset.acquisitionCost,
      accumulatedDepreciation: last?.accumulatedDepreciation ?? 0,
    };
  }

  async dispose(id: string, dto: DisposeFixedAssetInput, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const asset = await tx.fixedAsset.findUnique({
        where: { id },
        include: {
          depreciations: {
            orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
            take: 1,
          },
        },
      });
      if (!asset) throw new NotFoundException('Immobilisation introuvable');
      if (asset.status !== FixedAssetStatus.IN_SERVICE) {
        throw new BadRequestException('Cette immobilisation a déjà été sortie');
      }

      const updated = await tx.fixedAsset.update({
        where: { id },
        data: {
          status: dto.reason as FixedAssetStatus,
          disposalDate: new Date(dto.disposalDate),
          disposalAmount: dto.disposalAmount ?? null,
        },
      });

      if (dto.reason === 'SOLD' && dto.proceedsAccountId && dto.disposalAmount) {
        await this.treasury.writeEntry({
          tx,
          accountId: dto.proceedsAccountId,
          entryDate: new Date(dto.disposalDate),
          amount: dto.disposalAmount,
          source: TreasuryEntrySource.FIXED_ASSET_ACQUISITION,
          description: `Cession immobilisation ${asset.reference} : ${asset.name}`,
          fixedAssetId: asset.id,
          userId,
        });
      }

      return updated;
    });
  }

  /**
   * Génère les dotations aux amortissements pour un mois donné.
   * Idempotent : si déjà calculé pour (asset, year, month), saute.
   *
   * Appelé :
   * - automatiquement par le cron le 1er de chaque mois
   * - manuellement via POST /fixed-assets/run-depreciation (admin)
   */
  async runMonthlyDepreciation(
    year: number,
    month: number, // 1..12
    userId: string,
  ) {
    const periodStart = new Date(year, month - 1, 1);

    // Tous les actifs en service acquis avant la fin du mois cible
    const assets = await this.prisma.fixedAsset.findMany({
      where: {
        status: FixedAssetStatus.IN_SERVICE,
        acquisitionDate: { lt: new Date(year, month, 1) },
      },
      include: {
        depreciations: {
          orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
          take: 1,
        },
      },
    });

    const created: Array<{ id: string; assetReference: string; amount: number }> = [];
    const skipped: Array<{ id: string; reason: string }> = [];

    for (const asset of assets) {
      // Skip si déjà calculé pour ce mois
      const already = await this.prisma.depreciationEntry.findUnique({
        where: {
          fixedAssetId_periodYear_periodMonth: {
            fixedAssetId: asset.id,
            periodYear: year,
            periodMonth: month,
          },
        },
      });
      if (already) {
        skipped.push({ id: asset.id, reason: 'already-computed' });
        continue;
      }

      const lastEntry = asset.depreciations[0];
      const accumulated = lastEntry?.accumulatedDepreciation ?? 0;
      const netBookValue = lastEntry?.netBookValue ?? asset.acquisitionCost;

      // Pas en dessous de la valeur résiduelle
      const depreciableBase = Math.max(0, netBookValue - asset.salvageValue);
      if (depreciableBase <= 0) {
        skipped.push({ id: asset.id, reason: 'fully-depreciated' });
        continue;
      }

      let amount = 0;
      if (asset.method === DepreciationMethod.STRAIGHT_LINE) {
        // Linéaire : (cost - salvage) / lifeMonths
        const monthly = Math.round((asset.acquisitionCost - asset.salvageValue) / asset.usefulLifeMonths);
        amount = Math.min(monthly, depreciableBase);
      } else {
        // Dégressif : NBV * (rate / 12)
        const monthlyRate = Number(asset.decliningRate) / 12;
        amount = Math.min(Math.round(netBookValue * monthlyRate), depreciableBase);
      }

      if (amount <= 0) {
        skipped.push({ id: asset.id, reason: 'no-depreciation' });
        continue;
      }

      const entry = await this.prisma.depreciationEntry.create({
        data: {
          fixedAssetId: asset.id,
          periodYear: year,
          periodMonth: month,
          amount,
          accumulatedDepreciation: accumulated + amount,
          netBookValue: netBookValue - amount,
          createdById: userId,
        },
      });
      created.push({ id: entry.id, assetReference: asset.reference, amount });
    }

    this.logger.log(
      `Dotations ${year}-${String(month).padStart(2, '0')} : ${created.length} créées, ${skipped.length} ignorées`,
    );

    return {
      period: { year, month, label: periodStart.toISOString().slice(0, 7) },
      created,
      skipped,
      totalAmount: created.reduce((s, c) => s + c.amount, 0),
    };
  }

  /**
   * Total des dotations sur un mois donné — utilisé par le P&L
   */
  async getDepreciationTotalByMonth(year: number, month: number) {
    const agg = await this.prisma.depreciationEntry.aggregate({
      where: { periodYear: year, periodMonth: month },
      _sum: { amount: true },
    });
    return agg._sum.amount ?? 0;
  }

  // -------- helpers --------

  private async nextReference(tx: Prisma.TransactionClient) {
    const year = new Date().getFullYear();
    const counter = await tx.sequenceCounter.upsert({
      where: { prefix_year: { prefix: 'FA', year } },
      update: { counter: { increment: 1 } },
      create: { prefix: 'FA', year, counter: 1 },
    });
    return `FA-${year}-${String(counter.counter).padStart(5, '0')}`;
  }
}
