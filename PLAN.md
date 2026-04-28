# clerk-be — Implementation Plan

## Purpose

Learning project for DDD + NestJS + Clerk before working on `valora-be` production backend.
All decisions were confirmed through a structured architecture review session.

---

## Architecture Decisions

| Concern         | Decision                                    | Reason                                                |
| --------------- | ------------------------------------------- | ----------------------------------------------------- |
| Package manager | npm                                         | Standard                                              |
| NestJS version  | 11 (latest stable)                          | Current LTS                                           |
| TypeScript      | `strict: true` + `noUncheckedIndexedAccess` | Type safety is a concern                              |
| Env validation  | Zod                                         | Strong inference, no manual interface sync            |
| Database        | PostgreSQL + Prisma                         | Type-safe, clean migrations                           |
| Primary key     | UUID                                        | Portable, no row count leakage                        |
| Auth provider   | Clerk (`@clerk/backend`)                    | Managed identity for learning phase                   |
| Auth pattern    | Adapter pattern (`IAuthAdapter`)            | End users will migrate to Swedish BankID later        |
| BankID future   | Criipto OIDC bridge                         | `ClerkAdapter` → `BankIdAdapter`, guard unchanged     |
| User roles      | `ADMIN \| STAFF \| CUSTOMER`                | Three tiers: elevated staff, regular staff, end users |
| API prefix      | `/api/v1`                                   | Matches `valora-be` production convention             |
| Error envelope  | Valora standard                             | Frontend contract                                     |
| CORS            | Whitelist from `CORS_ORIGIN` env var        | Security                                              |
| Logging         | Pino (`nestjs-pino`)                        | Structured JSON, fast, request context                |

---

## Auth Architecture

```
Request: Authorization: Bearer <clerk_jwt>
        ↓
AuthGuard (global APP_GUARD)
        ↓
IAuthAdapter.verify(token)           ← ClerkAdapter now / BankIdAdapter later
        ↓                               (only this file changes for migration)
ResolveUserUseCase.execute()         ← find-or-create User in DB
        ↓
request.user = AuthUser              ← domain model, not Clerk's shape
        ↓
@CurrentUser() decorator             ← controller receives AuthUser
```

### Why adapter pattern?

`IAuthAdapter` lives in `infrastructure/identity/` (not domain). Token verification is a
technical concern, not a business rule. The domain only cares about `AuthUser` (the result).
When BankID replaces Clerk for end users, only `ClerkAdapter` is replaced — guards, use cases,
and controllers are untouched.

### Error envelope (Valora standard)

```json
{
  "error_code": "UNAUTHORIZED",
  "message": "Invalid or expired token",
  "details": {},
  "correlation_id": "req-abc-123"
}
```

---

## DDD Layer Rules

```
Presentation → Application → Domain ← Infrastructure
```

| Rule                                        | Enforced by                                                     |
| ------------------------------------------- | --------------------------------------------------------------- |
| Domain has zero external imports            | No NestJS / Prisma / Clerk in `domain/`                         |
| Application throws domain exceptions        | `UserNotFoundException`, not `NotFoundException`                |
| Filter translates exceptions to HTTP        | `HttpExceptionFilter` is the only place that knows HTTP codes   |
| Entity state is private                     | Private fields, public getters — no `public readonly props` bag |
| Entities have behaviour                     | Methods that enforce invariants, not just getters               |
| Repository interface in domain              | Abstract class (not interface) — NestJS DI token                |
| Repository implementation in infrastructure | Prisma never imported in domain or application                  |
| Controllers are thin                        | Parse → call one use case → return DTO                          |

---

## Prisma Schema

```prisma
model User {
  id          String    @id @default(uuid()) @db.Uuid
  clerkUserId String?   @unique @map("clerk_user_id")  // nullable — BankID users won't have one
  email       String    @unique
  firstName   String?   @map("first_name")
  lastName    String?   @map("last_name")
  role        UserRole  @default(CUSTOMER)
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")

  @@map("users")
}

enum UserRole {
  ADMIN
  STAFF
  CUSTOMER
}
```

---

## Folder Structure

