import type { FastifyInstance } from "fastify";

import type { Deps } from "../app.js";
import { isSessionActive } from "../lib/sessions.js";

// GET /ws?token=… — one socket per signed-in device. The server only ever sends
// { type: "changed", resource } and the app refetches that collection.
export async function realtimeRoutes(app: FastifyInstance, { db, hub }: Deps) {
  app.get<{ Querystring: { token?: string } }>("/ws", { websocket: true }, async (socket, req) => {
    try {
      const payload = app.jwt.verify<{ sub: string; sid?: string }>(req.query.token ?? "");
      if (!(await isSessionActive(db, payload.sid, payload.sub))) return socket.close(4401, "signed out");
      const m = await db.membership.findUnique({ where: { userId: payload.sub } });
      if (!m) return socket.close(4403, "not a member");
      hub.join(m.companyId, socket);
      socket.send(JSON.stringify({ type: "hello", companyId: m.companyId }));
      // Keep the connection alive through hosting proxies that drop idle sockets.
      const ping = setInterval(() => socket.readyState === 1 && socket.ping(), 25_000);
      socket.on("close", () => clearInterval(ping));
    } catch {
      socket.close(4401, "unauthorized");
    }
  });
}
