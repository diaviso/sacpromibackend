import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CapitalMovementType,
  Prisma,
  TreasuryEntrySource,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { paginate, PaginationDto } from '../common/dto/pagination.dto';
import { TreasuryService } from '../treasury/treasury.service';

interface CreateCapitalMovementInput {
  type: CapitalMovementType;
  amount: number;
  movementDate: string;
  accountId: string;
  contributorName?: string;
  description?: string;
  documentUrl?: string;
}

@Injectable()
export class CapitalMovementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly treasury: TreasuryService,
  ) {}

  async create(dto: CreateCapitalMovementInput, userId: string) {
    if (dto.amount <= 0) throw new BadRequestException('Montant invalide');

    return this.prisma.$transaction(async (tx) => {
      const account = await tx.account.findUnique({ where: { id: dto.accountId } });
      if (!account) throw new NotFoundException('Compte introuvable');
      if (!account.isActive) {
        throw new BadRequestException('Le compte est désactivé');
      }

      const reference = await this.nextReference(tx, dto.type);
      const movementDate = new Date(dto.movementDate);

      const movement = await tx.capitalMovement.create({
        data: {
          reference,
          type: dto.type,
          amount: dto.amount,
          movementDate,
          accountId: dto.accountId,
          contributorName: dto.contributorName,
          description: dto.description,
          documentUrl: dto.documentUrl,
          createdById: userId,
        },
      });

      // Détermine le signe : entrée d'argent (CONTRIBUTION/SUBSIDY/GRANT) vs sortie (WITHDRAWAL/DIVIDEND)
      const isInflow =
        dto.type === CapitalMovementType.CONTRIBUTION ||
        dto.type === CapitalMovementType.SUBSIDY ||
        dto.type === CapitalMovementType.GRANT;
      const signedAmount = isInflow ? dto.amount : -dto.amount;

      await this.treasury.writeEntry({
        tx,
        accountId: account.id,
        entryDate: movementDate,
        amount: signedAmount,
        source: TreasuryEntrySource.CAPITAL_MOVEMENT,
        description: `${this.labelForType(dto.type)} ${reference}${dto.contributorName ? ` — ${dto.contributorName}` : ''}`,
        capitalMovementId: movement.id,
        userId,
      });

      return movement;
    });
  }

  async findAll(
    query: PaginationDto,
    filters: { type?: CapitalMovementType; accountId?: string; from?: string; to?: string },
  ) {
    const where: Prisma.CapitalMovementWhereInput = {};
    if (filters.type) where.type = filters.type;
    if (filters.accountId) where.accountId = filters.accountId;
    if (filters.from || filters.to) {
      where.movementDate = {};
      if (filters.from) where.movementDate.gte = new Date(filters.from);
      if (filters.to) where.movementDate.lte = new Date(filters.to);
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.capitalMovement.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: { movementDate: 'desc' },
        include: {
          account: { select: { id: true, name: true, type: true } },
          createdBy: { select: { id: true, fullName: true } },
        },
      }),
      this.prisma.capitalMovement.count({ where }),
    ]);

    return paginate(items, total, query.page, query.limit);
  }

  async findOne(id: string) {
    const movement = await this.prisma.capitalMovement.findUnique({
      where: { id },
      include: {
        account: true,
        createdBy: { select: { id: true, fullName: true } },
      },
    });
    if (!movement) throw new NotFoundException('Mouvement de capital introuvable');
    return movement;
  }

  // ----- helpers -----

  private async nextReference(tx: Prisma.TransactionClient, type: CapitalMovementType) {
    const prefix = ({
      CONTRIBUTION: 'APP',
      WITHDRAWAL: 'RTR',
      SUBSIDY: 'SUB',
      GRANT: 'DON',
      DIVIDEND: 'DIV',
    } as Record<CapitalMovementType, string>)[type];
    const year = new Date().getFullYear();
    const counter = await tx.sequenceCounter.upsert({
      where: { prefix_year: { prefix, year } },
      update: { counter: { increment: 1 } },
      create: { prefix, year, counter: 1 },
    });
    return `${prefix}-${year}-${String(counter.counter).padStart(5, '0')}`;
  }

  private labelForType(type: CapitalMovementType) {
    return ({
      CONTRIBUTION: 'Apport en capital',
      WITHDRAWAL: 'Retrait associé',
      SUBSIDY: 'Subvention',
      GRANT: 'Don / aide',
      DIVIDEND: 'Distribution dividende',
    } as Record<CapitalMovementType, string>)[type];
  }
}
