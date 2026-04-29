import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClerkClient, ClerkClient, verifyToken } from '@clerk/backend';
import { AuthProvider } from '../../../../generated/prisma';
import { VerifiedIdentity } from '../../../modules/auth/domain/verified-identity.model';
import { Env } from '../../../config/env.validation';

/**
 * Verifies a Clerk JWT and maps the result to an internal `VerifiedIdentity`.
 *
 * @remarks
 * This is the only file in the codebase that imports `@clerk/backend`.
 * All Clerk-specific logic is isolated here so swapping or extending the
 * auth provider only requires changes in this adapter.
 *
 * Token verification uses the standalone `verifyToken` from `@clerk/backend`
 * rather than the client instance method, because the `ClerkClient` type is a
 * complex intersection that typescript-eslint cannot fully resolve.
 * User data (email) is fetched via the typed `ClerkClient.users` API.
 */
@Injectable()
export class ClerkAdapter {
  private readonly clerk: ClerkClient;

  constructor(private readonly config: ConfigService<Env, true>) {
    this.clerk = createClerkClient({
      secretKey: this.config.get('CLERK_SECRET_KEY'),
      publishableKey: this.config.get('CLERK_PUBLISHABLE_KEY'),
    });
  }

  /**
   * @param token - Raw Bearer token from the Authorization header.
   * @returns A `VerifiedIdentity` containing the provider, subject ID, and email.
   * @throws {UnauthorizedException} When the token is missing, expired, or invalid.
   */
  async verify(token: string): Promise<VerifiedIdentity> {
    try {
      const authorizedParties = this.config
        .get('CLERK_AUTHORIZED_PARTIES', { infer: true })
        ?.split(',')
        .filter(Boolean);

      const payload = await verifyToken(token, {
        secretKey: this.config.get('CLERK_SECRET_KEY'),
        ...(authorizedParties?.length && { authorizedParties }),
      });

      const clerkUser = await this.clerk.users.getUser(payload.sub);

      const email = clerkUser.emailAddresses.find(
        (e) => e.id === clerkUser.primaryEmailAddressId,
      )?.emailAddress;

      if (!email) {
        throw new UnauthorizedException('Clerk user has no primary email');
      }

      return new VerifiedIdentity(AuthProvider.CLERK, payload.sub, email);
    } catch (error: unknown) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
