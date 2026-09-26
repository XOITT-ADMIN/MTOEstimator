import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(24, "JWT_SECRET must be at least 24 characters"),
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default("0.0.0.0"),
  CORS_ORIGINS: z.string().default("*"),
  SMTP_URL: z.string().optional().default(""),
  MAIL_FROM: z.string().default("XMTO <no-reply@example.com>"),
  // Demo mode returns the sign-in code in the API response. Off automatically when SMTP is set.
  OTP_DEMO: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
  NODE_ENV: z.string().default("development"),
  // Sign-in lifetime: access tokens are short; a device that isn't used for REFRESH_IDLE_DAYS
  // has to sign in with an email code again.
  ACCESS_TOKEN_TTL: z.string().default("1h"),
  // Sign-in attempts allowed per minute from one address.
  AUTH_RATE_LIMIT: z.coerce.number().int().min(1).default(10),
  REFRESH_IDLE_DAYS: z.coerce.number().int().min(1).max(365).default(60),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment:\n${msg}`);
  }
  return parsed.data;
}
