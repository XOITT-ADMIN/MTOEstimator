import { createHash, randomBytes } from "node:crypto";

import type { Db } from "../db.js";

// Sign-in sessions, one per device.
//   access token  — JWT, short-lived (default 1 hour), sent with every request: { sub, sid }
//   refresh token — random 48 bytes, only its SHA-256 is stored; swapped for a new pair on
//                   every refresh (rotation), so a copied old refresh token stops working.
// A session ends when it is revoked (sign out / "sign out of all devices") or when the device
// hasn't been used for REFRESH_IDLE_DAYS — then the email code is needed again.

export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
export const newRefreshToken = () => randomBytes(48).toString("base64url");

export async function createSession(db: Db, userId: string, idleDays: number, device: { name?: string; platform?: string } = {}) {
  const refreshToken = newRefreshToken();
  const session = await db.session.create({
    data: {
      userId,
      refreshHash: hashToken(refreshToken),
      deviceName: (device.name || "").slice(0, 80),
      platform: (device.platform || "").slice(0, 20),
      expiresAt: new Date(Date.now() + idleDays * 86400_000),
    },
  });
  return { session, refreshToken };
}

// Swap a refresh token for a new one. Returns null when it is unknown, revoked or expired.
export async function rotateSession(db: Db, refreshToken: string, idleDays: number) {
  const s = await db.session.findUnique({ where: { refreshHash: hashToken(refreshToken) } });
  if (!s || s.revokedAt || s.expiresAt.getTime() < Date.now()) return null;
  const next = newRefreshToken();
  const updated = await db.session.update({
    where: { id: s.id },
    data: { refreshHash: hashToken(next), lastUsedAt: new Date(), expiresAt: new Date(Date.now() + idleDays * 86400_000) },
  });
  return { session: updated, refreshToken: next };
}

export async function isSessionActive(db: Db, sid: string | undefined, userId: string) {
  if (!sid) return false;
  const s = await db.session.findUnique({ where: { id: sid }, select: { userId: true, revokedAt: true, expiresAt: true } });
  return !!s && s.userId === userId && !s.revokedAt && s.expiresAt.getTime() > Date.now();
}
