import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { VerifiedIdentity } from '../../domain/verified-identity.model';
import { AuthUser } from '../../domain/auth-user.model';

/**
 * Resolves or creates the internal `AppUser` for a verified external identity.
 *
 * @remarks
 * Called on every authenticated request inside `AuthGuard`. This is the single
 * place where external provider identities (Clerk, BankId) map to internal users.
 *
 * Resolution order:
 * 1. Look up `UserIdentity` by (provider, subjectId).
 * 2. If found, load the linked `AppUser` and return it as `AuthUser`.
 * 3. If not found, create both `AppUser` and `UserIdentity` in one transaction.
 * 4. In both cases, check `deactivatedAt` - a deactivated user is blocked.
 */
@Injectable()
export class ResolveUserUseCase {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * @param identity - The verified identity returned by an auth adapter.
   * @returns The resolved `AuthUser` representing the internal user.
   * @throws {UnauthorizedException} When the resolved user has been deactivated.
   */
  async execute(identity: VerifiedIdentity): Promise<AuthUser> {
    const existing = await this.prisma.userIdentity.findUnique({
      where: {
        provider_subjectId: {
          provider: identity.provider,
          subjectId: identity.subjectId,
        },
      },
      include: { appUser: true },
    });

    if (existing) {
      const { appUser } = existing;

      if (appUser.deactivatedAt) {
        throw new UnauthorizedException('Account has been deactivated');
      }

      await this.prisma.appUser.update({
        where: { id: appUser.id },
        data: { lastSignInAt: new Date() },
      });

      return new AuthUser(
        appUser.id,
        appUser.email,
        appUser.userType,
        existing.provider,
      );
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const appUser = await tx.appUser.create({
        data: {
          email: identity.email,
          userType: 'CUSTOMER',
        },
      });

      const userIdentity = await tx.userIdentity.create({
        data: {
          appUserId: appUser.id,
          provider: identity.provider,
          subjectId: identity.subjectId,
          verifiedAt: new Date(),
        },
      });

      return { appUser, userIdentity };
    });

    return new AuthUser(
      created.appUser.id,
      created.appUser.email,
      created.appUser.userType,
      created.userIdentity.provider,
    );
  }
}
