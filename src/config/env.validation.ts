import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  CORS_ORIGIN: z.string().url(),

  CLERK_PUBLISHABLE_KEY: z.string().min(1),
  CLERK_SECRET_KEY: z.string().min(1),
  CLERK_JWT_KEY: z.string().optional(),
  CLERK_AUTHORIZED_PARTIES: z.string().optional(),

  DATABASE_URL: z.string().url(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    throw new Error(`Environment validation failed:\n${formatted}`);
  }

  return result.data;
}
