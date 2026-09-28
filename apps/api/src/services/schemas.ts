import { z } from "zod";

// What the app sends. Unknown fields are kept (passthrough) so the app can add fields without
// an API release; the API only relies on the ones listed here.
export const estimateLineSchema = z
  .object({
    id: z.string().min(1).max(100),
    trade: z.string().min(1).max(40),
    family: z.string().max(120).optional().default(""),
    item: z.string().min(1).max(160),
    material: z.string().max(120).nullable().optional().default(""),
    size: z.string().max(60).nullable().optional().default(""),
    secondarySize: z.string().max(60).nullable().optional(),
    core: z.string().max(40).nullable().optional(),
    qty: z.coerce.number().min(0).max(1e9),
  })
  .passthrough();

export const estimateSchema = z
  .object({
    id: z.string().min(1).max(100),
    name: z.string().max(200).optional().default("Untitled estimate"),
    // Accepted for backward compatibility with older app builds, but ignored on save — an
    // MTO's status can only change through POST /mtos/:id/transition.
    status: z.string().max(40).optional(),
    projectId: z.string().min(1).max(100),
    updatedAt: z.coerce.number().int().nonnegative(),
    items: z.array(estimateLineSchema).max(5000).optional().default([]),
  })
  .passthrough();

export type EstimateDoc = z.infer<typeof estimateSchema>;

export const stockSchema = z
  .object({
    trade: z.string().min(1).max(40),
    family: z.string().max(120).optional().default(""),
    item: z.string().min(1).max(160),
    material: z.string().max(120).default(""),
    size: z.string().max(60).default(""),
    secondarySize: z.string().max(60).nullable().optional(),
    core: z.string().max(40).nullable().optional(),
    unit: z.string().max(20).optional().default("Nos"),
    stock: z.coerce.number().min(0).max(1e12),
    // Unit price per line. Optional so older app builds that don't send it keep working.
    price: z.coerce.number().min(0).max(1e12).optional(),
  })
  .passthrough();

export const rateSchema = z.object({
  id: z.string().min(3).max(400),
  materialRate: z.coerce.number().min(0).max(1e12),
  labourRate: z.coerce.number().min(0).max(1e12),
});

export const batchSchema = z.object({
  upserts: z.array(z.record(z.string(), z.unknown())).max(5000).default([]),
  deletes: z.array(z.string().min(1).max(400)).max(5000).default([]),
});
