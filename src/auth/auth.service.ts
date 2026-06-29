import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtPayload } from './strategies/jwt.strategy';

function computeJti(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

const RESET_TOKEN_TTL_MINUTES = 30;

export type SafeUser = Omit<User, 'password'>;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse {
  user: SafeUser;
  tokens: AuthTokens;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly saltRounds: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {
    this.saltRounds = parseInt(this.config.get<string>('BCRYPT_SALT_ROUNDS', '12'), 10);
  }

  private stripPassword(user: User): SafeUser {
    const { password: _password, ...rest } = user;
    return rest;
  }

  private async generateTokens(user: Pick<User, 'id' | 'email' | 'role'>): Promise<AuthTokens> {
    // iat + exp sont injectés par jsonwebtoken — ici on ne fournit que le payload "métier".
    const payload = { sub: user.id, email: user.email, role: user.role };

    const accessOptions = {
      secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRATION', '24h'),
    } as { secret: string; expiresIn: string };

    const refreshOptions = {
      secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRATION', '7d'),
    } as { secret: string; expiresIn: string };

    const accessToken = await this.jwt.signAsync({ ...payload }, accessOptions as never);
    const refreshToken = await this.jwt.signAsync({ ...payload }, refreshOptions as never);

    return { accessToken, refreshToken };
  }

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('Cet email est déjà utilisé');
    }

    const userCount = await this.prisma.user.count();

    // Durcissement (audit LOT 3) : en production, l'inscription publique n'est
    // autorisée que pour AMORCER le tout premier compte (le directeur). Une fois
    // un compte créé, les utilisateurs suivants doivent être créés par le
    // directeur via POST /users — on ferme ainsi l'auto-inscription anonyme.
    const isProd = this.config.get<string>('NODE_ENV') === 'production';
    if (isProd && userCount > 0) {
      throw new ForbiddenException(
        "L'inscription publique est désactivée. Contactez le directeur pour la création de votre compte.",
      );
    }

    const role: UserRole = userCount === 0 ? UserRole.DIRECTOR : UserRole.OPERATOR;

    const hashedPassword = await bcrypt.hash(dto.password, this.saltRounds);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        fullName: dto.fullName,
        phone: dto.phone,
        role,
      },
    });

    // Email de bienvenue (sans mot de passe — l'utilisateur l'a choisi lui-même)
    void this.sendWelcomeEmailSafely({
      to: user.email,
      fullName: user.fullName,
      role: user.role,
    });

    const tokens = await this.generateTokens(user);
    return { user: this.stripPassword(user), tokens };
  }

  /** Envoie un email de bienvenue sans bloquer en cas d'échec SMTP. */
  private async sendWelcomeEmailSafely(opts: {
    to: string;
    fullName: string;
    role: string;
    tempPassword?: string;
  }) {
    try {
      const appUrl = this.config.get<string>('APP_URL', 'http://localhost:3071');
      await this.mail.sendWelcome({
        ...opts,
        loginUrl: `${appUrl}/login`,
      });
    } catch (err) {
      this.logger.warn(
        `Échec envoi email de bienvenue à ${opts.to} : ${(err as Error).message}`,
      );
    }
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) {
      throw new UnauthorizedException('Identifiants invalides');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Compte désactivé. Contactez votre administrateur.');
    }

    const passwordMatch = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatch) {
      throw new UnauthorizedException('Identifiants invalides');
    }

    const tokens = await this.generateTokens(user);
    return { user: this.stripPassword(user), tokens };
  }

  async refresh(dto: RefreshTokenDto): Promise<AuthTokens> {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(dto.refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Refresh token invalide ou expiré');
    }

    // Refuser si le refresh token a été révoqué (logout préalable)
    const jti = computeJti(dto.refreshToken);
    const revoked = await this.prisma.revokedToken.findUnique({ where: { jti } });
    if (revoked) {
      throw new UnauthorizedException('Refresh token révoqué');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Compte inactif ou inexistant');
    }

    // Révocation de session : un refresh token émis avant le dernier changement
    // de mot de passe ne peut plus régénérer d'access token (audit LOT 3).
    if (
      user.passwordChangedAt &&
      payload.iat < Math.floor(user.passwordChangedAt.getTime() / 1000)
    ) {
      throw new UnauthorizedException(
        'Session expirée suite à un changement de mot de passe. Reconnectez-vous.',
      );
    }

    return this.generateTokens(user);
  }

  /**
   * Révoque l'access token et le refresh token en cours. Ils ne pourront plus
   * être utilisés (la JwtStrategy + l'endpoint refresh vérifient la blacklist).
   * Idempotent : si un token a déjà été blacklisté on continue silencieusement.
   */
  async logout(
    userId: string,
    accessToken: string | undefined,
    refreshToken: string,
  ): Promise<{ message: string }> {
    const operations: Promise<unknown>[] = [];

    if (accessToken) {
      try {
        const payload = await this.jwt.verifyAsync<JwtPayload>(accessToken, {
          secret: this.config.get<string>('JWT_ACCESS_SECRET'),
        });
        operations.push(
          this.prisma.revokedToken.upsert({
            where: { jti: computeJti(accessToken) },
            create: {
              jti: computeJti(accessToken),
              userId,
              type: 'access',
              expiresAt: new Date(payload.exp * 1000),
              reason: 'logout',
            },
            update: {},
          }),
        );
      } catch (err) {
        this.logger.warn(`Access token invalide à la déconnexion : ${(err as Error).message}`);
      }
    }

    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });
      operations.push(
        this.prisma.revokedToken.upsert({
          where: { jti: computeJti(refreshToken) },
          create: {
            jti: computeJti(refreshToken),
            userId,
            type: 'refresh',
            expiresAt: new Date(payload.exp * 1000),
            reason: 'logout',
          },
          update: {},
        }),
      );
    } catch (err) {
      this.logger.warn(`Refresh token invalide à la déconnexion : ${(err as Error).message}`);
    }

    await Promise.all(operations);
    return { message: 'Déconnexion réussie' };
  }

  /** Vérifie si un access token donné est révoqué (utilisé par la JwtStrategy). */
  async isAccessTokenRevoked(token: string): Promise<boolean> {
    const revoked = await this.prisma.revokedToken.findUnique({
      where: { jti: computeJti(token) },
    });
    return !!revoked;
  }

  async getProfile(userId: string): Promise<SafeUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('Utilisateur introuvable');
    }
    return this.stripPassword(user);
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('Utilisateur introuvable');
    }

    const ok = await bcrypt.compare(dto.currentPassword, user.password);
    if (!ok) {
      throw new BadRequestException('Mot de passe actuel incorrect');
    }

    const newHash = await bcrypt.hash(dto.newPassword, this.saltRounds);
    // passwordChangedAt → invalide toutes les sessions/tokens antérieurs.
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: newHash, passwordChangedAt: new Date() },
    });

    return { message: 'Mot de passe modifié avec succès' };
  }

  /**
   * Génère un token, le stocke hashé, envoie l'email avec le lien de reset.
   * Renvoie toujours un message générique pour ne pas révéler si l'email existe (sécurité).
   */
  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const genericMessage = {
      message:
        "Si un compte existe pour cet email, un lien de réinitialisation vous a été envoyé.",
    };

    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !user.isActive) {
      return genericMessage;
    }

    // Token brut (URL-safe), hash sha256 stocké en BDD
    const rawToken = crypto.randomBytes(32).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60_000);

    // Invalider les anciens tokens non utilisés
    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });

    await this.prisma.passwordResetToken.create({
      data: { tokenHash, userId: user.id, expiresAt },
    });

    const appUrl = this.config.get<string>('APP_URL', 'http://localhost:3071');
    const resetUrl = `${appUrl}/reset-password/${rawToken}`;

    try {
      await this.mail.sendPasswordReset({
        to: user.email,
        fullName: user.fullName,
        resetUrl,
        expiresInMinutes: RESET_TOKEN_TTL_MINUTES,
      });
    } catch (err) {
      this.logger.error(
        `Échec envoi email reset à ${user.email}`,
        (err as Error).stack,
      );
      // En dev uniquement (jsonTransport ou erreur SMTP), on log le lien pour
      // debug. JAMAIS en production : ce lien contient un token de reset valide.
      if (this.config.get<string>('NODE_ENV') !== 'production') {
        this.logger.warn(`🔗 Lien de réinitialisation (debug) : ${resetUrl}`);
      }
    }

    return genericMessage;
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const tokenHash = crypto.createHash('sha256').update(dto.token).digest('hex');
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('Lien de réinitialisation invalide ou expiré');
    }

    if (!record.user.isActive) {
      throw new BadRequestException('Ce compte est désactivé');
    }

    const newHash = await bcrypt.hash(dto.newPassword, this.saltRounds);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        // passwordChangedAt → invalide les sessions antérieures (le cas d'usage
        // central d'un reset : couper l'accès d'un éventuel attaquant).
        data: { password: newHash, passwordChangedAt: new Date() },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);

    return { message: 'Mot de passe réinitialisé avec succès. Vous pouvez vous connecter.' };
  }
}
