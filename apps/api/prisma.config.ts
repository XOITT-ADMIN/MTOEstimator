import { defineConfig } from "prisma/config";

// Prisma 7 doesn't read .env by itself; load it if present (Node 20.12+).
try {
  process.loadEnvFile(".env");
} catch {
  // no .env — use the real environment (hosting provider settings)
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Empty is fine for `prisma generate` (e.g. during a Docker build); migrate needs the real URL.
  datasource: { url: process.env.DATABASE_URL ?? "" },
});
