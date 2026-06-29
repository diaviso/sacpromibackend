import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Endpoint de santé pour Railway / load balancer / monitoring.
   * Vérifie que la connexion PostgreSQL est OK.
   *
   * Audit LOT 7 : renvoie désormais HTTP 503 (Service Unavailable) si la base
   * est injoignable, pour qu'un load balancer / orchestrateur détecte
   * réellement l'état dégradé (avant : toujours 200).
   */
  @Public()
  @Get()
  @ApiOperation({ summary: 'Liveness + DB check (public)' })
  async check(@Res({ passthrough: true }) res: Response) {
    const start = Date.now();
    let dbUp: boolean;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbUp = true;
    } catch {
      dbUp = false;
    }
    const dbLatency = dbUp ? Date.now() - start : 0;

    res.status(dbUp ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);

    return {
      status: dbUp ? 'ok' : 'degraded',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? '0.1.0',
      database: { status: dbUp ? 'up' : 'down', latencyMs: dbLatency },
    };
  }
}
