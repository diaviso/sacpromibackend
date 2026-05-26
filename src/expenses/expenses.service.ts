import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ExpenseActivity, ExpenseStatus, Prisma, TreasuryEntrySource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto, CreateExpenseDto } from './dto/create-expense.dto';
import { paginate, PaginationDto } from '../common/dto/pagination.dto';
import { TreasuryService } from '../treasury/treasury.service';

@Injectable()
export class ExpensesService {
  private readonly logger = new Logger(ExpensesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly treasury: TreasuryService,
  ) {}

  async create(dto: CreateExpenseDto, userId: string) {
    const category = await this.prisma.expenseCategory.findUnique({ where: { id: dto.categoryId } });
    if (!category) throw new BadRequestException('Catégorie introuvable');

    if (dto.isRecurring && !dto.recurrenceDayOfMonth) {
      throw new BadRequestException('Une dépense récurrente doit avoir un jour de récurrence');
    }

    return this.prisma.$transaction(async (tx) => {
      // Validation du compte si fourni
      if (dto.accountId) {
        const account = await tx.account.findUnique({ where: { id: dto.accountId } });
        if (!account) throw new NotFoundException('Compte introuvable');
        if (!account.isActive) throw new BadRequestException('Le compte est désactivé');
      }

      const expense = await tx.expense.create({
        data: {
          amount: dto.amount,
          categoryId: dto.categoryId,
          activity: dto.activity,
          expenseDate: new Date(dto.expenseDate),
          description: dto.description,
          beneficiary: dto.beneficiary,
          receiptUrl: dto.receiptUrl,
          isRecurring: dto.isRecurring ?? false,
          recurrenceDayOfMonth: dto.recurrenceDayOfMonth,
          accountId: dto.accountId,
          status: ExpenseStatus.CONFIRMED,
          createdById: userId,
        },
        include: { category: true },
      });

      // Écriture trésorerie (débit) — uniquement si compte fourni ET dépense confirmée.
      // Les dépenses récurrentes-templates ne génèrent pas d'écriture (elles ne sortent pas d'argent par elles-mêmes).
      if (dto.accountId && expense.status === ExpenseStatus.CONFIRMED && !dto.isRecurring) {
        await this.treasury.writeEntry({
          tx,
          accountId: dto.accountId,
          entryDate: new Date(dto.expenseDate),
          amount: -dto.amount,
          source: TreasuryEntrySource.EXPENSE,
          description: `Dépense ${category.name}${dto.beneficiary ? ` — ${dto.beneficiary}` : ''}`,
          expenseId: expense.id,
          userId,
        });
      }

      return expense;
    });
  }

