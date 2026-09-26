import type { Prisma } from "../db.js";

export function toNum(v: Prisma.Decimal | number | string | null | undefined): number {
  if (v == null) return 0;
  return Math.round(Number(v) * 100) / 100;
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
