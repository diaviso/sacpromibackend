import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap, catchError, throwError } from 'rxjs';
import type { Request } from 'express';
import { AuditAction } from '@prisma/client';
import { AuditService } from './audit.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';

/**
 * Intercepteur GLOBAL : écrit une ligne dans `audit_logs` pour chaque mutation
 * HTTP (POST/PATCH/PUT/DELETE) et pour les actions auth importantes.
 *
 * Stratégie :
 *  - On ignore les GET pour ne pas exploser le volume (audit = traçabilité
 *    des changements et tentatives d'accès, pas un access log complet).
 *  - On capture toujours la requête, succès ou erreur (pour voir les 401/403
 *    et les tentatives échouées).
 *  - L'insertion est fire-and-forget (AuditService.log) : aucune latence
 *    ajoutée à la réponse, aucune erreur d'audit ne casse la requête.
 *  - L'action est déduite du chemin (login/logout/cancel/validate…) avec
 *    fallback sur la méthode HTTP.
 *  - entityType + entityId sont extraits du path `/api/<entity>/<uuid>`.
 *  - Le body est masqué pour les champs sensibles (password, token…).
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  // Endpoints pour lesquels on écrit aussi un audit même en GET (export…).
  private static readonly AUDITED_GET_PATHS = [
    /\/api\/settings\/export-csv/,
    /\/api\/audit-logs/,
  ];

  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const req = context.switchToHttp().getRequest<
      Request & { user?: AuthenticatedUser }
    >();
    const method = (req.method ?? 'GET').toUpperCase();
    const isMutation = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method);
    const path = (req.originalUrl || req.url || '').split('?')[0] || '';

    if (!isMutation && !AuditInterceptor.AUDITED_GET_PATHS.some((re) => re.test(path))) {
      return next.handle();
    }

    const start = Date.now();
    const meta = extractAction(method, path, req.body);

    return next.handle().pipe(
      tap((response) => {
        this.writeLog({
          req,
          method,
          path,
          start,
          statusCode: req.res?.statusCode ?? 200,
          action: meta.action,
          entityType: meta.entityType,
          entityId: meta.entityId ?? extractIdFromResponse(response),
          metadata: buildMetadata(req, meta.action),
        });
      }),
      catchError((err) => {
        this.writeLog({
          req,
          method,
          path,
          start,
          statusCode: err?.status ?? 500,
          action: failureActionFor(meta.action),
          entityType: meta.entityType,
          entityId: meta.entityId,
          metadata: buildMetadata(req, meta.action),
          errorMessage: err?.message ?? String(err),
        });
        return throwError(() => err);
      }),
    );
  }

  private writeLog(params: {
    req: Request & { user?: AuthenticatedUser; __auditLogged?: boolean };
    method: string;
    path: string;
    start: number;
    statusCode: number;
    action: AuditAction;
    entityType?: string;
    entityId?: string;
    metadata?: Record<string, unknown> | null;
    errorMessage?: string;
  }) {
    // Marque la requête comme déjà auditée pour que le HttpExceptionFilter
    // ne re-logue pas la même erreur en double.
    params.req.__auditLogged = true;
    const u = params.req.user;
    this.audit.log({
      action: params.action,
      userId: u?.id ?? null,
      userEmail: u?.email ?? params.req.body?.email ?? null,
      userRole: u?.role ?? null,
      entityType: params.entityType ?? null,
      entityId: params.entityId ?? null,
      method: params.method,
      path: params.path,
      ipAddress:
        (params.req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        params.req.ip ||
        null,
      userAgent: (params.req.headers['user-agent'] as string | undefined) ?? null,
      statusCode: params.statusCode,
      durationMs: Date.now() - params.start,
      metadata: params.metadata ?? null,
      errorMessage: params.errorMessage ?? null,
    });
  }
}

const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * Extrait { action, entityType, entityId } depuis la méthode HTTP + le path.
 *
 * Mapping pragmatique : on commence par regarder le dernier segment pour les
 * actions métier nommées (cancel, validate, reactivate, dispose, declare-loss,
 * send-email…), puis on fait fallback sur la méthode HTTP générique.
 */
