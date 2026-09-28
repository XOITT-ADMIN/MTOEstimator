import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { ZodError } from "zod";

import type { Db } from "./db.js";
import type { Env } from "./env.js";
import { HttpError } from "./lib/errors.js";
import { createMailer, type Mailer } from "./lib/mailer.js";
import { RealtimeHub } from "./lib/realtime.js";
import { isSessionActive } from "./lib/sessions.js";
import { authRoutes } from "./routes/auth.js";
import { companyRoutes } from "./routes/company.js";
import { libraryRoutes } from "./routes/library.js";
import { mtoRoutes } from "./routes/mtos.js";
import { projectRoutes } from "./routes/projects.js";
import { realtimeRoutes } from "./routes/realtime.js";
import { stockRoutes } from "./routes/stock.js";
import { syncRoutes } from "./routes/sync.js";

export interface Deps {
  db: Db;
  env: Env;
  hub: RealtimeHub;
  mailer: Mailer;
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string; sid?: string };
    user: { sub: string; sid?: string };
  }
}

export async function buildApp({ db, env, mailer, logger = true }: { db: Db; env: Env; mailer?: Mailer; logger?: boolean }) {
  const app = Fastify({
    logger: logger ? { level: env.NODE_ENV === "production" ? "info" : "debug" } : false,
    trustProxy: true,
    bodyLimit: 12 * 1024 * 1024, // an estimate's quotation PDF, base64-encoded, rides in the notify-ready request
  });
  const deps: Deps = { db, env, hub: new RealtimeHub(), mailer: mailer ?? createMailer(env.SMTP_URL, env.MAIL_FROM) };

  await app.register(cors, {
    origin: env.CORS_ORIGINS === "*" ? true : env.CORS_ORIGINS.split(",").map((s) => s.trim()),
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  });
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });
  await app.register(jwt, { secret: env.JWT_SECRET });
  await app.register(websocket);

  // Every request: valid signature + not expired + its device session still active
  // (so "sign out of all devices" and removing a lost phone take effect immediately).
  app.decorate("authenticate", async (req: FastifyRequest) => {
    try {
      await req.jwtVerify();
    } catch (e) {
      const expired = (e as { code?: string })?.code === "FST_JWT_AUTHORIZATION_TOKEN_EXPIRED";
      throw new HttpError(401, expired ? "Access token expired." : "Your session has ended. Sign in again.", expired ? "token_expired" : "unauthorized");
    }
    const u = req.user as { sub: string; sid?: string };
    if (!(await isSessionActive(db, u.sid, u.sub))) throw new HttpError(401, "This device was signed out. Sign in again.", "session_revoked");
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) {
      const first = err.issues[0];
      return reply.status(400).send({ code: "bad_request", error: first?.message || "Invalid request.", issues: err.issues });
    }
    if (err instanceof HttpError) return reply.status(err.statusCode).send({ code: err.code, error: err.message, details: err.details });
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) req.log.error(err);
    return reply.status(status).send({ code: status === 429 ? "rate_limited" : "error", error: status >= 500 ? "Something went wrong on the server." : (err as Error).message });
  });

  app.get("/health", async () => {
    await db.$queryRaw`SELECT 1`;
    return { ok: true, time: Date.now(), email: deps.mailer.enabled ? "smtp" : env.OTP_DEMO ? "demo" : "off" };
  });

  await app.register(async (s) => authRoutes(s, deps));
  await app.register(async (s) => companyRoutes(s, deps));
  await app.register(async (s) => syncRoutes(s, deps));
  await app.register(async (s) => libraryRoutes(s, deps));
  await app.register(async (s) => projectRoutes(s, deps));
  await app.register(async (s) => mtoRoutes(s, deps));
  await app.register(async (s) => stockRoutes(s, deps));
  await app.register(async (s) => realtimeRoutes(s, deps));

  // Returned as a pair: a Fastify instance is "thenable", so `await` would unwrap it.
  return { app, deps };
}
