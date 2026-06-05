import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({}),
    ThrottlerModule.forRoot([
      {
        // Limite globale : 500 req / minute par IP.
        // Augmenté de 100 → 500 car la page États & Exports peut enchaîner
        // 6-8 listes en parallèle (limit=500 chaque) en quelques secondes,
        // ce qui dépassait l'ancien plafond et causait des 429 sur des
        // utilisations normales.
        name: 'default',
        ttl: 60_000,
        limit: 500,
      },
      {
        // Auth strict : 5 tentatives login/refresh par 60 secondes
        name: 'auth',
        ttl: 60_000,
        limit: 5,
      },
    ]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
  exports: [AuthService],
})
export class AuthModule {}
