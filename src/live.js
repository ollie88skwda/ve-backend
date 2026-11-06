// Live overlay: fetch the hosted editor's public catalog at runtime so saved changes show without a rebuild.
// Pure fetch + helpers (no DOM). The browser runtime, React hook and Astro pages all use these.
import { getContent } from "./core.js";

export const DEFAULT_LIVE_URL = "/api/catalog";

/**
 * Fetch the public catalog saved in the hosted editor. Resolves to the catalog object, or null when unreachable
 * or malformed (callers keep the build-time catalog). Never throws.
 */
export async function fetchLiveCatalog(url = DEFAULT_LIVE_URL, { timeoutMs = 6000, fetchImpl } = {}) {
  const doFetch = fetchImpl || (typeof fetch === "function" ? fetch : null);
  if (!doFetch) return null;
  try {
    const ctl = typeof AbortController === "function" ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
    const res = await doFetch(url, { headers: { Accept: "application/json" }, cache: "no-cache", signal: ctl?.signal });
    if (timer) clearTimeout(timer);
    if (!res.ok || !(res.headers.get("content-type") || "").includes("json")) return null;
    const body = await res.json();
    const c = body && typeof body === "object" ? body.catalog : null;
    return c && Array.isArray(c.products) && Array.isArray(c.content || []) ? c : null;
  } catch {
    return null;
  }
}

/** getContent() for a live catalog, falling back to build-time values: liveContent(live, "hero", buildTimeHero). */
export const liveContent = (live, blockId, fallback = {}) => (live ? getContent(live, blockId, fallback) : { ...fallback });

/** Overlay live product fields (name, price, tagline, visibility...) onto build-time products matched by slug. Unknown live slugs are returned in `added` (they have no page until a rebuild). */
export function mergeLiveProducts(buildProducts, live) {
  const bySlug = new Map((live?.products || []).map((p) => [p.slug, p]));
  const merged = buildProducts.map((p) => (bySlug.has(p.slug) ? { ...p, ...bySlug.get(p.slug) } : p));
  const have = new Set(buildProducts.map((p) => p.slug));
  return { products: merged, added: (live?.products || []).filter((p) => !have.has(p.slug)) };
}