  async findAll(query: PaginationDto, filters: {
    categoryId?: string;
    activity?: ExpenseActivity;
    status?: ExpenseStatus;
    from?: string;
    to?: string;
    search?: string;
    sortBy?: 'expenseDate' | 'amount' | 'createdAt';
    sortOrder?: 'asc' | 'desc';
  }) {
    const where: Prisma.ExpenseWhereInput = {};
    if (filters.categoryId) where.categoryId = filters.categoryId;
    if (filters.activity) where.activity = filters.activity;
    if (filters.status) where.status = filters.status;
    if (filters.from || filters.to) {
      where.expenseDate = {};
      if (filters.from) where.expenseDate.gte = new Date(filters.from);
      if (filters.to) where.expenseDate.lte = new Date(filters.to);
    }
    if (filters.search && filters.search.trim()) {
      const term = filters.search.trim();
      where.OR = [
        { description: { contains: term, mode: 'insensitive' } },
        { beneficiary: { contains: term, mode: 'insensitive' } },
        { category: { name: { contains: term, mode: 'insensitive' } } },
      ];
    }

    const sortBy = filters.sortBy ?? 'expenseDate';
    const sortOrder = filters.sortOrder ?? 'desc';
    const orderBy: Prisma.ExpenseOrderByWithRelationInput = { [sortBy]: sortOrder };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.expense.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy,
        include: {
          category: true,
          createdBy: { select: { id: true, fullName: true } },
        },
      }),
      this.prisma.expense.count({ where }),
    ]);

    return paginate(items, total, query.page, query.limit);
  }

  async findOne(id: string) {
    const expense = await this.prisma.expense.findUnique({
      where: { id },
      include: { category: true, createdBy: { select: { id: true, fullName: true } } },
    });
    if (!expense) throw new NotFoundException(`Dépense ${id} introuvable`);
    return expense;
  }

  async confirm(id: string, dto?: { amount?: number; accountId?: string }, userId?: string) {
    return this.prisma.$transaction(async (tx) => {
      const expense = await tx.expense.findUnique({
        where: { id },
        include: { category: true },
      });
      if (!expense) throw new NotFoundException('Dépense introuvable');
      if (expense.status === ExpenseStatus.CONFIRMED) {
        throw new BadRequestException('Dépense déjà confirmée');
      }

      const finalAmount = dto?.amount ?? expense.amount;
      const finalAccountId = dto?.accountId ?? expense.accountId;

      if (finalAccountId) {
        const account = await tx.account.findUnique({ where: { id: finalAccountId } });
        if (!account) throw new NotFoundException('Compte introuvable');
        if (!account.isActive) throw new BadRequestException('Le compte est désactivé');
      }

      const updated = await tx.expense.update({
        where: { id },
        data: {
          status: ExpenseStatus.CONFIRMED,
          amount: finalAmount,
          accountId: finalAccountId,
        },
      });

      // Génère l'écriture trésorerie au moment de la confirmation
      if (finalAccountId && userId) {
        await this.treasury.writeEntry({
          tx,
          accountId: finalAccountId,
          entryDate: expense.expenseDate,
          amount: -finalAmount,
          source: TreasuryEntrySource.EXPENSE,
          description: `Dépense ${expense.category.name}${expense.beneficiary ? ` — ${expense.beneficiary}` : ''} (confirmée)`,
          expenseId: expense.id,
          userId,
        });
      }

      return updated;
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.expense.delete({ where: { id } });
    return { message: 'Dépense supprimée' };
  }

  // ========================================
  // CATEGORIES
  // ========================================

  async createCategory(dto: CreateCategoryDto) {
    return this.prisma.expenseCategory.create({ data: dto });
  }

  async findAllCategories() {
    return this.prisma.expenseCategory.findMany({
      orderBy: { displayOrder: 'asc' },
    });
  }

  async updateCategory(id: string, dto: Partial<CreateCategoryDto>) {
    const category = await this.prisma.expenseCategory.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Catégorie introuvable');
    return this.prisma.expenseCategory.update({ where: { id }, data: dto });
  }

  async deleteCategory(id: string) {
    const category = await this.prisma.expenseCategory.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Catégorie introuvable');
    if (category.isDefault) {
      throw new BadRequestException('Catégorie par défaut non supprimable');
    }
    const usageCount = await this.prisma.expense.count({ where: { categoryId: id } });
    if (usageCount > 0) {
      throw new BadRequestException(`Catégorie utilisée par ${usageCount} dépense(s)`);
    }
    await this.prisma.expenseCategory.delete({ where: { id } });
    return { message: 'Catégorie supprimée' };
  }

  // ========================================
  // CRON RÉCURRENTES — 1er du mois à 02:00 (timezone Africa/Dakar)
  // ========================================
  @Cron('0 2 1 * *', { timeZone: 'Africa/Dakar' })
  async generateRecurringExpenses() {
    const now = new Date();
    return this.runRecurringExpensesGeneration(now);
  }

  /**
   * Génère les dépenses récurrentes pour le mois de `targetDate` de façon idempotente.
   *
   * Mécanisme de protection contre les doublons :
   * 1. Une ligne `JobLock` avec clé unique `recurring-expenses-YYYY-MM` est créée
   *    en début d'exécution dans une transaction. La contrainte unique sur `key`
   *    fait échouer toute exécution concurrente avec une P2002 → on sort proprement.
   * 2. À l'intérieur, on relit les templates et on vérifie qu'aucune instance
   *    n'a déjà été générée pour le mois (double sécurité).
   *
   * Cette approche résiste aux scénarios :
   * - Redémarrage du conteneur Railway pendant le cron → 2e démarrage = no-op
   * - Scaling horizontal (2 pods qui démarrent en même temps) → un seul gagne le lock
   * - Déclenchement manuel par le directeur (endpoint API ou rejouage)
   */
  async runRecurringExpensesGeneration(targetDate: Date) {
    const year = targetDate.getFullYear();
    const month = targetDate.getMonth() + 1; // 1-12
    const lockKey = `recurring-expenses-${year}-${String(month).padStart(2, '0')}`;

    this.logger.log(`🔄 Génération des dépenses récurrentes ${lockKey}`);

    // Étape 1 : tenter d'acquérir le verrou. Si la contrainte unique échoue,
    // c'est qu'un autre process a déjà tourné — on sort sans erreur.
    try {
      await this.prisma.jobLock.create({
        data: { key: lockKey, note: 'Génération automatique mensuelle' },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        this.logger.warn(`⏭️  Lock déjà acquis pour ${lockKey} — exécution ignorée (idempotence)`);
        return { skipped: true, reason: 'already-executed', generated: 0 };
      }
      throw err;
    }

    // Étape 2 : générer les instances pour chaque template. Le tout dans une
    // transaction pour garantir l'atomicité (si une création échoue, rien
    // n'est créé). Si une instance existe déjà, on l'ignore (sécurité 2).
    const recurringTemplates = await this.prisma.expense.findMany({
      where: { isRecurring: true, parentRecurringId: null },
    });

    const monthStart = new Date(year, month - 1, 1);
    const nextMonthStart = new Date(year, month, 1);

    let generated = 0;
    await this.prisma.$transaction(async (tx) => {
      for (const template of recurringTemplates) {
        const dayOfMonth = template.recurrenceDayOfMonth ?? 1;
        // Jour valide pour le mois (ex: 31 février → ramené à fin de mois)
        const lastDayOfMonth = new Date(year, month, 0).getDate();
        const safeDay = Math.min(dayOfMonth, lastDayOfMonth);
        const expenseDate = new Date(year, month - 1, safeDay);

        // Sécurité 2 : vérifier qu'aucune instance n'existe déjà pour ce template ce mois-ci
        const existing = await tx.expense.findFirst({
          where: {
            parentRecurringId: template.id,
            expenseDate: { gte: monthStart, lt: nextMonthStart },
          },
        });
        if (existing) continue;

        await tx.expense.create({
          data: {
            amount: template.amount,
            categoryId: template.categoryId,
            activity: template.activity,
            expenseDate,
            description: template.description,
            beneficiary: template.beneficiary,
            accountId: template.accountId,
            isRecurring: false,
            parentRecurringId: template.id,
            status: ExpenseStatus.PENDING_CONFIRMATION,
            createdById: template.createdById,
          },
        });
        generated++;
      }
    });

    this.logger.log(
      `✅ ${generated} dépense(s) récurrente(s) générée(s) pour ${lockKey} (en attente de confirmation)`,
    );
    return { skipped: false, generated, month: lockKey };
  }
}
