import { AuthProvider, UserType } from '../../../../generated/prisma';

export class AuthUser {
  constructor(
    public readonly userId: string,
    public readonly email: string,
    public readonly userType: UserType,
    public readonly provider: AuthProvider,
  ) {}
}
