import { Controller, ForbiddenException, Get, NotFoundException, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { AnyAuthenticated } from '../common/decorators/any-authenticated.decorator';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { AuditService } from './audit.service';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';

@ApiTags('Audit logs')
@ApiBearerAuth('JWT-auth')
@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly service: AuditService) {}

  @Get()
  @AnyAuthenticated()
  @ApiOperation({
    summary:
      "Liste des logs d'audit. Le DIRECTOR voit tout ; tout autre rôle ne voit QUE ses propres actions (userId forcé sur self).",
  })
  list(
    @Query() query: QueryAuditLogsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // Non-DIRECTOR : on force le filtre userId = self pour ne pas exposer
    // les actions des autres utilisateurs depuis la page "Mon profil".
    if (user.role !== UserRole.DIRECTOR) {
      if (query.userId && query.userId !== user.id) {
        throw new ForbiddenException('Vous ne pouvez consulter que vos propres logs');
      }
      query.userId = user.id;
    }
    return this.service.list(query);
  }

  @Get('entity-types')
  @Roles(UserRole.DIRECTOR)
  @ApiOperation({ summary: 'Liste distincte des types d\'entité observés (filtre UI, DIRECTOR uniquement)' })
  entityTypes() {
    return this.service.listEntityTypes();
  }

  @Get(':id')
  @AnyAuthenticated()
  @ApiOperation({
    summary:
      "Détail d'un log d'audit. Le DIRECTOR voit tout ; les autres ne voient que les logs qui les concernent.",
  })
  async findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const log = await this.service.findOne(id);
    if (!log) throw new NotFoundException(`Log ${id} introuvable`);
    if (user.role !== UserRole.DIRECTOR && log.userId !== user.id) {
      throw new ForbiddenException('Vous ne pouvez consulter que vos propres logs');
    }
    return log;
  }
}
