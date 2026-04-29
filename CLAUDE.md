# clerk-be — Learning Project: Clerk + DDD + NestJS

## Purpose

This is a **learning project** designed to teach Domain Driven Design (DDD) architecture using NestJS and Clerk for authentication. It mirrors the patterns intended for the real `valora-be` backend so the developer can understand and apply them confidently before working on production code.

---

## What This Project Teaches

1. **Domain Driven Design (DDD)** — how to organise code around business problems, not technical concerns
2. **Clerk authentication** — how to verify JWTs, extract users, enforce roles in NestJS
3. **NestJS patterns** — guards, decorators, interceptors, filters, pipes
4. **Repository pattern** — separating domain contracts from database implementations
5. **Use case pattern** — thin controllers, fat domain, explicit application orchestration

---

## Domain Driven Design — Core Concepts

### The Dependency Rule

Layers can only depend inward. Never outward.

```
Presentation → Application → Domain ← Infrastructure
```

- **Domain** knows nothing about NestJS, Prisma, Clerk, or HTTP
- **Application** knows about Domain only
- **Presentation** knows about Application only
- **Infrastructure** implements interfaces defined in Domain

### The Four Building Blocks

**Entity** — has identity that persists over time. Identified by an ID, not its data.

```typescript
class User {
  constructor(
    public readonly userId: string, // identity
    public email: string, // data can change, still same user
    public role: UserRole,
  ) {}
}
```

**Value Object** — defined entirely by its data. No ID. Always immutable. Replace, never mutate.

```typescript
class Email {
  constructor(public readonly value: string) {
    if (!value.includes('@')) throw new Error('Invalid email');
  }
}
```

**Aggregate** — a cluster of entities treated as one unit. Has one Aggregate Root. All changes go through the root. Enforces business rules.

```typescript
class Order {
  // Aggregate Root
  private items: OrderItem[] = []; // child entity — never touched directly from outside

  addItem(product: Product, qty: number): void {
    if (this.status === OrderStatus.CLOSED) throw new OrderClosedException();
    this.items.push(new OrderItem(product, qty));
  }
}
```

**Domain Service** — business logic that doesn't fit on a single entity. Operates across multiple domain objects.

### The Three Layers Inside Every Module

```
presentation/   ← speaks HTTP. Thin. Parses request, calls use case, returns response.
application/    ← orchestrates. Loads domain objects, applies rules, saves, publishes events.
domain/         ← the heart. Pure business logic. No frameworks. Fully testable in isolation.
infrastructure/ ← speaks to databases and external APIs. Implements domain interfaces.
```

### Repository Pattern

Domain defines **what it needs** (interface). Infrastructure provides **how** (implementation).

```typescript
// domain/user.repository.ts — interface, lives in domain
export abstract class UserRepository {
  abstract findById(id: string): Promise<User | null>;
  abstract save(user: User): Promise<void>;
}

// infrastructure/user.prisma-repository.ts — implementation, lives in infrastructure
export class UserPrismaRepository implements UserRepository {
  constructor(private prisma: PrismaService) {}

  async findById(id: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { id } });
    return row ? UserMapper.toDomain(row) : null;
  }
}
```

The domain never imports Prisma. The use case never knows it is talking to Postgres.

---

## Project Tech Stack

| Concern       | Choice                              | Reason                                               |
| ------------- | ----------------------------------- | ---------------------------------------------------- |
| Framework     | NestJS 11                           | Modules, DI, decorators — maps cleanly to DDD layers |
| Language      | TypeScript (strict)                 | Full type safety across layers                       |
| Auth provider | Clerk                               | Managed identity, JWT-based, easy to swap later      |
| Database      | PostgreSQL via Prisma               | Type-safe queries, clean migration system            |
| Validation    | class-validator + class-transformer | Declarative DTO validation                           |
| Config        | @nestjs/config + Joi/Zod            | Fail fast on missing env vars                        |

---

## Folder Structure

