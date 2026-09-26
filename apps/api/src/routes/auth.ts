import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { badRequest, notFound, tooMany, unauthorized, HttpError } from "../lib/errors.js";
import { hashCode, newCode, OTP_MAX_ATTEMPTS, OTP_RESEND_MS, OTP_TTL_MS, sameHash } from "../lib/otp.js";
import { createSession, rotateSession } from "../lib/sessions.js";
import { userId } from "../lib/access.js";
import type { Deps } from "../app.js";

const email = z.string().trim().toLowerCase().email("Enter a valid email address.");

function publicUser(u: { id: string; email: string; name: string; photo: string | null; provider: string }) {
  return { id: u.id, uid: u.id, email: u.email, name: u.name, photo: u.photo, provider: u.provider };
}

export async function authRoutes(app: FastifyInstance, { db, env, mailer }: Deps) {
  const demo = !mailer.enabled && env.OTP_DEMO;
  const signAccess = (uid: string, sid: string) => app.jwt.sign({ sub: uid, sid }, { expiresIn: env.ACCESS_TOKEN_TTL });
  const device = z.object({ name: z.string().max(80).optional(), platform: z.string().max(20).optional() }).optional();
  const tokens = (uid: string, sid: string, refreshToken: string) => {
    const accessToken = signAccess(uid, sid);
    // `token` kept as an alias of accessToken for older app builds.
    return { token: accessToken, accessToken, refreshToken, sessionId: sid };
  };
  const authLimit = { config: { rateLimit: { max: env.AUTH_RATE_LIMIT, timeWindow: "1 minute" } } };

  // Step 1 — email a 6-digit code (or, in demo mode, hand it back in the response).
  app.post("/auth/otp/request", authLimit, async (req) => {
    const body = z.object({ email, name: z.string().trim().max(120).optional().default("") }).parse(req.body);
    if (!mailer.enabled && !demo) throw new HttpError(503, "Email sign-in isn't configured on the server (set SMTP_URL).", "email_disabled");

    const prev = await db.otpCode.findUnique({ where: { email: body.email } });
    if (prev && Date.now() - prev.sentAt.getTime() < OTP_RESEND_MS) throw tooMany("Wait a few seconds before asking for another code.");

    const code = newCode();
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);
    const data = { name: body.name, codeHash: hashCode(code, body.email, env.JWT_SECRET), attempts: 0, expiresAt, sentAt: new Date() };
    await db.otpCode.upsert({ where: { email: body.email }, create: { email: body.email, ...data }, update: data });

    if (mailer.enabled) {
      await mailer.send(
        body.email,
        `${code} is your XMTO sign-in code`,
        `Your XMTO sign-in code is ${code}.\n\nIt expires in 5 minutes. If you didn't ask for it, you can ignore this email.\n\n— XMTO · MEP Material Take-off\nA XOITT Transformation product · https://xoitt.com`
      );
    }
    return { sent: true, expiresAt: expiresAt.getTime(), ...(demo ? { demoCode: code } : {}) };
  });

  // Step 2 — check the code, create the user on first sign-in, return a login token.
  app.post("/auth/otp/verify", authLimit, async (req) => {
    const body = z.object({ email, code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code."), name: z.string().trim().max(120).optional(), device }).parse(req.body);
    const otp = await db.otpCode.findUnique({ where: { email: body.email } });
    if (!otp) throw badRequest("Request a code first.");
    if (otp.expiresAt.getTime() < Date.now()) throw badRequest("That code has expired. Send a new one.");
    if (otp.attempts >= OTP_MAX_ATTEMPTS) {
      await db.otpCode.delete({ where: { email: body.email } });
      throw badRequest("Too many wrong attempts. Send a new code.");
    }
    if (!sameHash(otp.codeHash, hashCode(body.code, body.email, env.JWT_SECRET))) {
      await db.otpCode.update({ where: { email: body.email }, data: { attempts: { increment: 1 } } });
      throw badRequest("That code doesn't match. Check the email and try again.");
    }
    await db.otpCode.delete({ where: { email: body.email } });

    const name = body.name || otp.name || body.email.split("@")[0];
    const user = await db.user.upsert({
      where: { email: body.email },
      create: { email: body.email, name, provider: "email" },
      update: body.name || otp.name ? { name } : {},
    });
    const { session, refreshToken } = await createSession(db, user.id, env.REFRESH_IDLE_DAYS, body.device);
    return { ...tokens(user.id, session.id, refreshToken), user: publicUser(user) };
  });

  // Swap a refresh token for a fresh pair. The old refresh token stops working (rotation).
  app.post("/auth/refresh", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req) => {
    const body = z.object({ refreshToken: z.string().min(20) }).parse(req.body);
    const r = await rotateSession(db, body.refreshToken, env.REFRESH_IDLE_DAYS);
    if (!r) throw unauthorized("Your session has ended. Sign in again.");
    const user = await db.user.findUnique({ where: { id: r.session.userId } });
    if (!user) throw unauthorized();
    return { ...tokens(user.id, r.session.id, r.refreshToken), user: publicUser(user) };
  });

  const auth = { onRequest: [app.authenticate] };
  const sid = (req: { user: unknown }) => (req.user as { sid?: string }).sid;

  // Sign out this device.
  app.post("/auth/logout", auth, async (req) => {
    await db.session.updateMany({ where: { id: sid(req), userId: userId(req) }, data: { revokedAt: new Date() } });
    return { signedOut: true };
  });

  // Devices signed in to this account.
  app.get("/auth/sessions", auth, async (req) => {
    const rows = await db.session.findMany({
      where: { userId: userId(req), revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: "desc" },
    });
    return rows.map((r) => ({
      id: r.id,
      deviceName: r.deviceName || "Unknown device",
      platform: r.platform,
      createdAt: r.createdAt.getTime(),
      lastUsedAt: r.lastUsedAt.getTime(),
      current: r.id === sid(req),
    }));
  });

  // Sign out one device (e.g. a lost phone).
  app.delete<{ Params: { id: string } }>("/auth/sessions/:id", auth, async (req) => {
    const r = await db.session.updateMany({ where: { id: req.params.id, userId: userId(req), revokedAt: null }, data: { revokedAt: new Date() } });
    if (!r.count) throw notFound("That device isn't signed in.");
    return { signedOut: true };
  });

  // Sign out every other device; this one stays signed in.
  app.post("/auth/sessions/revoke-others", auth, async (req) => {
    const r = await db.session.updateMany({ where: { userId: userId(req), revokedAt: null, NOT: { id: sid(req) } }, data: { revokedAt: new Date() } });
    return { signedOut: r.count };
  });
}
