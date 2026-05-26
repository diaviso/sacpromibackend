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

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_ACCESS_SECRET') ?? 'fallback-secret',
      passReqToCallback: true,
    });
  }

  async validate(
    req: Request,
    payload: JwtPayload,
  ): Promise<AuthenticatedUser> {
    // Vérifie la blacklist : si l'access token a été révoqué (logout), on refuse.
    const authHeader = req.headers.authorization ?? '';
    const rawToken = authHeader.replace(/^Bearer\s+/i, '');
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
