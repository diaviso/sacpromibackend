import { Injectable, NotFoundException } from '@nestjs/common';
import { ExpenseActivity, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  // ========================================================================
  // RENTABILITÉ PAR PRODUIT
  // ========================================================================
  async profitabilityByProduct(from?: string, to?: string) {
    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to);

    const items = await this.prisma.saleInvoiceItem.groupBy({
      by: ['finishedProductId'],
      where: from || to ? { saleInvoice: { invoiceDate: dateFilter } } : {},
      _sum: { quantity: true, lineAmount: true },
    });

    const products = await this.prisma.finishedProduct.findMany({
      where: { id: { in: items.map((i) => i.finishedProductId) } },
      select: { id: true, code: true, name: true, averageCost: true, unit: true },
    });

    const result = items.map((item) => {
      const product = products.find((p) => p.id === item.finishedProductId);
      const volume = Number(item._sum.quantity ?? 0);
      const revenue = item._sum.lineAmount ?? 0;
      const totalCost = volume * (product?.averageCost ?? 0);
      const margin = revenue - totalCost;
      const marginRate = revenue > 0 ? Math.round((margin / revenue) * 10000) / 100 : 0;
      return {
        productId: item.finishedProductId,
        code: product?.code ?? '',
        name: product?.name ?? '?',
        unit: product?.unit ?? null,
        volume,
        revenue,
        totalCost,
        margin,
        marginRate,
      };
    });

    return result.sort((a, b) => b.margin - a.margin);
  }

  // ========================================================================
  // BILAN JOURNALIER / HEBDO / MENSUEL
  // ========================================================================
  async monthly(month: string) {
    // month au format YYYY-MM
    const [year, monthNum] = month.split('-').map(Number);
    if (!year || !monthNum || monthNum < 1 || monthNum > 12) {
      throw new NotFoundException('Format mois invalide (YYYY-MM)');
    }
    const from = new Date(year, monthNum - 1, 1);
    const to = new Date(year, monthNum, 0, 23, 59, 59, 999);
    return this.computePeriodReport(from, to, `Bilan ${month}`);
  }

  async daily(date: string) {
    const d = new Date(date);
    const from = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const to = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
    return this.computePeriodReport(from, to, `Bilan ${date}`);
  }

  async weekly(weekStart: string) {
    const d = new Date(weekStart);
    const from = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const to = new Date(from);
    to.setDate(to.getDate() + 6);
    to.setHours(23, 59, 59, 999);
    return this.computePeriodReport(from, to, `Semaine du ${weekStart}`);
  }

  private async computePeriodReport(from: Date, to: Date, label: string) {
    const [
      salesAgg,
      purchaseAgg,
      productionAgg,
      expensesByActivity,
      depreciationAgg,
      interestAgg,
    ] = await Promise.all([
      this.prisma.saleInvoice.aggregate({
        where: { invoiceDate: { gte: from, lte: to }, totalAmount: { gt: 0 } },
        _sum: { totalAmount: true },
        _count: true,
      }),
      this.prisma.purchaseInvoice.aggregate({
        // Bilan de periode : on prend les receptions effectives (entree
        // de stock reelle) et non les factures, qui peuvent dater d'un
        // mois different. Exclut les receptions annulees.
        where: {
          receptionDate: { gte: from, lte: to },
          deletedAt: null,
        },
        _sum: { totalAmount: true },
      }),
      this.prisma.productionOrder.aggregate({
        where: { status: 'COMPLETED', productionDate: { gte: from, lte: to } },
        _sum: { transformationCost: true },
      }),
      this.prisma.expense.groupBy({
        by: ['activity'],
        where: { status: 'CONFIRMED', expenseDate: { gte: from, lte: to } },
        _sum: { amount: true },
      }),
      // Sprint 7 : dotations aux amortissements (charge non-décaissable)
      this.depreciationForPeriod(from, to),
      // Sprint 7 : charges financières (intérêts payés sur prêts)
      this.prisma.loanPayment.aggregate({
        where: { paymentDate: { gte: from, lte: to } },
        _sum: { interestPart: true },
      }),
    ]);

    const revenue = salesAgg._sum.totalAmount ?? 0;
    const materialsCost = purchaseAgg._sum.totalAmount ?? 0;
    const transformationCost = productionAgg._sum.transformationCost ?? 0;
    const grossMargin = revenue - materialsCost - transformationCost;
    const grossMarginRate = revenue > 0 ? Math.round((grossMargin / revenue) * 10000) / 100 : 0;

    const expensesByActivityMap: Record<string, number> = {
      PRODUCTION: 0,
      BREEDING: 0,
      COMMERCIAL: 0,
      GENERAL: 0,
    };
    for (const exp of expensesByActivity) {
      expensesByActivityMap[exp.activity] = exp._sum.amount ?? 0;
    }
    const totalOpExpenses = Object.values(expensesByActivityMap).reduce((s, v) => s + v, 0);

    const depreciation = depreciationAgg;
    const financialCost = interestAgg._sum.interestPart ?? 0;

    // Résultat opérationnel = marge brute - charges d'exploitation
    const operatingResult = grossMargin - totalOpExpenses;
    // Résultat avant amortissements = opérationnel
    // EBITDA-like (pour info) — utile au client
    const ebitda = operatingResult;
    // Résultat avant impôt = opérationnel - dotations - intérêts
    const netResult = operatingResult - depreciation - financialCost;
    const netResultRate = revenue > 0 ? Math.round((netResult / revenue) * 10000) / 100 : 0;

    return {
      label,
      period: { from, to },
      revenue,
      salesCount: salesAgg._count,
      materialsCost,
      transformationCost,
      grossMargin,
      grossMarginRate,
      expenses: {
        production: expensesByActivityMap.PRODUCTION,
        breeding: expensesByActivityMap.BREEDING,
        commercial: expensesByActivityMap.COMMERCIAL,
        general: expensesByActivityMap.GENERAL,
        total: totalOpExpenses,
      },
      operatingResult,
      ebitda,
      // Sprint 7 — charges non-monétaires + financières
      depreciation,
      financialCost,
      netResult,
      netResultRate,
    };
  }

  /**
   * Total des dotations aux amortissements sur une période donnée.
   * Une dotation est rattachée à un mois entier (year, month). On filtre côté JS
   * sur la borne [yearMonth(from), yearMonth(to)] — le volume de DepreciationEntry
   * est petit (12 lignes/an/actif), donc la simplicité prime sur l'optimisation.
   */
  private async depreciationForPeriod(from: Date, to: Date): Promise<number> {
    const fromYear = from.getFullYear();
    const toYear = to.getFullYear();

    const entries = await this.prisma.depreciationEntry.findMany({
      where: { periodYear: { gte: fromYear, lte: toYear } },
      select: { amount: true, periodYear: true, periodMonth: true },
    });

    const fromYM = fromYear * 12 + from.getMonth();
    const toYM = toYear * 12 + to.getMonth();
    let total = 0;
    for (const e of entries) {
      const ym = e.periodYear * 12 + (e.periodMonth - 1);
      if (ym >= fromYM && ym <= toYM) total += e.amount;
    }
    return total;
  }

  // ========================================================================
  // RAPPORT D'ÉLEVAGE PAR BANDE
  // ========================================================================
  async breedingReport(batchId: string) {
    const batch = await this.prisma.breedingBatch.findUnique({
      where: { id: batchId },
      include: {
        records: { orderBy: { recordDate: 'asc' } },
        finishedProductLots: { include: { finishedProduct: true } },
      },
    });
    if (!batch) throw new NotFoundException(`Bande ${batchId} introuvable`);

    const duration = batch.closeDate
      ? Math.floor((batch.closeDate.getTime() - batch.startDate.getTime()) / (1000 * 60 * 60 * 24))
      : Math.floor((Date.now() - batch.startDate.getTime()) / (1000 * 60 * 60 * 24));

    const totalMortality = batch.initialCount - batch.currentCount;
    const mortalityRate =
      batch.initialCount > 0
        ? Math.round((totalMortality / batch.initialCount) * 10000) / 100
        : 0;

    const totalFeedQuantity = batch.records.reduce((s, r) => s + Number(r.feedQuantity), 0);
    const feedConversion =
      batch.currentCount > 0 && Number(batch.averageWeight) > 0
        ? totalFeedQuantity / (batch.currentCount * Number(batch.averageWeight))
        : 0;

    return {
      batch: {
        id: batch.id,
        reference: batch.reference,
        strain: batch.strain,
        startDate: batch.startDate,
        closeDate: batch.closeDate,
        status: batch.status,
        durationDays: duration,
      },
      population: {
        initial: batch.initialCount,
        current: batch.currentCount,
        totalMortality,
        mortalityRate,
      },
      consumption: {
        totalFeedQuantityKg: totalFeedQuantity,
        feedConversionRatio: Math.round(feedConversion * 100) / 100,
        averageWeightKg: Number(batch.averageWeight),
      },
      financial: {
        chicksCost: batch.chicksCost,
        totalFeedCost: batch.totalFeedCost,
        totalVetCost: batch.totalVetCost,
        fixedCharges: batch.fixedCharges,
        slaughterCost: batch.slaughterCost,
        totalCost: batch.totalCost,
        costPerHead: batch.costPerHead,
      },
      lots: batch.finishedProductLots.map((lot) => ({
        lotNumber: lot.lotNumber,
        product: lot.finishedProduct.name,
        quantity: Number(lot.initialQuantity),
        unitCost: lot.unitCost,
      })),
      records: batch.records.length,
    };
  }

  // ========================================================================
  // ÉVOLUTION PRIX D'ACHAT MP
  // ========================================================================
  async purchasePriceHistory(materialId: string, from?: string, to?: string) {
    const material = await this.prisma.rawMaterial.findUnique({ where: { id: materialId } });
    if (!material) throw new NotFoundException(`Matière ${materialId} introuvable`);

    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to);

    const items = await this.prisma.purchaseInvoiceItem.findMany({
      where: {
        rawMaterialId: materialId,
        // Exclure les receptions annulees (soft-delete) — sinon une
        // facture corrigee polluerait l'historique des prix.
        purchaseInvoice: {
          deletedAt: null,
          ...(from || to ? { receptionDate: dateFilter } : {}),
        },
      },
      include: {
        purchaseInvoice: {
          select: {
            id: true,
            reference: true,
            invoiceDate: true,
            receptionDate: true,
            supplier: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { purchaseInvoice: { receptionDate: 'asc' } },
    });

    return {
      material: {
        id: material.id,
        code: material.code,
        name: material.name,
        currentAveragePrice: material.averagePrice,
      },
      history: items.map((it) => ({
        date: it.purchaseInvoice.receptionDate,
        invoiceReference: it.purchaseInvoice.reference,
        supplier: it.purchaseInvoice.supplier.name,
        quantity: Number(it.quantity),
        unitPrice: it.unitPrice,
      })),
    };
  }

  // ========================================================================
  // MEILLEURS PRODUITS (par marge et par volume)
  // ========================================================================
  async bestProducts() {
    const profitability = await this.profitabilityByProduct();
    return {
      byMargin: [...profitability].sort((a, b) => b.margin - a.margin).slice(0, 10),
      byVolume: [...profitability].sort((a, b) => b.volume - a.volume).slice(0, 10),
    };
  }

  // ========================================================================
  // AGEING DES CRÉANCES / DETTES (réutilise dashboard)
  // ========================================================================
  async receivablesAging() {
    const unpaid = await this.prisma.saleInvoice.findMany({
      where: { paymentStatus: { in: ['UNPAID', 'PARTIALLY_PAID'] }, totalAmount: { gt: 0 } },
      include: { customer: { select: { id: true, name: true, phone: true } } },
      orderBy: { invoiceDate: 'asc' },
    });

    const today = new Date();
    return unpaid.map((inv) => ({
      invoiceId: inv.id,
      reference: inv.reference,
      customer: inv.customer,
      invoiceDate: inv.invoiceDate,
      totalAmount: inv.totalAmount,
      amountRemaining: inv.amountRemaining,
      daysOverdue: Math.floor((today.getTime() - inv.invoiceDate.getTime()) / (24 * 60 * 60 * 1000)),
    }));
  }

  /**
   * Ageing des dettes fournisseur.
   *
   * Apres refonte Achats : la dette totale envers les fournisseurs est
   * composee de deux briques :
   *   1. Dette REELLE : receptions effectives non encore reglees
   *      (PurchaseInvoice.amountRemaining > 0)
   *   2. Dette ESTIMATIVE : BC valides ou partiellement livres dont la
   *      marchandise n'est pas encore receptionnee (engagement pris).
   *
   * Le champ `kind` distingue les deux ; le tri est sur la date de
   * reception (kind=invoice) ou expectedDate (kind=engagement).
   */
  async payablesAging() {
    const today = new Date();

    const [unpaidReceptions, engagedOrders] = await Promise.all([
      this.prisma.purchaseInvoice.findMany({
        where: {
          paymentStatus: { in: ['UNPAID', 'PARTIALLY_PAID'] },
          deletedAt: null,
        },
        include: { supplier: { select: { id: true, name: true, phone: true } } },
        orderBy: { receptionDate: 'asc' },
      }),
      this.prisma.purchaseOrder.findMany({
        where: { status: { in: ['VALIDATED', 'PARTIALLY_DELIVERED'] } },
        include: {
          supplier: { select: { id: true, name: true, phone: true } },
          purchaseInvoices: {
            where: { deletedAt: null },
            select: { totalAmount: true },
          },
        },
        orderBy: { expectedDate: 'asc' },
      }),
    ]);

    const reception = unpaidReceptions.map((inv) => ({
      kind: 'invoice' as const,
      id: inv.id,
      reference: inv.reference,
      supplier: inv.supplier,
      date: inv.receptionDate,
      totalAmount: inv.totalAmount,
      amountRemaining: inv.amountRemaining,
      daysOverdue: Math.floor(
        (today.getTime() - inv.receptionDate.getTime()) / (24 * 60 * 60 * 1000),
      ),
    }));

    const engagement = engagedOrders
      .map((order) => {
        const received = order.purchaseInvoices.reduce((s, i) => s + i.totalAmount, 0);
        const engaged = Math.max(0, order.totalAmount - received);
        return { order, engaged };
      })
      .filter(({ engaged }) => engaged > 0)
      .map(({ order, engaged }) => ({
        kind: 'engagement' as const,
        id: order.id,
        reference: order.reference,
        supplier: order.supplier,
        date: order.expectedDate ?? order.orderDate,
        totalAmount: order.totalAmount,
        amountRemaining: engaged,
        daysOverdue: order.expectedDate
          ? Math.floor((today.getTime() - order.expectedDate.getTime()) / (24 * 60 * 60 * 1000))
          : 0,
      }));

    return [...reception, ...engagement].sort(
      (a, b) => b.daysOverdue - a.daysOverdue,
    );
  }

  // ========================================================================
  // RAPPORT RECEPTIONS (anciennement factures d'achat)
  // ========================================================================
  async receptionsReport(from?: string, to?: string) {
    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to);

    const items = await this.prisma.purchaseInvoice.findMany({
      where: {
        deletedAt: null,
        ...(from || to ? { receptionDate: dateFilter } : {}),
      },
      include: {
        supplier: { select: { id: true, name: true } },
        purchaseOrder: { select: { id: true, reference: true, status: true } },
        _count: { select: { items: true, payments: true } },
      },
      orderBy: { receptionDate: 'desc' },
    });

    return items.map((r) => ({
      id: r.id,
      reference: r.reference,
      supplierInvoiceNumber: r.supplierInvoiceNumber,
      receptionDate: r.receptionDate,
      invoiceDate: r.invoiceDate,
      supplier: r.supplier,
      bcReference: r.purchaseOrder?.reference ?? null,
      totalAmount: r.totalAmount,
      amountPaid: r.amountPaid,
      amountRemaining: r.amountRemaining,
      paymentStatus: r.paymentStatus,
      itemCount: r._count.items,
      paymentCount: r._count.payments,
    }));
  }

  // ========================================================================
  // RAPPORT BONS DE COMMANDE (avec EXPIRED)
  // ========================================================================
  async purchaseOrdersReport(
    from?: string,
    to?: string,
    statuses?: string[],
  ) {
    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to);

    const allowed = ['DRAFT', 'VALIDATED', 'PARTIALLY_DELIVERED', 'DELIVERED', 'CLOSED', 'EXPIRED', 'CANCELLED'];
    const filterStatuses = statuses?.filter((s) => allowed.includes(s)) as
      | Prisma.EnumPurchaseOrderStatusFilter['in']
      | undefined;

    const orders = await this.prisma.purchaseOrder.findMany({
      where: {
        ...(from || to ? { orderDate: dateFilter } : {}),
        ...(filterStatuses && filterStatuses.length > 0 ? { status: { in: filterStatuses } } : {}),
      },
      include: {
        supplier: { select: { id: true, name: true } },
        purchaseInvoices: {
          where: { deletedAt: null },
          select: { totalAmount: true },
        },
        _count: { select: { items: true } },
      },
      orderBy: { orderDate: 'desc' },
    });

    return orders.map((o) => {
      const received = o.purchaseInvoices.reduce((s, i) => s + i.totalAmount, 0);
      return {
        id: o.id,
        reference: o.reference,
        orderDate: o.orderDate,
        expectedDate: o.expectedDate,
        validatedAt: o.validatedAt,
        status: o.status,
        supplier: o.supplier,
        estimatedTotalAmount: o.totalAmount,
        receivedAmount: received,
        unbilledEstimate: Math.max(0, o.totalAmount - received),
        itemCount: o._count.items,
      };
    });
  }

  // ========================================================================
  // AGREGAT ACHATS PAR FOURNISSEUR
  // ========================================================================
  async purchasesBySupplier(from?: string, to?: string) {
    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to);

    const receptions = await this.prisma.purchaseInvoice.findMany({
      where: {
        deletedAt: null,
        ...(from || to ? { receptionDate: dateFilter } : {}),
      },
      include: { supplier: { select: { id: true, name: true } } },
    });

    const map = new Map<
      string,
      {
        supplierId: string;
        supplierName: string;
        receptionCount: number;
        totalReceived: number;
        totalPaid: number;
        totalRemaining: number;
      }
    >();
    for (const r of receptions) {
      const k = r.supplierId;
      const existing = map.get(k);
      if (existing) {
        existing.receptionCount++;
        existing.totalReceived += r.totalAmount;
        existing.totalPaid += r.amountPaid;
        existing.totalRemaining += r.amountRemaining;
      } else {
        map.set(k, {
          supplierId: k,
          supplierName: r.supplier.name,
          receptionCount: 1,
          totalReceived: r.totalAmount,
          totalPaid: r.amountPaid,
          totalRemaining: r.amountRemaining,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.totalReceived - a.totalReceived);
  }

  // ========================================================================
  // EXPORT CSV
  // ========================================================================
  async exportCsv(): Promise<{ filename: string; csv: string }> {
    // Export simplifié : ventes du mois courant
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);

    const sales = await this.prisma.saleInvoice.findMany({
      where: { invoiceDate: { gte: start } },
      include: {
        customer: { select: { name: true } },
        items: { include: { finishedProduct: { select: { name: true, code: true } } } },
      },
      orderBy: { invoiceDate: 'desc' },
    });

    const rows: string[] = [
      'Référence;Date;Client;Type;Mode paiement;Statut;Total FCFA;Lignes',
    ];
    for (const s of sales) {
      const lignes = s.items
        .map((it) => `${it.productName} x${Number(it.quantity)} @${it.unitPrice}`)
        .join(' | ');
      rows.push(
        `${s.reference};${s.invoiceDate.toISOString().slice(0, 10)};${s.customer.name};${s.type};${s.paymentMethod};${s.paymentStatus};${s.totalAmount};"${lignes}"`,
      );
    }

    return {
      filename: `sacpromi-export-${new Date().toISOString().slice(0, 10)}.csv`,
      csv: rows.join('\n'),
    };
  }
}
