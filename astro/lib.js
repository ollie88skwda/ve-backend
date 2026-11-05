// Shared helper for the Astro components: validate a raw catalog once per object.
import { loadCatalog } from "../src/core.js";
const cache = new WeakMap();
export function ensureCatalog(raw) {
  if (!raw) throw new Error("VE_CATALOG_PROP_MISSING: pass catalog={...} (import it from your ve.catalog.json) to the ve-backend component.");
  if (cache.has(raw)) return cache.get(raw);
  const value = raw.__veValid ? raw : loadCatalog(raw);
  Object.defineProperty(value, "__veValid", { value: true, enumerable: false });
  cache.set(raw, value);
  return value;
}