```
src/
├── config/                        ← env validation, config shapes only
│   ├── app.config.ts
│   ├── auth.config.ts             ← Clerk keys
│   └── database.config.ts
│
├── common/                        ← reusable framework utilities, no domain logic
│   ├── decorators/
│   │   ├── current-user.decorator.ts    ← @CurrentUser() extracts AuthUser from request
│   │   └── roles.decorator.ts           ← @Roles(UserRole.ADMIN) sets metadata
│   ├── guards/
│   │   ├── auth.guard.ts                ← verifies Clerk JWT, calls ResolveUserUseCase
│   │   └── roles.guard.ts               ← checks AuthUser.role against @Roles() metadata
│   ├── filters/
│   │   └── http-exception.filter.ts     ← formats ALL errors into consistent envelope
│   ├── interceptors/
│   │   └── correlation-id.interceptor.ts ← adds X-Correlation-ID to every request
│   └── pipes/
│       └── validation.pipe.ts           ← runs class-validator on all incoming DTOs
│
├── infrastructure/                ← technical plumbing, implements domain interfaces
│   ├── database/
│   │   ├── prisma.service.ts      ← PrismaClient singleton
│   │   └── prisma.module.ts       ← global module
│   └── identity/
│       └── clerk/
│           ├── clerk.adapter.ts   ← verifies Clerk JWT, maps to internal AuthUser
│           └── clerk.module.ts
│
├── modules/
│   ├── auth/                      ← WHO is this person, are they allowed?
│   │   ├── domain/
│   │   │   └── auth-user.model.ts         ← { userId, clerkId, role, email }
│   │   ├── application/
│   │   │   └── use-cases/
│   │   │       └── resolve-user.use-case.ts  ← find-or-create User from verified JWT
│   │   ├── presentation/
│   │   │   └── auth.controller.ts            ← GET /auth/me
│   │   └── auth.module.ts
│   │
│   └── users/                     ← internal user profile management
│       ├── domain/
│       │   ├── user.entity.ts             ← Aggregate Root
│       │   ├── user-role.enum.ts          ← CLIENT | ADMIN
│       │   └── user.repository.ts         ← abstract repository interface
│       ├── application/
│       │   └── use-cases/
│       │       ├── get-user-profile.use-case.ts
│       │       └── update-user-profile.use-case.ts
│       ├── infrastructure/
│       │   ├── user.prisma-repository.ts  ← implements UserRepository
│       │   ├── user.orm-model.ts          ← Prisma model type
│       │   └── user.mapper.ts             ← ORM ↔ domain entity
│       ├── presentation/
│       │   ├── users.controller.ts        ← GET /me/profile, PUT /me/profile
│       │   └── dtos/
│       │       ├── update-profile.request.dto.ts
│       │       └── user-profile.response.dto.ts
│       └── users.module.ts
│
├── app.module.ts                  ← root module, imports everything
└── main.ts                        ← bootstrap: global pipes, filters, interceptors, CORS
```

---

## Auth Architecture

### How Clerk authentication works in NestJS

```
Request arrives with: Authorization: Bearer <clerk_jwt>
        ↓
AuthGuard.canActivate()
        ↓
ClerkAdapter.verify(token)    ← calls Clerk SDK to verify signature
        ↓
ResolveUserUseCase.execute()  ← find-or-create internal User row in DB
        ↓
@CurrentUser() decorator      ← sets AuthUser on request object
        ↓
Controller receives AuthUser { userId, clerkId, role, email }
```

### Role enforcement

```typescript
@Controller('admin')
@UseGuards(AuthGuard, RolesGuard)   ← both guards required
@Roles(UserRole.ADMIN)              ← metadata read by RolesGuard
export class AdminController {}
```

### Error envelope (all errors use this shape)

```json
{
  "error_code": "UNAUTHORIZED",
  "message": "Invalid or expired token",
  "correlation_id": "req-abc-123"
}
```

---

## Key Rules — Never Break These

1. **Domain layer has zero external imports** — no NestJS decorators, no Prisma, no Clerk SDK inside `domain/`
2. **Controllers are thin** — parse request → call one use case → return response. No business logic.
3. **One use case per operation** — `CreateUserUseCase`, not `UserService` with 12 methods
4. **Repository interface in domain, implementation in infrastructure** — domain never imports Prisma
5. **DTOs are not domain entities** — map at the boundary (mapper pattern)
6. **Clerk is isolated in `infrastructure/identity/clerk/`** — no Clerk SDK imports outside this folder

---

## What to Build (in order)

### Step 1 — Bootstrap

- [ ] `main.ts` with global pipes, filters, interceptors, CORS, graceful shutdown
- [ ] `@nestjs/config` with env validation
- [ ] Prisma setup with User model
- [ ] `PrismaModule` as global module

### Step 2 — Common layer

- [ ] `HttpExceptionFilter` — consistent error envelope
- [ ] `CorrelationIdInterceptor` — X-Correlation-ID on every request
- [ ] `ValidationPipe` — class-validator on all DTOs

### Step 3 — Auth

- [ ] `ClerkAdapter` — verify JWT, return raw Clerk user
- [ ] `AuthUser` model — internal shape
- [ ] `AuthGuard` — verifies token, resolves user
- [ ] `@CurrentUser()` decorator
- [ ] `ResolveUserUseCase` — find-or-create User in DB

### Step 4 — Users module (first complete DDD module)

- [ ] `User` entity (domain)
- [ ] `UserRole` enum (domain)
- [ ] `UserRepository` abstract class (domain)
- [ ] `GetUserProfileUseCase` (application)
- [ ] `UpdateUserProfileUseCase` (application)
- [ ] `UserPrismaRepository` (infrastructure)
- [ ] `UserMapper` (infrastructure)
- [ ] `UsersController` with GET /me/profile and PUT /me/profile (presentation)
- [ ] Request/response DTOs (presentation)

