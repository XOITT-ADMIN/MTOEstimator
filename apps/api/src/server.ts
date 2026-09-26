import { buildApp } from "./app.js";
import { createDb } from "./db.js";
import { loadEnv } from "./env.js";

const env = loadEnv();
const db = createDb(env.DATABASE_URL);
const { app, deps } = await buildApp({ db, env });

if (!deps.mailer.enabled && env.OTP_DEMO) {
  app.log.warn("OTP_DEMO is on: sign-in codes are returned by the API. Set SMTP_URL before going live.");
}

const close = async () => {
  await app.close();
  await db.$disconnect();
  process.exit(0);
};
process.on("SIGINT", close);
process.on("SIGTERM", close);

await app.listen({ port: env.PORT, host: env.HOST });
