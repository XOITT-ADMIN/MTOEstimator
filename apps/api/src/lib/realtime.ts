import type { WebSocket } from "ws";

export type Resource = "estimates" | "stock" | "rates" | "company" | "members" | "catalog";

// In-process fan-out of "something changed" events, per company. The app refetches the resource
// when it hears about it. For more than one API instance, swap this for Redis pub/sub.
export class RealtimeHub {
  private rooms = new Map<string, Set<WebSocket>>();

  join(companyId: string, socket: WebSocket) {
    let room = this.rooms.get(companyId);
    if (!room) this.rooms.set(companyId, (room = new Set()));
    room.add(socket);
    socket.on("close", () => {
      room!.delete(socket);
      if (room!.size === 0) this.rooms.delete(companyId);
    });
  }

  publish(companyId: string, resource: Resource, extra: Record<string, unknown> = {}) {
    const room = this.rooms.get(companyId);
    if (!room) return;
    const msg = JSON.stringify({ type: "changed", resource, at: Date.now(), ...extra });
    for (const s of room) if (s.readyState === 1) s.send(msg);
  }

  size(companyId: string) {
    return this.rooms.get(companyId)?.size ?? 0;
  }
}
