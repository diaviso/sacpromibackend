import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SequenceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Génère une référence séquentielle au format PREFIX-YYYY-NNNN.
   * Doit être appelée à l'intérieur d'une transaction Prisma pour garantir l'unicité.
   * Exemple : nextReference('BC', 2026) → "BC-2026-0001"
   */
  async nextReference(
    prefix: string,
    year: number,
    tx?: Prisma.TransactionClient,
  ): Promise<string> {
    const client = tx ?? this.prisma;

    const counter = await client.sequenceCounter.upsert({
      where: { prefix_year: { prefix, year } },
      create: { prefix, year, counter: 1 },
      update: { counter: { increment: 1 } },
    });

    const padded = counter.counter.toString().padStart(4, '0');
    return `${prefix}-${year}-${padded}`;
  }

  /** Renvoie l'année courante (selon fuseau Africa/Dakar). */
  currentYear(): number {
    return new Date().getFullYear();
  }
}
