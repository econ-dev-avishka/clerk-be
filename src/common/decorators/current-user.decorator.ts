import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { AuthUser } from '../../modules/auth/domain/auth-user.model';

/**
 * Extracts the resolved `AuthUser` from the request.
 *
 * @remarks
 * Only valid on routes protected by `AuthGuard`. If used without the guard,
 * the value will be `undefined` since `AuthGuard` is what sets it.
 *
 * @example
 * ```ts
 * @Get('me')
 * @UseGuards(AuthGuard)
 * getMe(@CurrentUser() user: AuthUser) {
 *   return user;
 * }
 * ```
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return request.authUser as AuthUser;
  },
);