function extractAction(
  method: string,
  path: string,
  body: unknown,
): { action: AuditAction; entityType?: string; entityId?: string } {
  // Chemin attendu : /api/<entity>/<id?>/<verb?>
  const cleanPath = path.replace(/^\/api\//, '').replace(/\/$/, '');
  const segments = cleanPath.split('/').filter(Boolean);
  const entityType = segments[0] ? toPascalCase(segments[0]) : undefined;

  let entityId: string | undefined;
  for (const seg of segments) {
    if (UUID_RE.test(seg)) {
      entityId = seg;
      break;
    }
  }

  // Vérifier d'abord les chemins d'auth
  if (path.includes('/auth/login')) {
    return { action: AuditAction.LOGIN, entityType: 'User' };
  }
  if (path.includes('/auth/logout')) {
    return { action: AuditAction.LOGOUT, entityType: 'User' };
  }
  if (path.includes('/auth/change-password')) {
    return { action: AuditAction.PASSWORD_CHANGE, entityType: 'User' };
  }
  if (path.includes('/auth/reset-password') || path.includes('/auth/forgot-password')) {
    return { action: AuditAction.PASSWORD_RESET, entityType: 'User' };
  }

  // Verb nommé en fin de path
  const last = segments[segments.length - 1]?.toLowerCase();
  const verbMap: Record<string, AuditAction> = {
    cancel: AuditAction.CANCEL,
    reactivate: AuditAction.REACTIVATE,
    validate: AuditAction.VALIDATE,
    invalidate: AuditAction.INVALIDATE,
    activate: AuditAction.ACTIVATE,
    deactivate: AuditAction.DEACTIVATE,
    close: AuditAction.OTHER,
    expire: AuditAction.OTHER,
    dispose: AuditAction.OTHER,
    'declare-loss': AuditAction.OTHER,
    'export-csv': AuditAction.EXPORT,
    // Mode POS achats (achat comptoir) — POST /purchase-invoices/quick-purchase
    // logiquement c'est un CREATE de PurchaseInvoice (avec BC et paiement
    // associes), pas une "OTHER" generique.
    'quick-purchase': AuditAction.CREATE,
  };
  if (last && verbMap[last]) {
    return { action: verbMap[last], entityType, entityId };
  }

  // Détection role change : PATCH sur /users/:id avec body.role
  if (
    method === 'PATCH' &&
    entityType === 'User' &&
    body &&
    typeof body === 'object' &&
    'role' in body
  ) {
    return { action: AuditAction.ROLE_CHANGE, entityType, entityId };
  }

  // Détection activate/deactivate : PATCH sur /users/:id avec body.isActive
  if (
    method === 'PATCH' &&
    entityType === 'User' &&
    body &&
    typeof body === 'object' &&
    'isActive' in body
  ) {
    const v = (body as { isActive: unknown }).isActive;
    return {
      action: v ? AuditAction.ACTIVATE : AuditAction.DEACTIVATE,
      entityType,
      entityId,
    };
  }

  // Fallback générique
  const methodMap: Record<string, AuditAction> = {
    POST: AuditAction.CREATE,
    PATCH: AuditAction.UPDATE,
    PUT: AuditAction.UPDATE,
    DELETE: AuditAction.DELETE,
    GET: AuditAction.OTHER,
  };
  return {
    action: methodMap[method] ?? AuditAction.OTHER,
    entityType,
    entityId,
  };
}

/** Quand l'action initiale échoue : LOGIN → LOGIN_FAILED, le reste reste tel quel. */
function failureActionFor(action: AuditAction): AuditAction {
  if (action === AuditAction.LOGIN) return AuditAction.LOGIN_FAILED;
  return action;
}

/**
 * Construit la metadata enregistrée en JSON. On ne stocke pas le body brut
 * (déjà gérée la rédaction côté service) mais on garde un résumé utile :
 *  - les clés du body (pour voir ce qui a été modifié)
 *  - les valeurs de quelques champs métier "raison/motif/note" qui sont la
 *    valeur ajoutée principale du log
 */
function buildMetadata(
  req: Request,
  action: AuditAction,
): Record<string, unknown> | null {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const keys = Object.keys(body);
  const meta: Record<string, unknown> = {};
  if (keys.length) meta.bodyKeys = keys;
  // Conserver explicitement quelques champs de motif (precieux pour l'audit)
  for (const k of ['reason', 'cancelReason', 'note', 'description', 'role']) {
    if (k in body) meta[k] = body[k];
  }
  // Query params utiles pour les listes/exports
  if (req.query && Object.keys(req.query).length) {
    meta.query = req.query;
  }
  // Pour LOGIN sans user authentifié, conserver l'email tenté
  if (action === AuditAction.LOGIN && 'email' in body) {
    meta.attemptedEmail = body.email;
  }
  return Object.keys(meta).length ? meta : null;
}

function extractIdFromResponse(response: unknown): string | undefined {
  if (!response || typeof response !== 'object') return undefined;
  const obj = response as Record<string, unknown>;
  if (typeof obj.id === 'string' && UUID_RE.test(obj.id)) return obj.id;
  // Réponses encapsulées { data: { id } }
  if (obj.data && typeof obj.data === 'object') {
    const data = obj.data as Record<string, unknown>;
    if (typeof data.id === 'string' && UUID_RE.test(data.id)) return data.id;
  }
  return undefined;
}

function toPascalCase(s: string): string {
  return s
    .split('-')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('');
}