```
src/
├── config/
│   └── env.validation.ts              ← Zod schema, fails fast at boot
├── common/
│   ├── decorators/
│   │   ├── current-user.decorator.ts  ← @CurrentUser() → AuthUser
│   │   ├── roles.decorator.ts         ← @Roles(UserRole.ADMIN)
│   │   └── public.decorator.ts        ← @Public() skips auth guard
│   ├── exceptions/
│   │   └── domain.exceptions.ts       ← UserNotFoundException, UserInactiveException
│   ├── filters/
│   │   └── http-exception.filter.ts   ← ALL errors → Valora envelope
│   ├── guards/
│   │   ├── auth.guard.ts              ← global APP_GUARD, calls IAuthAdapter + ResolveUserUseCase
│   │   └── roles.guard.ts             ← global APP_GUARD, checks UserRole
│   ├── interceptors/
│   │   └── correlation-id.interceptor.ts
│   └── pipes/
│       └── validation.pipe.ts
├── infrastructure/
│   ├── database/
│   │   ├── prisma.service.ts
│   │   └── prisma.module.ts           ← global module
│   └── identity/
│       ├── auth-adapter.interface.ts  ← IAuthAdapter + VerifiedIdentity + AUTH_ADAPTER token
│       └── clerk/
│           ├── clerk.adapter.ts       ← ClerkClient created ONCE in constructor
│           └── clerk.module.ts
├── modules/
│   ├── auth/
│   │   ├── domain/
│   │   │   └── auth-user.model.ts     ← private constructor, behaviour methods
│   │   ├── application/
│   │   │   └── use-cases/
│   │   │       └── resolve-user.use-case.ts  ← find-or-create
│   │   ├── presentation/
│   │   │   └── auth.controller.ts     ← GET /api/v1/auth/me
│   │   └── auth.module.ts
│   ├── users/
│   │   ├── domain/
│   │   │   ├── user.entity.ts         ← private fields, updateProfile(), promoteToAdmin()
│   │   │   ├── user-role.enum.ts
│   │   │   └── user.repository.ts     ← abstract class (DI token)
│   │   ├── application/
│   │   │   └── use-cases/
│   │   │       ├── get-user-profile.use-case.ts
│   │   │       └── update-user-profile.use-case.ts
│   │   ├── infrastructure/
│   │   │   ├── user.prisma-repository.ts
│   │   │   └── user.mapper.ts         ← ORM ↔ domain entity
│   │   ├── presentation/
│   │   │   ├── users.controller.ts    ← GET + PUT /api/v1/me/profile
│   │   │   └── dtos/
│   │   │       ├── update-profile.request.dto.ts
│   │   │       └── user-profile.response.dto.ts
│   │   └── users.module.ts
│   └── health/
│       └── health.controller.ts       ← GET /health + /health/ready (no auth, no prefix)
├── app.module.ts
└── main.ts
```

---

## Build Order

| Step | What                                                                   | Why first                                           |
| ---- | ---------------------------------------------------------------------- | --------------------------------------------------- |
| 1    | Bootstrap (`nest new`, tsconfig, env validation, `main.ts`)            | Everything depends on this                          |
| 2    | Prisma (schema, `PrismaService`, `PrismaModule`)                       | Auth and users both need the DB                     |
| 3    | Common layer (filter, interceptor, domain exceptions)                  | Guards depend on domain exceptions                  |
| 4    | Auth infrastructure (`IAuthAdapter`, `ClerkAdapter`, `ClerkModule`)    | Guard depends on adapter                            |
| 5    | Auth domain + application (`AuthUser`, `ResolveUserUseCase`)           | Guard depends on use case                           |
| 6    | Auth presentation (guards, decorators, `AuthController`, `AuthModule`) | Users module depends on guard                       |
| 7    | Users module (full DDD slice)                                          | First complete DDD example                          |
| 8    | Health endpoints                                                       | Infrastructure completeness                         |
| 9    | Pino logging                                                           | Wire last — depends on all modules being registered |

---

## Environment Variables

```env
# App
PORT=3000
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173

# Clerk
CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
CLERK_JWT_KEY=                    # optional — enables networkless verification
CLERK_AUTHORIZED_PARTIES=         # optional — comma-separated allowed origins

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/clerk_be
```

---

## Verification Checklist

- [ ] `npm run start:dev` — boots clean, Zod fails fast on missing env vars
- [ ] `GET /health` → `{ "status": "ok" }` — no auth required
- [ ] `GET /health/ready` → Prisma connectivity check
- [ ] `GET /api/v1/auth/me` with no token → `{ error_code: "UNAUTHORIZED", correlation_id: "..." }`
- [ ] `GET /api/v1/auth/me` with valid Clerk JWT → `AuthUser` auto-created on first hit
- [ ] `GET /api/v1/me/profile` → user profile returned
- [ ] `PUT /api/v1/me/profile` with invalid body → `{ error_code: "VALIDATION_ERROR", details: {...} }`
- [ ] Route with `@Roles(UserRole.ADMIN)` as non-admin → `{ error_code: "FORBIDDEN" }`
- [ ] `X-Correlation-ID` present on every response header
