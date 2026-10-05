import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CreateUser,
  ListUsers,
  UpdateUser,
} from '../../application/use-cases/user-admin.use-cases';
import { AuthenticatedUser, CurrentUser, Roles } from './decorators';
import { CreateUserDto, UpdateUserDto } from './dto';

@ApiTags('users')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('users')
export class UsersController {
  constructor(
    private listUsers: ListUsers,
    private createUser: CreateUser,
    private updateUser: UpdateUser,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Listar usuarios habilitados en la plataforma DECE (Admin)' })
  findAll() {
    return this.listUsers.execute();
  }

  @Post()
  @ApiOperation({ summary: 'Habilitar una cuenta institucional @uets.edu.ec (Admin)' })
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.createUser.execute(dto, actor.userId);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Cambiar rol, estado o nombre (Admin). Revoca sus sesiones si cambia el rol o se desactiva.',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.updateUser.execute(id, dto, actor.userId);
  }
}
