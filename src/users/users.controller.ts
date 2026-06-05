import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { AnyAuthenticated } from '../common/decorators/any-authenticated.decorator';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';

@ApiTags('Users')
@ApiBearerAuth('JWT-auth')
@Roles(UserRole.DIRECTOR)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @ApiOperation({ summary: "Créer un utilisateur (DIRECTOR uniquement)" })
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Liste paginée des utilisateurs' })
  findAll(@Query() query: QueryUsersDto) {
    return this.usersService.findAll(query);
  }

  @Get(':id')
  @AnyAuthenticated()
  @ApiOperation({
    summary:
      "Détail d'un utilisateur. Le DIRECTOR voit n'importe quel profil ; tout autre rôle ne peut voir QUE sa propre fiche (page \"Mon profil\").",
  })
  findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (user.role !== UserRole.DIRECTOR && user.id !== id) {
      throw new ForbiddenException('Vous ne pouvez consulter que votre propre profil');
    }
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Modifier un utilisateur (nom, téléphone, rôle)' })
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @Patch(':id/deactivate')
  @ApiOperation({ summary: 'Désactiver un utilisateur' })
  deactivate(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.usersService.deactivate(id);
  }

  @Patch(':id/activate')
  @ApiOperation({ summary: 'Réactiver un utilisateur' })
  activate(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.usersService.activate(id);
  }
}
