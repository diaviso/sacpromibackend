import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { AuditService } from '../../audit/audit.service';
import { AuthenticatedUser } from '../decorators/current-user.decorator';

@Injectable()
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  // Optional pour rester compatible si AuditService n'est pas encore injecté
  // (cas legacy : useGlobalFilters(new HttpExceptionFilter())).
  constructor(@Optional() private readonly audit?: AuditService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { user?: AuthenticatedUser }>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Erreur interne du serveur';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const r = res as { message?: string | string[]; error?: string };
        message = r.message ?? message;
        error = r.error ?? error;
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      status = HttpStatus.BAD_REQUEST;
      error = 'Database Error';
      switch (exception.code) {
        case 'P2002': {
          const target = (exception.meta?.target as string[] | undefined)?.join(', ') ?? 'champ';
          message = `Une entrée avec ces valeurs existe déjà (${target})`;
          status = HttpStatus.CONFLICT;
          break;
        }
        case 'P2025':
          message = 'Ressource introuvable';
          status = HttpStatus.NOT_FOUND;
          break;
        case 'P2003':
          message = 'Référence invalide (clé étrangère)';
          break;
        default:
          message = `Erreur base de données : ${exception.code}`;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} → ${status} : ${JSON.stringify(message)}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(`${request.method} ${request.url} → ${status} : ${JSON.stringify(message)}`);
    }

    // Anti-fuite d'information (audit LOT 3) : pour les erreurs serveur (≥ 500),
    // on ne renvoie JAMAIS le message brut de l'exception au client (il peut
    // contenir des chemins, des détails internes, des fragments de requête).
    // Le détail reste uniquement dans les logs serveur (ci-dessus).
    const clientMessage = status >= 500 ? 'Erreur interne du serveur' : message;

    response.status(status).json({
      success: false,
      statusCode: status,
      error,
      message: clientMessage,
      timestamp: new Date().toISOString(),
      path: request.url,
    });

    // Audit : on capture les refus de Guards (401/403) ainsi que toute autre
    // exception qui ne passe pas par l'AuditInterceptor (handler levée). Pour
    // les requêtes audit elles-mêmes (qui appellent /audit-logs), pas besoin.
    const reqWithFlag = request as Request & { __auditLogged?: boolean };
    if (this.audit && status >= 400 && !reqWithFlag.__auditLogged) {
      const method = (request.method ?? 'GET').toUpperCase();
      const isMutation = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method);
      // On ne log QUE les mutations + les 401/403 (sinon GET-spam)
      if (isMutation || status === 401 || status === 403) {
        const path = (request.originalUrl || request.url || '').split('?')[0];
        const u = request.user;
        this.audit.log({
          action: status === 401 || status === 403 ? AuditAction.OTHER : AuditAction.OTHER,
          userId: u?.id ?? null,
          userEmail: u?.email ?? null,
          userRole: u?.role ?? null,
          method,
          path,
          ipAddress:
            (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
            request.ip ||
            null,
          userAgent: (request.headers['user-agent'] as string | undefined) ?? null,
          statusCode: status,
          errorMessage: typeof message === 'string' ? message : JSON.stringify(message),
          metadata: { reason: 'guard-or-filter' },
        });
      }
    }
  }
}
