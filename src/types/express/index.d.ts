import { AuthUser } from '../../modules/auth/domain/auth-user.model';

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
    }
  }
}
