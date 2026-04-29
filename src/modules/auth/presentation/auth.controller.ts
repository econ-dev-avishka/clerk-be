import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AuthUser } from '../domain/auth-user.model';

@Controller('auth')
export class AuthController {
  @Get('me')
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }
}
