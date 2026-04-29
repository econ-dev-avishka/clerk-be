import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { ClerkAdapter } from '../../infrastructure/identity/clerk/clerk.adapter';
import { ResolveUserUseCase } from '../../modules/auth/application/use-cases/resolve-user.use-case';

/**
 * Protects routes by verifying the Bearer token and resolving the internal user.
 *
 * @remarks
 * Apply at controller or route level via `@UseGuards(AuthGuard)`.
 * After this guard passes, `@CurrentUser()` can be used to extract the resolved user.
 *
 * Flow:
 * 1. Extract Bearer token from `Authorization` header.
 * 2. Verify token via `ClerkAdapter` — throws `UnauthorizedException` if invalid.
 * 3. Resolve internal `AppUser` via `ResolveUserUseCase` — creates user on first login.
 * 4. Attach `AuthUser` to the request under `AUTH_USER_KEY`.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly clerkAdapter: ClerkAdapter,
    private readonly resolveUser: ResolveUserUseCase,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Missing authorization token');
    }

    const identity = await this.clerkAdapter.verify(token);
    const authUser = await this.resolveUser.execute(identity);

    request.authUser = authUser;

    return true;
  }

  private extractToken(request: Request): string | null {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return null;
    return authHeader.slice(7);
  }
}
