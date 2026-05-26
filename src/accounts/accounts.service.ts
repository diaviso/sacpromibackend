import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccountType, Prisma, TreasuryEntrySource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { paginate, PaginationDto } from '../common/dto/pagination.dto';

interface CreateAccountInput {
  name: string;
  type: AccountType;
  bankName?: string;
  accountNumber?: string;
  currency?: string;
  openingBalance?: number;
  note?: string;
}

interface UpdateAccountInput {
  name?: string;
  bankName?: string;
  accountNumber?: string;
  isActive?: boolean;
  note?: string;
}

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateAccountInput, userId: string) {
    const exists = await this.prisma.account.findUnique({ where: { name: dto.name } });
    if (exists) throw new ConflictException(`Un compte nommé "${dto.name}" existe déjà`);

    return this.prisma.$transaction(async (tx) => {
      const account = await tx.account.create({
        data: {
          name: dto.name,
          type: dto.type,
          bankName: dto.bankName,
          accountNumber: dto.accountNumber,
          currency: dto.currency ?? 'XOF',
          openingBalance: dto.openingBalance ?? 0,
          note: dto.note,
          createdById: userId,
        },
      });

      // Si solde d'ouverture > 0 → créer une entrée OPENING_BALANCE
      // pour que le grand livre reste cohérent (sinon les rapports la rateraient).
      if (account.openingBalance && account.openingBalance !== 0) {
        await tx.treasuryEntry.create({
          data: {
            accountId: account.id,
            entryDate: account.createdAt,
            amount: account.openingBalance,
            source: TreasuryEntrySource.OPENING_BALANCE,
            description: `Solde d'ouverture du compte "${account.name}"`,
            createdById: userId,
          },
        });
      }

      return account;
    });
  }

  async update(id: string, dto: UpdateAccountInput) {
    await this.getOrFail(id);
    if (dto.name) {
      const conflict = await this.prisma.account.findFirst({
        where: { name: dto.name, NOT: { id } },
      });
      if (conflict) throw new ConflictException(`Un compte nommé "${dto.name}" existe déjà`);
    }
    return this.prisma.account.update({ where: { id }, data: dto });
  }

  async findAll(
    query: PaginationDto,
    filters: {
      type?: AccountType;
      isActive?: boolean;
      search?: string;
      sortBy?: 'name' | 'createdAt' | 'openingBalance';
      sortOrder?: 'asc' | 'desc';
    },
  ) {
    const where: Prisma.AccountWhereInput = {};
    if (filters.type) where.type = filters.type;
    if (filters.isActive !== undefined) where.isActive = filters.isActive;

    if (filters.search && filters.search.trim()) {
      const term = filters.search.trim();
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { bankName: { contains: term, mode: 'insensitive' } },
        { accountNumber: { contains: term, mode: 'insensitive' } },
        { note: { contains: term, mode: 'insensitive' } },
      ];
    }

    const sortBy = filters.sortBy ?? 'name';
    const sortOrder = filters.sortOrder ?? (sortBy === 'name' ? 'asc' : 'desc');
    const orderBy: Prisma.AccountOrderByWithRelationInput[] =
      sortBy === 'name'
        ? [{ isActive: 'desc' }, { name: sortOrder }]
        : [{ isActive: 'desc' }, { [sortBy]: sortOrder } as Prisma.AccountOrderByWithRelationInput];

    const [accounts, total] = await this.prisma.$transaction([
      this.prisma.account.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy,
      }),
      this.prisma.account.count({ where }),
    ]);

    // Calcul des soldes en parallèle
    const balances = await this.computeBalances(accounts.map((a) => a.id));
    const items = accounts.map((a) => ({
      ...a,
      currentBalance: balances.get(a.id) ?? a.openingBalance,
    }));

    return paginate(items, total, query.page, query.limit);
  }

  async findOne(id: string) {
    const account = await this.getOrFail(id);
    const [balance, lastEntries] = await Promise.all([
      this.computeBalance(id),
      this.prisma.treasuryEntry.findMany({
        where: { accountId: id },
        orderBy: { entryDate: 'desc' },
        take: 20,
      }),
    ]);
    return { ...account, currentBalance: balance, lastEntries };
  }

  async remove(id: string) {
    const account = await this.getOrFail(id);
    const entriesCount = await this.prisma.treasuryEntry.count({
      where: {
        accountId: id,
        NOT: { source: TreasuryEntrySource.OPENING_BALANCE },
      },
    });
    if (entriesCount > 0) {
      throw new BadRequestException(
        `Impossible de supprimer ce compte : ${entriesCount} mouvement(s) y sont rattachés. Désactivez-le à la place.`,
      );
    }
    // Pas de mouvements → supprimer aussi l'éventuelle écriture OPENING_BALANCE en cascade
    await this.prisma.$transaction([
      this.prisma.treasuryEntry.deleteMany({ where: { accountId: id } }),
      this.prisma.account.delete({ where: { id: account.id } }),
    ]);
    return { id: account.id, deleted: true };
  }

  /** Solde courant d'un compte = openingBalance + somme des entries (signées) */
  async computeBalance(accountId: string): Promise<number> {
    const map = await this.computeBalances([accountId]);
    return map.get(accountId) ?? 0;
  }

  /** Optimisation : un seul GROUP BY pour calculer les soldes de N comptes */
  async computeBalances(accountIds: string[]): Promise<Map<string, number>> {
    if (accountIds.length === 0) return new Map();

    // Récupère openingBalance pour chaque compte
    const accounts = await this.prisma.account.findMany({
      where: { id: { in: accountIds } },
      select: { id: true, openingBalance: true },
    });
    const balances = new Map<string, number>();
    accounts.forEach((a) => balances.set(a.id, 0));
    // openingBalance est déjà reflété dans une entry OPENING_BALANCE,
    // donc on ne l'ajoute PAS deux fois ici. La somme suffit.

    const sums = await this.prisma.treasuryEntry.groupBy({
      by: ['accountId'],
      where: { accountId: { in: accountIds } },
      _sum: { amount: true },
    });
    sums.forEach((row) => balances.set(row.accountId, row._sum.amount ?? 0));

    // Edge case : aucun mouvement et aucun OPENING_BALANCE entry → solde = openingBalance
    accounts.forEach((a) => {
      if (!balances.get(a.id)) balances.set(a.id, a.openingBalance);
    });

    return balances;
  }

  private async getOrFail(id: string) {
    const account = await this.prisma.account.findUnique({ where: { id } });
    if (!account) throw new NotFoundException('Compte introuvable');
    return account;
  }

  /**
   * Récupère un compte par défaut (utilisé pour les paiements/dépenses sans accountId
   * lors de migrations ou en cas de besoin d'un fallback).
   * Retourne null si aucun compte actif n'existe.
   */
  async getDefaultAccount() {
    return this.prisma.account.findFirst({
      where: { type: AccountType.CASH, isActive: true },
      orderBy: { createdAt: 'asc' },
    });
  }
}
