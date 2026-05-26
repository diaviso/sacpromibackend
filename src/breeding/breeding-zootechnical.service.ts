import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BreedingBatchStatus,
  FeedingPhase,
  Prisma,
  VaccinationRoute,
  VaccinationStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWeighingDto } from './dto/create-weighing.dto';
import {
  CreateVaccinationDto,
  MarkVaccinationDoneDto,
  SkipVaccinationDto,
} from './dto/create-vaccination.dto';
import { SetFeedingPhasesDto } from './dto/feeding-phase.dto';

// Courbes de référence Cobb 500 (poids moyen attendu par jour, en grammes)
// Source : Performance Standards Cobb 500
const COBB_500_TARGET_WEIGHTS: Record<number, number> = {
  0: 42, 7: 180, 14: 460, 21: 880, 28: 1410, 35: 2010, 42: 2660, 49: 3320,
};

// Programme vaccinal standard pour poulets de chair (Cobb 500 / Ross 308)
// Couvre les pathologies critiques : Newcastle (NCD), Gumboro (IBD), Bronchite (IB)
export const DEFAULT_VACCINATION_PROGRAM = [
  { vaccineName: 'Newcastle + Bronchite (HB1 + IB)', targetAgeDays: 1, route: VaccinationRoute.SPRAY, dose: 'Pulvérisation au couvoir', isOptional: false },
  { vaccineName: 'Gumboro (D78)', targetAgeDays: 10, route: VaccinationRoute.DRINKING_WATER, dose: 'Eau de boisson 1-2h', isOptional: false },
  { vaccineName: 'Newcastle rappel (Lasota)', targetAgeDays: 14, route: VaccinationRoute.DRINKING_WATER, dose: 'Eau de boisson 1-2h', isOptional: false },
  { vaccineName: 'Gumboro rappel', targetAgeDays: 18, route: VaccinationRoute.DRINKING_WATER, dose: 'Eau de boisson 1-2h', isOptional: true },
  { vaccineName: 'Newcastle rappel 2 (Lasota)', targetAgeDays: 21, route: VaccinationRoute.DRINKING_WATER, dose: 'Eau de boisson 1-2h', isOptional: false },
];

// Phases alimentaires standards (référence terrain Cobb 500)
export const DEFAULT_FEEDING_PHASES = [
  { phase: FeedingPhase.STARTER, startDay: 0, endDay: 10, dailyFeedPerHeadGrams: 25 },
  { phase: FeedingPhase.GROWER, startDay: 11, endDay: 24, dailyFeedPerHeadGrams: 95 },
  { phase: FeedingPhase.FINISHER, startDay: 25, endDay: 42, dailyFeedPerHeadGrams: 165 },
];

/** Interpolation linéaire entre 2 points de la courbe Cobb */
function targetWeightForAge(ageDays: number): number {
  const ages = Object.keys(COBB_500_TARGET_WEIGHTS).map(Number).sort((a, b) => a - b);
  if (ageDays <= ages[0]) return COBB_500_TARGET_WEIGHTS[ages[0]];
  if (ageDays >= ages[ages.length - 1]) return COBB_500_TARGET_WEIGHTS[ages[ages.length - 1]];
  let lower = ages[0];
  let upper = ages[ages.length - 1];
  for (let i = 0; i < ages.length - 1; i++) {
    if (ageDays >= ages[i] && ageDays <= ages[i + 1]) {
      lower = ages[i];
      upper = ages[i + 1];
      break;
    }
  }
  const lowerWeight = COBB_500_TARGET_WEIGHTS[lower];
  const upperWeight = COBB_500_TARGET_WEIGHTS[upper];
  const ratio = (ageDays - lower) / (upper - lower);
  return Math.round(lowerWeight + (upperWeight - lowerWeight) * ratio);
}

@Injectable()
export class BreedingZootechnicalService {
  constructor(private readonly prisma: PrismaService) {}

  // =====================================================
  // PESÉES
  // =====================================================

