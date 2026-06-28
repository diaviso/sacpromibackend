import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { IsDateString, IsOptional, IsString, Matches } from 'class-validator';
import { ReportsService } from './reports.service';
import { Roles } from '../common/decorators/roles.decorator';

class ProfitabilityQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;
}

class MonthQueryDto {
  @ApiPropertyOptional({ example: '2026-04' })
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'Format YYYY-MM attendu' })
  month!: string;
}

@ApiTags('Reports')
@ApiBearerAuth('JWT-auth')
@Roles(UserRole.DIRECTOR)
@Controller('reports')
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Get('profitability-by-product')
  @ApiOperation({ summary: 'Rentabilité par produit (volume, CA, coût, marge)' })
  profitabilityByProduct(@Query() query: ProfitabilityQueryDto) {
    return this.service.profitabilityByProduct(query.from, query.to);
  }

  @Get('daily')
  @ApiOperation({ summary: 'Bilan journalier' })
  daily(@Query('date') date: string) {
    return this.service.daily(date);
  }

  @Get('weekly')
  @ApiOperation({ summary: 'Bilan hebdomadaire (paramètre week = lundi de la semaine)' })
  weekly(@Query('week') week: string) {
    return this.service.weekly(week);
  }

  @Get('monthly/:month')
  @ApiOperation({ summary: 'Bilan mensuel avec compte de résultat simplifié' })
  monthly(@Param('month') month: string) {
    return this.service.monthly(month);
  }

  @Get('breeding/:batchId')
  @ApiOperation({ summary: "Rapport d'élevage par bande (zootech + financier)" })
  breeding(@Param('batchId', new ParseUUIDPipe()) batchId: string) {
    return this.service.breedingReport(batchId);
  }

  @Get('purchase-prices')
  @ApiOperation({ summary: "Évolution du prix d'achat d'une matière" })
  purchasePrices(
    @Query('materialId', new ParseUUIDPipe()) materialId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.purchasePriceHistory(materialId, from, to);
  }

  @Get('best-products')
  @ApiOperation({ summary: 'Top produits par marge et par volume' })
  bestProducts() {
    return this.service.bestProducts();
  }

  @Get('receivables-aging')
  @ApiOperation({ summary: 'État des créances clients par ancienneté' })
  receivablesAging() {
    return this.service.receivablesAging();
  }

  @Get('payables-aging')
  @ApiOperation({
    summary: 'État des dettes fournisseurs par ancienneté',
    description:
      'Combine la dette reelle (receptions impayees) et la dette estimative (BC valides en cours de reception). Champ "kind" = "invoice" ou "engagement".',
  })
  payablesAging() {
    return this.service.payablesAging();
  }

  @Get('receptions')
  @ApiOperation({ summary: 'Liste des receptions (factures fournisseur) avec statut paiement' })
  receptions(@Query() query: ProfitabilityQueryDto) {
    return this.service.receptionsReport(query.from, query.to);
  }

  @Get('purchase-orders')
  @ApiOperation({ summary: 'Liste des BC (filtre par statuts dont EXPIRED) avec engagements vs receptionne' })
  purchaseOrdersReport(
    @Query() query: ProfitabilityQueryDto,
    @Query('status') status?: string,
  ) {
    const statuses = status?.split(',').map((s) => s.trim());
    return this.service.purchaseOrdersReport(query.from, query.to, statuses);
  }

  @Get('purchases-by-supplier')
  @ApiOperation({ summary: 'Agregat des receptions par fournisseur' })
  purchasesBySupplier(@Query() query: ProfitabilityQueryDto) {
    return this.service.purchasesBySupplier(query.from, query.to);
  }
}

@ApiTags('Settings')
@ApiBearerAuth('JWT-auth')
@Roles(UserRole.DIRECTOR)
@Controller('settings')
export class SettingsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('export-csv')
  @ApiOperation({ summary: 'Export CSV de l\'ensemble des données (mois courant)' })
  async exportCsv(@Res() res: Response) {
    const { filename, csv } = await this.reports.exportCsv();
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    res.send('﻿' + csv); // BOM UTF-8 pour Excel
  }
}
