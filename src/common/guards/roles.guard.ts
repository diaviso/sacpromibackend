import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { ANY_AUTHENTICATED_KEY } from '../decorators/any-authenticated.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AuthenticatedUser } from '../decorators/current-user.decorator';

/**
 * Guard d'autorisation par rôle — fonctionne en mode **fail-secure** :
 * - Si l'endpoint est annoté `@Public()` → laisser passer (JWT non requis).
 * - Si annoté `@Roles(...)` → vérifier `user.role ∈ rôles`.
 * - Si annoté `@AnyAuthenticated()` → accepter tout utilisateur authentifié.
 * - Sinon → **refuser** (rejet par défaut). Cela force chaque endpoint à
 *   déclarer explicitement sa politique d'accès, évitant les oublis.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const handler = context.getHandler();
    const klass = context.getClass();

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      handler,
      klass,
    ]);
    if (isPublic) {
      return true;
    }

    // On lit séparément handler et class pour donner PRIORITÉ aux
    // décorateurs posés sur le handler. Sans ça, un controller déclaré
    // `@Roles(DIRECTOR)` au niveau classe écraserait un `@AnyAuthenticated()`
    // posé sur une méthode précise (cas de UsersController#findOne, où chaque
    // utilisateur doit pouvoir consulter SA propre fiche).
    const rolesOnHandler = this.reflector.get<UserRole[] | undefined>(ROLES_KEY, handler);
    const anyAuthOnHandler = this.reflector.get<boolean>(ANY_AUTHENTICATED_KEY, handler);
    const rolesOnClass = this.reflector.get<UserRole[] | undefined>(ROLES_KEY, klass);
    const anyAuthOnClass = this.reflector.get<boolean>(ANY_AUTHENTICATED_KEY, klass);

    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Utilisateur non authentifié');
    }

    // 1. Handler @AnyAuthenticated() → laisse passer (override classe).
    if (anyAuthOnHandler) {
      return true;
    }
    // 2. Handler @Roles(...) → contrôle strict (override classe).
    if (rolesOnHandler && rolesOnHandler.length > 0) {
      if (!rolesOnHandler.includes(user.role)) {
        throw new ForbiddenException(
          `Accès refusé : rôle requis (${rolesOnHandler.join(', ')}), rôle actuel : ${user.role}`,
        );
      }
      return true;
    }
    // 3. Sinon, on retombe sur la politique de la classe.
    if (rolesOnClass && rolesOnClass.length > 0) {
      if (!rolesOnClass.includes(user.role)) {
        throw new ForbiddenException(
          `Accès refusé : rôle requis (${rolesOnClass.join(', ')}), rôle actuel : ${user.role}`,
        );
      }
      return true;
    }
    if (anyAuthOnClass) {
      return true;
    }

    // Fail-secure : aucune politique d'accès déclarée → on refuse.
    this.logger.warn(
      `Endpoint ${klass.name}.${handler.name} sans @Roles() ni @AnyAuthenticated() ni @Public() — accès refusé par défaut.`,
    );
    throw new ForbiddenException(
      "Cet endpoint n'a pas de politique d'accès déclarée. Refus par sécurité.",
    );
  }
}