### Step 5 — Roles

- [ ] `@Roles()` decorator
- [ ] `RolesGuard`
- [ ] Test with a protected admin route

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
CLERK_JWT_KEY=                     # optional — enables networkless JWT verification
CLERK_AUTHORIZED_PARTIES=          # optional — comma-separated allowed frontend origins

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/clerk_be
```

---

## Decisions Made

| Decision                                        | Reason                                                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Clerk for auth (not custom JWT)                 | Managed identity, no auth infra to maintain in learning phase                                     |
| Prisma over TypeORM                             | Type-safe, cleaner migration system, better DX                                                    |
| Abstract class for repositories (not interface) | NestJS DI works with abstract classes as injection tokens                                         |
| One use case per file                           | Explicit, testable, follows Single Responsibility                                                 |
| No CQRS in auth                                 | Auth is simple - one guard, one use case, one decorator. CQRS adds ceremony with no benefit here. |
| Strict TypeScript                               | Catch mistakes at compile time, not runtime                                                       |

---

## Claude Code Session Rules

These rules apply to every Claude Code session in this repo. Read them before making any changes.

### Communication style

- Do not use em dashes (--), en dashes, ellipsis characters, curly quotes, or any other special typographic characters in responses or written content. Use plain punctuation only: hyphens (-), straight quotes, and standard periods.
- Teach as you implement. For every non-trivial file written, explain what it does, why it is structured that way, and what DDD principle it demonstrates. The goal is understanding, not just working code.
- Implement one step at a time. Wait for the developer to confirm understanding before moving to the next step.

### Git rules

- Commit after every completed step using the format: `type(BE-N): description`
- Push to remote after every commit: https://github.com/econ-dev-avishka/clerk-be.git
- Never add Co-Authored-By trailers or any Claude authorship to commits. Commits are authored by the developer only.
- Never use --no-verify to skip hooks.

### Commit format

```
type(BE-N): short description

Types: feat | fix | chore | docs | test | refactor | perf | build | ci | revert
Scope: BE-1, BE-2, BE-3 ... (task/step number)

Examples:
  chore(BE-1): scaffold nestjs project and configure typescript
  feat(BE-2): add prisma schema and database module
  feat(BE-3): add common layer - filter, interceptor, domain exceptions
```

### Husky hooks (same as valora-fe)

- pre-commit: lint-staged - ESLint fix + Prettier write on staged files
- commit-msg: commitlint - enforces type(BE-N): description format, scope is required
- Never skip hooks. If a hook fails, fix the underlying issue.

### Code documentation standard

**The golden rule:** If the code reads like plain English, write nothing. A comment that restates what the code already says is noise - delete it.

```ts
// WRONG - the function name already says it
// Returns the user's full name
function getFullName(user: User): string {
  return `${user.firstName} ${user.lastName}`;
}

// CORRECT - no comment needed
function getFullName(user: User): string {
  return `${user.firstName} ${user.lastName}`;
}
```

**When to use a plain `//` comment:** Only when the WHY behind something is not obvious from reading the code. Write it so a developer new to the codebase can understand without needing to ask anyone.

```ts
// The API returns 404 for both "not found" and "not owned by this user".
// We treat both as null so we never accidentally leak that a resource exists.
if (error.status === 404) return null;
```

**When to use TSDoc (`/** */`):** Add TSDoc on functions, use cases, and classes when ANY of the following are true:
- It is called from multiple places across the codebase
- It throws errors that callers need to handle
- It has a constraint or business rule not visible from the type signature
- The return value meaning is not obvious

Tags to use:

| Tag | When to use |
|---|---|
| `@param name` | When a parameter name alone does not explain its purpose or a constraint on its value |
| `@returns` | When the return value shape or meaning needs clarification |
| `@throws` | When the function throws and callers must handle it |
| `@remarks` | For non-obvious constraints, invariants, or business rules a new developer must know |
| `@example` | When the usage pattern is not obvious from the signature |

Tags never to use: `@author`, `@version`, `@since`, `@todo` (open a GitHub issue instead).

```ts
/**
 * Resolves or creates the internal User record for a verified Clerk identity.
 *
 * @returns The AuthUser domain model representing the resolved user.
 * @throws {UserInactiveException} When the resolved user has been deactivated.
 *
 * @remarks
 * Called on every authenticated request inside AuthGuard.
 * This is the single place where external Clerk identities map to internal users.
 */
async execute(identity: VerifiedIdentity): Promise<AuthUser> { ... }
```

**Absolute rules:**
- Never write a comment that a junior developer could figure out by reading the line below it
- Never leave TODO comments in committed code - open a GitHub issue instead
- Write every comment as if the reader is intelligent but completely new to this project
- Only add a comment on a type property when its value has a constraint not obvious from the type
