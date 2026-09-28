import { CATALOG, findBrokenStock, normalizeCatalog, validateCatalog } from "@mto/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { assert, can, requireMember } from "../lib/access.js";
import { badRequest, conflict } from "../lib/errors.js";
import type { Deps } from "../app.js";

const tradeSchema = z
  .object({
    families: z.array(z.string().min(1)).min(1),
    items: z.record(z.string(), z.array(z.object({ name: z.string().min(1), unit: z.string().min(1) }).passthrough())),
    materials: z.array(z.string()),
    sizes: z.array(z.string()),
  })
  .passthrough();

const catalogSchema = z.object({ plumbing: tradeSchema, electrical: tradeSchema }).passthrough();

// The item catalog (families → items, materials, sizes, cores). Admins publish new versions;
// the app downloads the latest and keeps it for offline use. Version 0 = the bundled default.
//
// Every save is a full new version (old versions are kept as history). Before saving we check:
//   · the library is usable (items, materials and sizes for each trade, no duplicate names);
//   · nobody else saved in the meantime (baseVersion) — otherwise the later save would silently
//     wipe the earlier one;
//   · no stock line points at an item / material / size / core that the new version removes.
export async function libraryRoutes(app: FastifyInstance, { db, hub }: Deps) {
  const auth = { onRequest: [app.authenticate] };

  app.get("/library/catalog", auth, async (req) => {
    const m = await requireMember(db, req);
    const latest = await db.catalogVersion.findFirst({ where: { companyId: m.companyId }, orderBy: { version: "desc" } });
    if (!latest) return { version: 0, publishedAt: null, data: CATALOG };
    return { version: latest.version, publishedAt: latest.publishedAt.getTime(), note: latest.note, data: latest.data };
  });

  app.get("/library/catalog/versions", auth, async (req) => {
    const m = await requireMember(db, req);
    const rows = await db.catalogVersion.findMany({ where: { companyId: m.companyId }, orderBy: { version: "desc" }, select: { version: true, note: true, publishedAt: true, publishedById: true } });
    return rows.map((r) => ({ ...r, publishedAt: r.publishedAt.getTime() }));
  });

  app.post("/library/catalog", auth, async (req) => {
    const m = await requireMember(db, req);
    assert(can.manageLibrary(m.roles), "Only an owner or admin can publish the library.");
    const body = z
      .object({ data: catalogSchema, note: z.string().max(500).optional().default(""), baseVersion: z.number().int().min(0).optional() })
      .parse(req.body);
    const data = normalizeCatalog(body.data);
    const problems = validateCatalog(data);
    if (problems.length) throw badRequest(problems[0], { problems });

    const created = await db.$transaction(async (tx) => {
      const last = await tx.catalogVersion.findFirst({ where: { companyId: m.companyId }, orderBy: { version: "desc" }, select: { version: true } });
      const current = last?.version ?? 0;
      if (body.baseVersion != null && body.baseVersion !== current) {
        throw conflict("Someone else changed the library just now. Your screen has been refreshed — please make your change again.", "catalog_changed", { version: current });
      }
      const stock = await tx.stockLine.findMany({ where: { companyId: m.companyId }, select: { trade: true, item: true, material: true, size: true, secondarySize: true, core: true } });
      const broken = findBrokenStock(data, stock);
      if (broken.length) {
        throw conflict(`This change removes something your stock still uses. Remove or change those stock lines first.\n\n${broken.slice(0, 5).join("\n")}${broken.length > 5 ? `\n…and ${broken.length - 5} more` : ""}`, "catalog_in_use", { problems: broken });
      }
      return tx.catalogVersion.create({
        data: { companyId: m.companyId, version: current + 1, data: data as object, note: body.note, publishedById: m.userId },
      });
    });
    hub.publish(m.companyId, "catalog", { version: created.version });
    return { version: created.version, publishedAt: created.publishedAt.getTime() };
  });
}
