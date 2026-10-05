// Minimal types for the API (the app is plain JS and doesn't need them).
export interface CatalogItem { name: string; unit: string; needsSecondarySize?: boolean; needsCore?: boolean; family?: string }
export interface TradeCatalog {
  families: string[];
  items: Record<string, CatalogItem[]>;
  materials: string[];
  sizes: string[];
  cores?: string[];
  [k: string]: unknown;
}
export const CATALOG: { plumbing: TradeCatalog; electrical: TradeCatalog; [k: string]: unknown };
export const TRADE_KEY: Record<string, string>;
export function tradeCatalog(trade: string): TradeCatalog | undefined;
export function tradeItems(trade: string): (CatalogItem & { family: string })[];
export function findItem(trade: string, name: string): (CatalogItem & { family: string }) | undefined;
export function unitFor(trade: string, name: string): string | undefined;


export interface Rate { materialRate: number; labourRate: number }
export function getDefaultRate(trade: string, family: string, item: string, material?: string | null): Rate & { source: string };
export function listAllRates(): (Rate & { key: string; trade: string; family: string; item: string; material: string | null })[];

export function stockKey(line: { trade: string; item: string; material: string; size: string; secondarySize?: string | null; core?: string | null }): string;
export function rateKey(trade: string, family: string, item: string, material?: string | null): string;

export function round2(value: number): number;
export function calculateEstimateBreakdown(estimate: unknown): Record<string, unknown>;