  async addWeighing(batchId: string, dto: CreateWeighingDto, userId: string) {
    const batch = await this.prisma.breedingBatch.findUnique({ where: { id: batchId } });
    if (!batch) throw new NotFoundException(`Bande ${batchId} introuvable`);
    if (batch.status === BreedingBatchStatus.CLOSED) {
      throw new BadRequestException('Impossible d\'ajouter une pesée à une bande clôturée');
    }

    const weighingDate = new Date(dto.weighingDate);
    const ageDays = Math.floor(
      (weighingDate.getTime() - batch.startDate.getTime()) / 86_400_000,
    );
    if (ageDays < 0) {
      throw new BadRequestException('La date de pesée ne peut pas être antérieure au démarrage de la bande');
    }

    // Si min/max fournis, vérifier la cohérence
    if (dto.minWeightGrams != null && dto.maxWeightGrams != null) {
      if (dto.minWeightGrams > dto.maxWeightGrams) {
        throw new BadRequestException('Min > Max');
      }
      if (
        dto.minWeightGrams > dto.averageWeightGrams ||
        dto.maxWeightGrams < dto.averageWeightGrams
      ) {
        throw new BadRequestException('La moyenne doit être comprise entre min et max');
      }
    }

    // Calcul de l'uniformité : % d'écart entre min et max par rapport à la moyenne
    let uniformityPercent: Prisma.Decimal | undefined;
    if (dto.minWeightGrams != null && dto.maxWeightGrams != null) {
      const spread = ((dto.maxWeightGrams - dto.minWeightGrams) / dto.averageWeightGrams) * 100;
      // Uniformité = 100% - (spread/2). Plus simple : score sur écart total
      // Standard métier : un lot est "uniforme" si 80% des poulets sont dans ±10% de la moyenne.
      // Ici on approxime : si spread ≤ 20%, uniformité ≈ 100% ; sinon dégradation.
      const approx = Math.max(0, 100 - Math.max(0, spread - 20) * 2);
      uniformityPercent = new Prisma.Decimal(approx.toFixed(2));
    }

    return this.prisma.breedingWeighing.create({
      data: {
        breedingBatchId: batchId,
        weighingDate,
        ageDays,
        sampleSize: dto.sampleSize,
        averageWeightGrams: dto.averageWeightGrams,
        minWeightGrams: dto.minWeightGrams,
        maxWeightGrams: dto.maxWeightGrams,
        uniformityPercent,
        observations: dto.observations,
        createdById: userId,
      },
    });
  }

  async getWeighings(batchId: string) {
    return this.prisma.breedingWeighing.findMany({
      where: { breedingBatchId: batchId },
      orderBy: { weighingDate: 'asc' },
      include: { createdBy: { select: { id: true, fullName: true } } },
    });
  }

  async deleteWeighing(weighingId: string) {
    await this.prisma.breedingWeighing.delete({ where: { id: weighingId } });
    return { message: 'Pesée supprimée' };
  }

  // =====================================================
  // VACCINATIONS
  // =====================================================

  async addVaccination(batchId: string, dto: CreateVaccinationDto, userId: string) {
    const batch = await this.prisma.breedingBatch.findUnique({ where: { id: batchId } });
    if (!batch) throw new NotFoundException(`Bande ${batchId} introuvable`);

    const plannedDate = new Date(batch.startDate);
    plannedDate.setDate(plannedDate.getDate() + dto.targetAgeDays);

    return this.prisma.breedingVaccination.create({
      data: {
        breedingBatchId: batchId,
        vaccineName: dto.vaccineName,
        targetAgeDays: dto.targetAgeDays,
        plannedDate,
        route: dto.route,
        dose: dto.dose,
        supplier: dto.supplier,
        batchNumber: dto.batchNumber,
        cost: dto.cost ?? 0,
        observations: dto.observations,
        createdById: userId,
      },
    });
  }

