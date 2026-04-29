import { Module } from '@nestjs/common';
import { ClerkModule } from '../../infrastructure/identity/clerk/clerk.module';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ResolveUserUseCase } from './application/use-cases/resolve-user.use-case';
import { AuthController } from './presentation/auth.controller';

@Module({
  imports: [ClerkModule],
  providers: [AuthGuard, ResolveUserUseCase],
  controllers: [AuthController],
  exports: [AuthGuard],
})
export class AuthModule {}
