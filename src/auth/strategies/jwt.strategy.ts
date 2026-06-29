import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UserRole } from '@prisma/client';
import type { Request } from 'express';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  iat: number;
  exp: number;
}

/**
 * Extracteur custom : Authorization Bearer en priorité, fallback sur
 * `?token=...` en query param.
 *
 * Le fallback query param sert UNIQUEMENT aux cas où le navigateur ne
 * peut pas envoyer de header custom :
 *  - `<img src>` pour les previews d'images uploadées
 *  - `<a target="_blank" href>` pour télécharger un PDF
 *
 * Risques évalués :
 *  - Le token apparaît dans les logs serveur si on les active sur les
 *    query params → désactivés par défaut sur Railway/Vercel.
 *  - Le token reste dans l'historique du navigateur → mitigé par le
 *    TTL court (24h) et l'usage HTTPS obligatoire.
 *  - L'utilisateur peut copier-coller l'URL et partager → fonctionne
 *    seulement le temps du TTL.
 */
const extractJwtFromHeaderOrQuery = (req: Request): string | null => {
  const fromHeader = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
  if (fromHeader) return fromHeader;
  const queryToken = req.query?.token;
  if (typeof queryToken === 'string' && queryToken.length > 0) return queryToken;
  return null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    // Le secret est garanti présent par la validation d'environnement
    // (env.validation.ts) qui empêche le démarrage s'il est absent. Plus de
    // fallback en dur : un secret par défaut public permettrait de forger des JWT.
    const accessSecret = config.get<string>('JWT_ACCESS_SECRET');
    if (!accessSecret) {
      throw new Error(
        'JWT_ACCESS_SECRET est requis (voir config/env.validation.ts).',
      );
    }
    super({
      jwtFromRequest: extractJwtFromHeaderOrQuery,
      ignoreExpiration: false,
      secretOrKey: accessSecret,
      passReqToCallback: true,
    });
  }

  async validate(
    req: Request,
    payload: JwtPayload,
  ): Promise<AuthenticatedUser> {
    // Récupère le token tel qu'il a été utilisé pour cette requête (header OU query)
    const rawToken = extractJwtFromHeaderOrQuery(req);
    if (rawToken) {
      const jti = crypto.createHash('sha256').update(rawToken).digest('hex');
      const revoked = await this.prisma.revokedToken.findUnique({ where: { jti } });
      if (revoked) {
        throw new UnauthorizedException('Token révoqué (déconnexion)');
      }
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, isActive: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Compte inactif ou inexistant');
    }

    return { id: user.id, email: user.email, role: user.role };
  }
}