  async applyDefaultProgram(batchId: string, userId: string) {
    const batch = await this.prisma.breedingBatch.findUnique({
      where: { id: batchId },
      include: { vaccinations: true },
    });
    if (!batch) throw new NotFoundException(`Bande ${batchId} introuvable`);

    const existingNames = new Set(batch.vaccinations.map((v) => v.vaccineName));
    let added = 0;
    for (const item of DEFAULT_VACCINATION_PROGRAM) {
      if (existingNames.has(item.vaccineName)) continue;
      if (item.isOptional) continue; // ne pas ajouter les rappels optionnels
      const plannedDate = new Date(batch.startDate);
      plannedDate.setDate(plannedDate.getDate() + item.targetAgeDays);
      await this.prisma.breedingVaccination.create({
        data: {
          breedingBatchId: batchId,
          vaccineName: item.vaccineName,
          targetAgeDays: item.targetAgeDays,
          plannedDate,
          route: item.route,
          dose: item.dose,
          createdById: userId,
        },
      });
      added++;
    }
    return { added, total: batch.vaccinations.length + added };
  }

  async getVaccinations(batchId: string) {
    const items = await this.prisma.breedingVaccination.findMany({
      where: { breedingBatchId: batchId },
      orderBy: [{ targetAgeDays: 'asc' }, { plannedDate: 'asc' }],
      include: { createdBy: { select: { id: true, fullName: true } } },
    });
    // Marquer auto-OVERDUE les PLANNED dépassés depuis 2 jours
    const now = new Date();
    return items.map((v) => {
      if (
        v.status === VaccinationStatus.PLANNED &&
        v.plannedDate.getTime() + 2 * 86_400_000 < now.getTime()
      ) {
        return { ...v, status: VaccinationStatus.OVERDUE };
      }
      return v;
    });
  }

  async markVaccinationDone(vaccinationId: string, dto: MarkVaccinationDoneDto) {
    const vacc = await this.prisma.breedingVaccination.findUnique({ where: { id: vaccinationId } });
    if (!vacc) throw new NotFoundException('Vaccination introuvable');
    if (vacc.status === VaccinationStatus.DONE) {
      throw new BadRequestException('Vaccination déjà effectuée');
    }
    return this.prisma.breedingVaccination.update({
      where: { id: vaccinationId },
      data: {
        status: VaccinationStatus.DONE,
        actualDate: new Date(dto.actualDate),
        cost: dto.cost ?? vacc.cost,
        batchNumber: dto.batchNumber ?? vacc.batchNumber,
        observations: dto.observations ?? vacc.observations,
      },
    });
  }

  async skipVaccination(vaccinationId: string, dto: SkipVaccinationDto) {
    const vacc = await this.prisma.breedingVaccination.findUnique({ where: { id: vaccinationId } });
    if (!vacc) throw new NotFoundException('Vaccination introuvable');
    return this.prisma.breedingVaccination.update({
      where: { id: vaccinationId },
      data: { status: VaccinationStatus.SKIPPED, skipReason: dto.reason },
    });
  }

  async deleteVaccination(vaccinationId: string) {
    await this.prisma.breedingVaccination.delete({ where: { id: vaccinationId } });
    return { message: 'Vaccination supprimée' };
  }

  // =====================================================
  // PHASES ALIMENTAIRES
  // =====================================================

