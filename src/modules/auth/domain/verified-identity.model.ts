import { AuthProvider } from '../../../../generated/prisma';

export class VerifiedIdentity {
  constructor(
    public readonly provider: AuthProvider,
    public readonly subjectId: string,
    public readonly email: string,
  ) {}
}
