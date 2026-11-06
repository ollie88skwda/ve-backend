import type { Catalog, Product } from "./core";
export const DEFAULT_LIVE_URL: string;
export function fetchLiveCatalog(url?: string, options?: { timeoutMs?: number; fetchImpl?: typeof fetch }): Promise<Catalog | null>;
export function liveContent<T extends Record<string, unknown>>(live: Catalog | null | undefined, blockId: string, fallback?: T): T & Record<string, any>;
export function mergeLiveProducts<P extends { slug: string }>(buildProducts: P[], live: Catalog | null | undefined): { products: P[]; added: Product[] };
