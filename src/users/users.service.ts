import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import { paginate, PaginatedResult } from '../common/dto/pagination.dto';
import { ROLE_LABELS } from '../common/role-labels';

export type SafeUser = Omit<User, 'password'>;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  private readonly saltRounds: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {
    this.saltRounds = parseInt(this.config.get<string>('BCRYPT_SALT_ROUNDS', '12'), 10);
  }

  private stripPassword(user: User): SafeUser {
    const { password: _password, ...rest } = user;
    return rest;
  }

  async create(dto: CreateUserDto): Promise<SafeUser> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('Cet email est déjà utilisé');
    }

    const hashedPassword = await bcrypt.hash(dto.password, this.saltRounds);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        fullName: dto.fullName,
        phone: dto.phone,
        role: dto.role,
      },
    });

    // Email de bienvenue SANS mot de passe (audit LOT 3) : l'email est un canal
    // non chiffré et persistant. Le mot de passe initial est communiqué par le
    // directeur de façon sécurisée (hors-bande), ou l'utilisateur le définit via
    // « Mot de passe oublié ». On ne transmet donc jamais le mot de passe ici.
    void this.sendWelcomeEmailSafely({
      to: user.email,
      fullName: user.fullName,
      role: ROLE_LABELS[user.role] ?? user.role,
    });

    return this.stripPassword(user);
  }

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

  async findAll(query: QueryUsersDto): Promise<PaginatedResult<SafeUser>> {
    const where: Prisma.UserWhereInput = {};
    if (query.search) {
      where.OR = [
        { fullName: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.role) where.role = query.role;
    if (typeof query.isActive === 'boolean') where.isActive = query.isActive;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return paginate(items.map((u) => this.stripPassword(u)), total, query.page, query.limit);
  }

  async findOne(id: string): Promise<SafeUser> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`Utilisateur ${id} introuvable`);
    }
    return this.stripPassword(user);
  }

  async update(id: string, dto: UpdateUserDto): Promise<SafeUser> {
    await this.findOne(id);
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        fullName: dto.fullName,
        phone: dto.phone,
        role: dto.role,
      },
    });
    return this.stripPassword(user);
  }

  async deactivate(id: string): Promise<SafeUser> {
    await this.findOne(id);
    const user = await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    });
    return this.stripPassword(user);
  }

  async activate(id: string): Promise<SafeUser> {
    await this.findOne(id);
    const user = await this.prisma.user.update({
      where: { id },
      data: { isActive: true },
    });
    return this.stripPassword(user);
  }
}
