import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { AuditService } from './audit.service';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';

@ApiTags('Audit logs')
@ApiBearerAuth('JWT-auth')
@Roles(UserRole.DIRECTOR)
@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly service: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les logs d\'audit (DIRECTOR uniquement)' })
  list(@Query() query: QueryAuditLogsDto) {
    return this.service.list(query);
  }

  @Get('entity-types')
  @ApiOperation({ summary: 'Liste distincte des types d\'entité observés (pour filtres UI)' })
  entityTypes() {
    return this.service.listEntityTypes();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Détail d\'un log d\'audit' })
  async findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    const log = await this.service.findOne(id);
    if (!log) throw new NotFoundException(`Log ${id} introuvable`);
    return log;
  }
}
