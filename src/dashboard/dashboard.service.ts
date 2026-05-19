import { Injectable } from '@nestjs/common';
import {
  ExpenseActivity,
  FinishedStockMovementType,
  LotStatus,
  PaymentStatus,
  ProductionOrderStatus,
  RawStockMovementType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface PeriodRange {
  from: Date;
  to: Date;
}

function rangeForPeriod(
  period: 'today' | 'week' | 'month' | 'custom',
  from?: string,
  to?: string,
): PeriodRange {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  if (period === 'custom' && from && to) {
    return { from: new Date(from), to: new Date(to) };
  }
  if (period === 'today') {
    return { from: start, to: end };
  }
  if (period === 'week') {
    const day = start.getDay() || 7; // monday = 1
    start.setDate(start.getDate() - day + 1);
    return { from: start, to: end };
  }
  // month
  start.setDate(1);
  return { from: start, to: end };
}

function previousRange(range: PeriodRange): PeriodRange {
  const duration = range.to.getTime() - range.from.getTime();
  return {
    from: new Date(range.from.getTime() - duration - 1),
    to: new Date(range.from.getTime() - 1),
  };
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  // ========================================================================
  // KPI GLOBAUX
  // ========================================================================
  async kpi(period: 'today' | 'week' | 'month' | 'custom', from?: string, to?: string) {
    const range = rangeForPeriod(period, from, to);
    const prev = previousRange(range);

    const [current, previous] = await Promise.all([
      this.computeMetrics(range),
      this.computeMetrics(prev),
    ]);

    const computeChange = (curr: number, prev: number) =>
      prev === 0 ? (curr > 0 ? 100 : 0) : Math.round(((curr - prev) / prev) * 10000) / 100;

    return {
      ...current,
      comparison: {
        revenue: computeChange(current.revenue, previous.revenue),
        netResult: computeChange(current.netResult, previous.netResult),
      },
    };
  }

  private async computeMetrics(range: PeriodRange) {
    const [salesAgg, purchaseAgg, productionAgg, expensesAgg, salesCount] = await Promise.all([
      this.prisma.saleInvoice.aggregate({
        where: { invoiceDate: { gte: range.from, lte: range.to }, totalAmount: { gt: 0 } },
        _sum: { totalAmount: true },
      }),
      this.prisma.purchaseInvoice.aggregate({
        where: { invoiceDate: { gte: range.from, lte: range.to } },
        _sum: { totalAmount: true },
      }),
      this.prisma.productionOrder.aggregate({
        where: {
          status: ProductionOrderStatus.COMPLETED,
          productionDate: { gte: range.from, lte: range.to },
        },
        _sum: { transformationCost: true, totalCost: true },
      }),
      this.prisma.expense.aggregate({
        where: { status: 'CONFIRMED', expenseDate: { gte: range.from, lte: range.to } },
        _sum: { amount: true },
      }),
      this.prisma.saleInvoice.count({
        where: { invoiceDate: { gte: range.from, lte: range.to }, totalAmount: { gt: 0 } },
      }),
    ]);

    const revenue = salesAgg._sum.totalAmount ?? 0;
    const rawMaterialCost = purchaseAgg._sum.totalAmount ?? 0;
    const productionCost = productionAgg._sum.transformationCost ?? 0;
    const grossMargin = revenue - rawMaterialCost - productionCost;
    const expenses = expensesAgg._sum.amount ?? 0;
    const netResult = grossMargin - expenses;
    const netMarginRate = revenue > 0 ? Math.round((netResult / revenue) * 10000) / 100 : 0;

    return {
      period: { from: range.from, to: range.to },
      revenue,
      rawMaterialCost,
      productionCost,
      grossMargin,
      expenses,
      netResult,
      netMarginRate,
      salesCount,
    };
  }

  // ========================================================================
  // RENTABILITÉ PAR ACTIVITÉ
  // ========================================================================
  async profitabilityByActivity(
    period: 'today' | 'week' | 'month' | 'custom',
    from?: string,
    to?: string,
  ) {
    const range = rangeForPeriod(period, from, to);

    // Production = ventes d'aliments - matières - charges PRODUCTION
    const [feedSales, animalSales, materialsCost, productionExpenses, breedingExpenses, commercialExpenses, generalExpenses, batchCosts] =
      await Promise.all([
        this.prisma.saleInvoiceItem.aggregate({
          where: {
            saleInvoice: { invoiceDate: { gte: range.from, lte: range.to } },
            finishedProduct: { category: { in: ['POULTRY_FEED', 'CATTLE_FEED'] } },
          },
          _sum: { lineAmount: true },
        }),
        this.prisma.saleInvoiceItem.aggregate({
          where: {
            saleInvoice: { invoiceDate: { gte: range.from, lte: range.to } },
            finishedProduct: { category: { in: ['LIVE_CHICKEN', 'SLAUGHTERED_CHICKEN'] } },
          },
          _sum: { lineAmount: true },
        }),
        this.prisma.purchaseInvoice.aggregate({
          where: { invoiceDate: { gte: range.from, lte: range.to } },
          _sum: { totalAmount: true },
        }),
        this.prisma.expense.aggregate({
          where: {
            status: 'CONFIRMED',
            activity: ExpenseActivity.PRODUCTION,
            expenseDate: { gte: range.from, lte: range.to },
          },
          _sum: { amount: true },
        }),
        this.prisma.expense.aggregate({
          where: {
            status: 'CONFIRMED',
            activity: ExpenseActivity.BREEDING,
            expenseDate: { gte: range.from, lte: range.to },
          },
          _sum: { amount: true },
        }),
        this.prisma.expense.aggregate({
          where: {
            status: 'CONFIRMED',
            activity: ExpenseActivity.COMMERCIAL,
            expenseDate: { gte: range.from, lte: range.to },
          },
          _sum: { amount: true },
        }),
        this.prisma.expense.aggregate({
          where: {
            status: 'CONFIRMED',
            activity: ExpenseActivity.GENERAL,
            expenseDate: { gte: range.from, lte: range.to },
          },
          _sum: { amount: true },
        }),
        this.prisma.breedingBatch.aggregate({
          where: {
            closeDate: { gte: range.from, lte: range.to },
            status: 'CLOSED',
          },
          _sum: { totalCost: true },
        }),
      ]);

    const productionRevenue = feedSales._sum.lineAmount ?? 0;
    const breedingRevenue = animalSales._sum.lineAmount ?? 0;
    const productionMaterialsCost = materialsCost._sum.totalAmount ?? 0;
    const productionExpensesAmt = productionExpenses._sum.amount ?? 0;
    const breedingTotalCost = batchCosts._sum.totalCost ?? 0;
    const breedingExpensesAmt = breedingExpenses._sum.amount ?? 0;
    const commercialExpensesAmt = commercialExpenses._sum.amount ?? 0;
    const generalExpensesAmt = generalExpenses._sum.amount ?? 0;

    const productionResult = productionRevenue - productionMaterialsCost - productionExpensesAmt;
    const breedingResult = breedingRevenue - breedingTotalCost - breedingExpensesAmt;
    const consolidatedResult =
      productionResult + breedingResult - commercialExpensesAmt - generalExpensesAmt;

    return {
      period: { from: range.from, to: range.to },
      production: {
        revenue: productionRevenue,
        materialsCost: productionMaterialsCost,
        expenses: productionExpensesAmt,
        result: productionResult,
      },
      breeding: {
        revenue: breedingRevenue,
        batchesCost: breedingTotalCost,
        expenses: breedingExpensesAmt,
        result: breedingResult,
      },
      commercial: {
        expenses: commercialExpensesAmt,
      },
      general: {
        expenses: generalExpensesAmt,
      },
      consolidatedResult,
    };
  }

  // ========================================================================
  // TENDANCES
  // ========================================================================
  async trends(period: '7d' | '30d' | '90d') {
    const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
    const start = new Date();
    start.setDate(start.getDate() - days);
    start.setHours(0, 0, 0, 0);

    const sales = await this.prisma.saleInvoice.findMany({
      where: { invoiceDate: { gte: start } },
      select: { invoiceDate: true, totalAmount: true },
    });
    const expenses = await this.prisma.expense.findMany({
      where: { expenseDate: { gte: start }, status: 'CONFIRMED' },
      select: { expenseDate: true, amount: true },
    });
    const purchases = await this.prisma.purchaseInvoice.findMany({
      where: { invoiceDate: { gte: start } },
      select: { invoiceDate: true, totalAmount: true },
    });

    const buckets = new Map<
      string,
      { date: string; revenue: number; expenses: number; costs: number; netResult: number }
    >();

    const initBucket = (key: string) => ({ date: key, revenue: 0, expenses: 0, costs: 0, netResult: 0 });
    const fmtDay = (d: Date) => d.toISOString().slice(0, 10);

    for (let i = 0; i <= days; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = fmtDay(d);
      buckets.set(key, initBucket(key));
    }

    sales.forEach((s) => {
      const key = fmtDay(s.invoiceDate);
      const b = buckets.get(key);
      if (b) b.revenue += s.totalAmount;
    });
    expenses.forEach((e) => {
      const key = fmtDay(e.expenseDate);
      const b = buckets.get(key);
      if (b) b.expenses += e.amount;
    });
    purchases.forEach((p) => {
      const key = fmtDay(p.invoiceDate);
      const b = buckets.get(key);
      if (b) b.costs += p.totalAmount;
    });

    const result = Array.from(buckets.values()).map((b) => ({
      ...b,
      netResult: b.revenue - b.costs - b.expenses,
    }));

    return result;
  }

  // ========================================================================
  // ALERTES
  // ========================================================================
  async alerts() {
    const today = new Date();
    const sevenDays = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [lowStockMP, lowStockPF, expiringMP, expiringPF, expiredMP, expiredPF, supplierDebts, customerReceivables, breedingAlerts, pendingExpenses] = await Promise.all([
      this.prisma.rawMaterial.count({
        where: { isActive: true, currentStock: { lt: this.prisma.rawMaterial.fields.alertThreshold } },
      }),
      this.prisma.finishedProduct.count({
        where: { isActive: true, currentStock: { lt: this.prisma.finishedProduct.fields.alertThreshold } },
      }),
      this.prisma.rawMaterialLot.count({
        where: { status: LotStatus.ACTIVE, expirationDate: { gte: today, lte: sevenDays } },
      }),
      this.prisma.finishedProductLot.count({
        where: { status: LotStatus.ACTIVE, expirationDate: { gte: today, lte: sevenDays } },
      }),
      this.prisma.rawMaterialLot.count({
        where: { status: LotStatus.ACTIVE, expirationDate: { lt: today } },
      }),
      this.prisma.finishedProductLot.count({
        where: { status: LotStatus.ACTIVE, expirationDate: { lt: today } },
      }),
      this.prisma.purchaseInvoice.count({
        where: {
          paymentStatus: { in: ['UNPAID', 'PARTIALLY_PAID'] },
          invoiceDate: { lt: new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000) },
        },
      }),
      this.prisma.saleInvoice.count({
        where: {
          paymentStatus: { in: ['UNPAID', 'PARTIALLY_PAID'] },
          invoiceDate: { lt: new Date(today.getTime() - 60 * 24 * 60 * 60 * 1000) },
        },
      }),
      this.prisma.breedingBatch.count({
        where: { status: 'ACTIVE' },
      }),
      this.prisma.expense.count({
        where: { status: 'PENDING_CONFIRMATION' },
      }),
    ]);

    return {
      lowStockMP,
      lowStockPF,
      expiringMP,
      expiringPF,
      expiredMP,
      expiredPF,
      supplierDebtsOverdue: supplierDebts,
      customerReceivablesOver60: customerReceivables,
      activeBreedingBatches: breedingAlerts,
      pendingExpenses,
    };
  }

  // ========================================================================
  // CA PAR MODE DE PAIEMENT
  // ========================================================================
  async revenueByPayment(
    period: 'today' | 'week' | 'month' | 'custom',
    from?: string,
    to?: string,
  ) {
    const range = rangeForPeriod(period, from, to);
    const sales = await this.prisma.saleInvoice.groupBy({
      by: ['paymentMethod'],
      where: { invoiceDate: { gte: range.from, lte: range.to }, totalAmount: { gt: 0 } },
      _sum: { totalAmount: true },
      _count: true,
    });
    return sales.map((s) => ({
      paymentMethod: s.paymentMethod,
      amount: s._sum.totalAmount ?? 0,
      count: s._count,
    }));
  }

  // ========================================================================
  // TRÉSORERIE
  // ========================================================================
  async treasury(period: 'today' | 'week' | 'month' | 'custom', from?: string, to?: string) {
    const range = rangeForPeriod(period, from, to);

    const [customerPayments, supplierPayments, expensesAgg, supplierDebt, customerReceivables] =
      await Promise.all([
        this.prisma.customerPayment.aggregate({
          where: { paymentDate: { gte: range.from, lte: range.to } },
          _sum: { amount: true },
        }),
        this.prisma.supplierPayment.aggregate({
          where: { paymentDate: { gte: range.from, lte: range.to } },
          _sum: { amount: true },
        }),
        this.prisma.expense.aggregate({
          where: { status: 'CONFIRMED', expenseDate: { gte: range.from, lte: range.to } },
          _sum: { amount: true },
        }),
        this.prisma.purchaseInvoice.aggregate({
          where: { paymentStatus: { in: ['UNPAID', 'PARTIALLY_PAID'] } },
          _sum: { amountRemaining: true },
        }),
        this.prisma.saleInvoice.aggregate({
          where: { paymentStatus: { in: ['UNPAID', 'PARTIALLY_PAID'] }, totalAmount: { gt: 0 } },
          _sum: { amountRemaining: true },
        }),
      ]);

    const inflows = customerPayments._sum.amount ?? 0;
    const outflows = (supplierPayments._sum.amount ?? 0) + (expensesAgg._sum.amount ?? 0);
    return {
      period: { from: range.from, to: range.to },
      inflows,
      outflows,
      netCashFlow: inflows - outflows,
      totalSupplierDebt: supplierDebt._sum.amountRemaining ?? 0,
      totalCustomerReceivables: customerReceivables._sum.amountRemaining ?? 0,
    };
  }

  // ========================================================================
  // CRÉANCES CLIENTS PAR ANCIENNETÉ
  // ========================================================================
  async customerReceivables() {
    const unpaidInvoices = await this.prisma.saleInvoice.findMany({
      where: { paymentStatus: { in: ['UNPAID', 'PARTIALLY_PAID'] }, totalAmount: { gt: 0 } },
      include: { customer: { select: { id: true, name: true } } },
      orderBy: { invoiceDate: 'asc' },
    });

    const today = new Date();
    const day = 24 * 60 * 60 * 1000;

    const buckets = {
      under30: { range: '< 30j', amount: 0, count: 0 },
      between30And60: { range: '30-60j', amount: 0, count: 0 },
      over60: { range: '> 60j', amount: 0, count: 0 },
    };

    const byCustomerMap = new Map<
      string,
      { customerId: string; customerName: string; totalDue: number; invoiceCount: number }
    >();

    for (const inv of unpaidInvoices) {
      const ageDays = (today.getTime() - inv.invoiceDate.getTime()) / day;
      if (ageDays < 30) {
        buckets.under30.amount += inv.amountRemaining;
        buckets.under30.count++;
      } else if (ageDays < 60) {
        buckets.between30And60.amount += inv.amountRemaining;
        buckets.between30And60.count++;
      } else {
        buckets.over60.amount += inv.amountRemaining;
        buckets.over60.count++;
      }

      const existing = byCustomerMap.get(inv.customerId);
      if (existing) {
        existing.totalDue += inv.amountRemaining;
        existing.invoiceCount++;
      } else {
        byCustomerMap.set(inv.customerId, {
          customerId: inv.customerId,
          customerName: inv.customer.name,
          totalDue: inv.amountRemaining,
          invoiceCount: 1,
        });
      }
    }

    return {
      totalDue: unpaidInvoices.reduce((s, i) => s + i.amountRemaining, 0),
      byAge: buckets,
      byCustomer: Array.from(byCustomerMap.values()).sort((a, b) => b.totalDue - a.totalDue),
    };
  }

  // ========================================================================
  // DETTES FOURNISSEURS (existant)
  // ========================================================================
  async supplierDebts() {
    const unpaidInvoices = await this.prisma.purchaseInvoice.findMany({
      where: { paymentStatus: { in: [PaymentStatus.UNPAID, PaymentStatus.PARTIALLY_PAID] } },
      include: { supplier: { select: { id: true, name: true } } },
      orderBy: { invoiceDate: 'asc' },
    });

    const totalDue = unpaidInvoices.reduce((sum, inv) => sum + inv.amountRemaining, 0);
    const bySupplierMap = new Map<
      string,
      { supplierId: string; supplierName: string; invoiceCount: number; totalDue: number }
    >();

    for (const inv of unpaidInvoices) {
      const existing = bySupplierMap.get(inv.supplierId);
      if (existing) {
        existing.invoiceCount++;
        existing.totalDue += inv.amountRemaining;
      } else {
        bySupplierMap.set(inv.supplierId, {
          supplierId: inv.supplierId,
          supplierName: inv.supplier.name,
          invoiceCount: 1,
          totalDue: inv.amountRemaining,
        });
      }
    }

    const today = new Date();
    const overdueThreshold = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    const overdueInvoices = unpaidInvoices
      .filter((inv) => inv.invoiceDate < overdueThreshold)
      .map((inv) => ({
        id: inv.id,
        reference: inv.reference,
        supplierInvoiceNumber: inv.supplierInvoiceNumber,
        supplierId: inv.supplierId,
        supplierName: inv.supplier.name,
        invoiceDate: inv.invoiceDate,
        totalAmount: inv.totalAmount,
        amountRemaining: inv.amountRemaining,
        daysSinceInvoice: Math.floor(
          (today.getTime() - inv.invoiceDate.getTime()) / (24 * 60 * 60 * 1000),
        ),
      }));

    return {
      totalDue,
      supplierCount: Array.from(bySupplierMap.values()).length,
      invoiceCount: unpaidInvoices.length,
      bySupplier: Array.from(bySupplierMap.values()).sort((a, b) => b.totalDue - a.totalDue),
      overdueInvoices,
    };
  }
}