  async setFeedingPhases(batchId: string, dto: SetFeedingPhasesDto) {
    const batch = await this.prisma.breedingBatch.findUnique({ where: { id: batchId } });
    if (!batch) throw new NotFoundException(`Bande ${batchId} introuvable`);

    // Vérifier la cohérence des intervalles (pas de chevauchement)
    const sorted = [...dto.phases].sort((a, b) => a.startDay - b.startDay);
    for (let i = 0; i < sorted.length; i++) {
      const p = sorted[i];
      if (p.startDay > p.endDay) {
        throw new BadRequestException(`Phase ${p.phase} : startDay > endDay`);
      }
      if (i > 0 && p.startDay <= sorted[i - 1].endDay) {
        throw new BadRequestException(
          `Chevauchement entre ${sorted[i - 1].phase} et ${p.phase}`,
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.breedingFeedingPhase.deleteMany({ where: { breedingBatchId: batchId } });
      for (const phase of dto.phases) {
        await tx.breedingFeedingPhase.create({
          data: {
            breedingBatchId: batchId,
            phase: phase.phase,
            startDay: phase.startDay,
            endDay: phase.endDay,
            dailyFeedPerHeadGrams: phase.dailyFeedPerHeadGrams,
            feedFinishedProductId: phase.feedFinishedProductId,
            technicalNote: phase.technicalNote,
          },
        });
      }
      return tx.breedingFeedingPhase.findMany({
        where: { breedingBatchId: batchId },
        orderBy: { startDay: 'asc' },
        include: { feedFinishedProduct: { select: { id: true, code: true, name: true } } },
      });
    });
  }

  async applyDefaultFeedingPhases(batchId: string) {
    return this.setFeedingPhases(batchId, {
      phases: DEFAULT_FEEDING_PHASES.map((p) => ({ ...p })),
    });
  }

  async getFeedingPhases(batchId: string) {
    return this.prisma.breedingFeedingPhase.findMany({
      where: { breedingBatchId: batchId },
      orderBy: { startDay: 'asc' },
      include: { feedFinishedProduct: { select: { id: true, code: true, name: true } } },
    });
  }

  // =====================================================
  // KPI ZOOTECHNIQUES + PRÉVISIONNEL
  // =====================================================

  /**
   * Calcule les indicateurs clés d'une bande :
   * - GMQ : Gain Moyen Quotidien (g/jour)
   * - IC : Indice de Consommation (kg aliment / kg vif)
   * - Viabilité : % sujets vivants vs initial
   * - EPI : Index de Production Européen — synthèse de la qualité d'élevage
   * - Courbe de poids comparée à la référence Cobb 500
   */
  async getZootechnicalKPIs(batchId: string) {
    const batch = await this.prisma.breedingBatch.findUnique({
      where: { id: batchId },
      include: {
        records: { orderBy: { recordDate: 'asc' } },
        weighings: { orderBy: { weighingDate: 'asc' } },
        feedingPhases: { orderBy: { startDay: 'asc' } },
      },
    });
    if (!batch) throw new NotFoundException(`Bande ${batchId} introuvable`);

    const now = new Date();
    const referenceDate = batch.closeDate ?? now;
    const ageDays = Math.max(
      0,
      Math.floor((referenceDate.getTime() - batch.startDate.getTime()) / 86_400_000),
    );

    // Viabilité = sujets vivants / initial
    const viability =
      batch.initialCount > 0 ? (batch.currentCount / batch.initialCount) * 100 : 0;
    const mortalityRate = 100 - viability;

    // Conso aliments totale (g) = sum(feedQuantity * unité conversion)
    // On suppose feedQuantity est en kg (selon le modèle FinishedProduct unit)
    const totalFeedKg = batch.records.reduce((s, r) => s + Number(r.feedQuantity), 0);

    // Poids moyen actuel : dernière pesée si dispo, sinon batch.averageWeight (kg)
    const lastWeighing = batch.weighings[batch.weighings.length - 1];
    const currentAverageWeightG = lastWeighing
      ? lastWeighing.averageWeightGrams
      : Math.round(Number(batch.averageWeight) * 1000);

    // Poids vif total estimé (kg)
    const totalLiveWeightKg = (batch.currentCount * currentAverageWeightG) / 1000;

    // GMQ entre les deux dernières pesées (ou depuis le démarrage)
    let gmqGramsPerDay = 0;
    if (batch.weighings.length >= 2) {
      const first = batch.weighings[0];
      const last = batch.weighings[batch.weighings.length - 1];
      const days = last.ageDays - first.ageDays;
      if (days > 0) {
        gmqGramsPerDay = Math.round((last.averageWeightGrams - first.averageWeightGrams) / days);
      }
    } else if (currentAverageWeightG > 42 && ageDays > 0) {
      // Estimation : (poids actuel - poids initial 42g) / âge
      gmqGramsPerDay = Math.round((currentAverageWeightG - 42) / ageDays);
    }

    // IC : Indice de Consommation = kg aliment / kg vif produit
    // Plus c'est BAS, mieux c'est. Standard Cobb 500 : ~1.6 à 35j
    let indiceConsommation: number | null = null;
    if (totalLiveWeightKg > 0) {
      indiceConsommation = Math.round((totalFeedKg / totalLiveWeightKg) * 100) / 100;
    }

    // EPI : Index de Production Européen
    // EPI = (viabilité × poids vif moyen kg × 100) / (âge × IC)
    // Standard : > 350 = excellent, 300-350 = bon, 250-300 = moyen, < 250 = mauvais
    let epi: number | null = null;
    if (indiceConsommation && indiceConsommation > 0 && ageDays > 0) {
      epi = Math.round(
        (viability * (currentAverageWeightG / 1000) * 100) / (ageDays * indiceConsommation),
      );
    }

    // Comparaison avec courbe Cobb 500
    const targetWeightG = targetWeightForAge(ageDays);
    const weightDeviation =
      targetWeightG > 0
        ? Math.round(((currentAverageWeightG - targetWeightG) / targetWeightG) * 1000) / 10
        : 0;

    // Courbe de poids : points réels (pesées) + courbe théorique
    const weightCurve = {
      actual: batch.weighings.map((w) => ({
        ageDays: w.ageDays,
        weightGrams: w.averageWeightGrams,
        sampleSize: w.sampleSize,
      })),
      target: Object.entries(COBB_500_TARGET_WEIGHTS)
        .filter(([d]) => Number(d) <= Math.max(batch.targetCycleDays + 5, ageDays + 5))
        .map(([d, w]) => ({ ageDays: Number(d), weightGrams: w })),
    };

    // Conso aliment réelle vs théorique
    let theoreticalFeedKg = 0;
    if (batch.feedingPhases.length > 0) {
      for (let d = 0; d <= ageDays; d++) {
        const phase = batch.feedingPhases.find((p) => d >= p.startDay && d <= p.endDay);
        if (phase) {
          // Approximation : effectif quotidien = moyenne entre initial et actuel
          const avgHeads = Math.round((batch.initialCount + batch.currentCount) / 2);
          theoreticalFeedKg += (phase.dailyFeedPerHeadGrams * avgHeads) / 1000;
        }
      }
    }
    const feedDeviation =
      theoreticalFeedKg > 0
        ? Math.round(((totalFeedKg - theoreticalFeedKg) / theoreticalFeedKg) * 1000) / 10
        : null;

    return {
      ageDays,
      cycle: {
        targetDays: batch.targetCycleDays,
        progressPercent: Math.min(100, Math.round((ageDays / batch.targetCycleDays) * 100)),
        remainingDays: Math.max(0, batch.targetCycleDays - ageDays),
      },
      effectif: {
        initial: batch.initialCount,
        current: batch.currentCount,
        lost: batch.initialCount - batch.currentCount,
        viabilityPercent: Math.round(viability * 100) / 100,
        mortalityPercent: Math.round(mortalityRate * 100) / 100,
        alertThreshold: Number(batch.mortalityAlertPercent),
        hasMortalityAlert: mortalityRate > Number(batch.mortalityAlertPercent),
      },
      weight: {
        currentAverageGrams: currentAverageWeightG,
        targetForAgeGrams: targetWeightG,
        deviationPercent: weightDeviation, // négatif = en retard
        targetCommercialGrams: batch.targetWeightGrams,
        lastWeighingDate: lastWeighing?.weighingDate ?? null,
        gmqGramsPerDay,
      },
      feed: {
        totalKg: Math.round(totalFeedKg * 100) / 100,
        theoreticalKg: theoreticalFeedKg > 0 ? Math.round(theoreticalFeedKg * 100) / 100 : null,
        deviationPercent: feedDeviation,
        indiceConsommation,
        icBenchmark: 1.6, // Cobb 500 référence à 35j
      },
      epi: {
        value: epi,
        rating:
          epi == null
            ? null
            : epi >= 350
              ? 'EXCELLENT'
              : epi >= 300
                ? 'BON'
                : epi >= 250
                  ? 'MOYEN'
                  : 'INSUFFISANT',
      },
      weightCurve,
    };
  }

  /**
   * Calcule un prévisionnel basé sur le GMQ actuel :
   * - Date d'abattage estimée pour atteindre le poids cible
   * - Recette estimée
   * - Marge estimée
   */
  async getForecast(batchId: string) {
    const batch = await this.prisma.breedingBatch.findUnique({
      where: { id: batchId },
      include: { weighings: { orderBy: { weighingDate: 'asc' } } },
    });
    if (!batch) throw new NotFoundException(`Bande ${batchId} introuvable`);
    if (batch.status === BreedingBatchStatus.CLOSED) {
      return { closed: true, message: 'Bande déjà clôturée' };
    }

    const now = new Date();
    const ageDays = Math.floor((now.getTime() - batch.startDate.getTime()) / 86_400_000);

    const lastWeighing = batch.weighings[batch.weighings.length - 1];
    const currentWeightG = lastWeighing
      ? lastWeighing.averageWeightGrams
      : Math.round(Number(batch.averageWeight) * 1000);

    // GMQ courant
    let gmqGramsPerDay = 0;
    if (batch.weighings.length >= 2) {
      const first = batch.weighings[0];
      const last = batch.weighings[batch.weighings.length - 1];
      const days = last.ageDays - first.ageDays;
      if (days > 0) {
        gmqGramsPerDay = (last.averageWeightGrams - first.averageWeightGrams) / days;
      }
    } else if (currentWeightG > 42 && ageDays > 0) {
      gmqGramsPerDay = (currentWeightG - 42) / ageDays;
    } else {
      // Fallback : GMQ référence Cobb 500 à âge équivalent
      gmqGramsPerDay = 55; // moyenne sur cycle complet
    }

    const remainingGrams = Math.max(0, batch.targetWeightGrams - currentWeightG);
    const remainingDays = gmqGramsPerDay > 0 ? Math.ceil(remainingGrams / gmqGramsPerDay) : 0;
    const estimatedSlaughterDate = new Date(now);
    estimatedSlaughterDate.setDate(estimatedSlaughterDate.getDate() + remainingDays);

    // Estimations économiques
    const estimatedFinalCount = batch.currentCount; // mortalité supposée stable
    const estimatedTotalLiveWeightKg = (estimatedFinalCount * batch.targetWeightGrams) / 1000;
    const estimatedRevenue =
      batch.expectedSalePricePerKg > 0
        ? Math.round(estimatedTotalLiveWeightKg * batch.expectedSalePricePerKg)
        : null;
    const estimatedMargin =
      estimatedRevenue != null ? estimatedRevenue - batch.totalCost : null;

    return {
      closed: false,
      ageDays,
      currentWeightG,
      targetWeightG: batch.targetWeightGrams,
      gmqGramsPerDay: Math.round(gmqGramsPerDay),
      remainingDays,
      estimatedSlaughterDate,
      estimatedFinalCount,
      estimatedTotalLiveWeightKg: Math.round(estimatedTotalLiveWeightKg * 100) / 100,
      expectedSalePricePerKg: batch.expectedSalePricePerKg,
      estimatedRevenue,
      currentTotalCost: batch.totalCost,
      estimatedMargin,
      estimatedMarginPerHead:
        estimatedMargin != null && estimatedFinalCount > 0
          ? Math.round(estimatedMargin / estimatedFinalCount)
          : null,
    };
  }

  /**
   * Comparatif entre plusieurs bandes (max 5) — utile pour identifier
   * les meilleures pratiques.
   */
  async getComparison(batchIds: string[]) {
    if (batchIds.length === 0) {
      throw new BadRequestException('Aucune bande sélectionnée');
    }
    if (batchIds.length > 5) {
      throw new BadRequestException('Maximum 5 bandes à comparer');
    }
    const kpis = await Promise.all(batchIds.map((id) => this.getZootechnicalKPIs(id)));
    const batches = await this.prisma.breedingBatch.findMany({
      where: { id: { in: batchIds } },
      select: { id: true, reference: true, strain: true, startDate: true, closeDate: true, status: true },
    });
    return batches.map((b, i) => ({
      batch: b,
      kpi: kpis[i],
    }));
  }
}
