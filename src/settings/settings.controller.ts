import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { SettingsService } from './settings.service';
import { UpdateCompanySettingsDto } from './dto/update-company-settings.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { AnyAuthenticated } from '../common/decorators/any-authenticated.decorator';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';

@ApiTags('Company settings')
@ApiBearerAuth('JWT-auth')
@Controller('settings/company')
export class CompanySettingsController {
  constructor(private readonly service: SettingsService) {}

  @Get()
  @AnyAuthenticated()
  @ApiOperation({
    summary:
      "Récupérer les paramètres entreprise (singleton). Crée la ligne vierge si elle n'existe pas encore.",
  })
  get() {
    return this.service.get();
  }

  @Patch()
  @Roles(UserRole.DIRECTOR)
  @ApiOperation({ summary: 'Mettre à jour les paramètres entreprise (DIRECTOR uniquement)' })
  update(@Body() dto: UpdateCompanySettingsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.update(dto, user.id);
  }
}
