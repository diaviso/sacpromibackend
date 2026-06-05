import { Injectable, Logger } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Champs sensibles à masquer dans les payloads avant écriture en base.
 * On ne veut PAS conserver de mots de passe ou de tokens en clair dans les logs.
 */
const REDACTED_KEYS = [
  'password',
  'newPassword',
  'oldPassword',
  'currentPassword',
  'confirmPassword',
  'token',
  'accessToken',
  'refreshToken',
  'apiKey',
  'secret',
];

const MAX_BODY_DEPTH = 4;
const MAX_STRING_LEN = 2000;

function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (depth > MAX_BODY_DEPTH) return '[deep]';
  if (typeof value === 'string') {
    return value.length > MAX_STRING_LEN ? value.slice(0, MAX_STRING_LEN) + '…' : value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((v) => redact(v, depth + 1));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (REDACTED_KEYS.includes(k)) {
        out[k] = '***REDACTED***';
      } else {
        out[k] = redact(v, depth + 1);
      }
    }
    return out;
  }
  return value;
}

export interface AuditLogInput {
  action: AuditAction;
  userId?: string | null;
  userEmail?: string | null;
  userRole?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  method: string;
  path: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  statusCode: number;
  durationMs?: number | null;
  metadata?: Record<string, unknown> | null;
  errorMessage?: string | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Insère une ligne d'audit. Fire-and-forget : ne bloque jamais l'appelant.
   * Les erreurs d'insertion sont juste loguées (jamais propagées) pour ne pas
   * casser la fonctionnalité métier à cause d'un souci de table audit.
   */
  log(input: AuditLogInput): void {
    const data: Prisma.AuditLogCreateInput = {
      action: input.action,
      method: input.method,
      path: input.path.slice(0, 500),
      statusCode: input.statusCode,
      durationMs: input.durationMs ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ? input.userAgent.slice(0, 500) : null,
      userEmail: input.userEmail ?? null,
      userRole: input.userRole ?? null,
      metadata: input.metadata
        ? (redact(input.metadata) as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      errorMessage: input.errorMessage ? input.errorMessage.slice(0, 2000) : null,
    };
    if (input.userId) {
      data.user = { connect: { id: input.userId } };
    }
    // Fire and forget : on log async sans bloquer la réponse au client.
    this.prisma.auditLog.create({ data }).catch((err) => {
      this.logger.warn(`AuditLog insert failed: ${err?.message ?? err}`);
    });
  }

  /**
   * Lecture paginée + filtres pour la page admin /audit.
   */
  async list(query: {
    page: number;
    limit: number;
    userId?: string;
    action?: AuditAction;
    entityType?: string;
    entityId?: string;
    from?: string;
    to?: string;
    statusCode?: number;
    search?: string;
  }) {
    const where: Prisma.AuditLogWhereInput = {};
    if (query.userId) where.userId = query.userId;
    if (query.action) where.action = query.action;
    if (query.entityType) where.entityType = query.entityType;
    if (query.entityId) where.entityId = query.entityId;
    if (query.statusCode) where.statusCode = query.statusCode;
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = new Date(query.from);
      if (query.to) where.createdAt.lte = new Date(query.to);
    }
    if (query.search && query.search.trim()) {
      const s = query.search.trim();
      where.OR = [
        { path: { contains: s, mode: 'insensitive' } },
        { userEmail: { contains: s, mode: 'insensitive' } },
        { entityType: { contains: s, mode: 'insensitive' } },
        { entityId: { contains: s, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, fullName: true, email: true, role: true } },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      items,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    };
  }

  async findOne(id: string) {
    return this.prisma.auditLog.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, fullName: true, email: true, role: true } },
      },
    });
  }

  /**
   * Renvoie la liste distincte des entityType déjà loggés — pour alimenter
   * le filtre côté UI.
   */
  async listEntityTypes(): Promise<string[]> {
    const rows = await this.prisma.auditLog.findMany({
      where: { entityType: { not: null } },
      select: { entityType: true },
      distinct: ['entityType'],
      orderBy: { entityType: 'asc' },
    });
    return rows.map((r) => r.entityType!).filter(Boolean);
  }
}
