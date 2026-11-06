import type { CartLine, CartTotals, CheckoutMode, Catalog } from "./core";
export interface CartApi {
  readonly lines: CartLine[];
  totals(): CartTotals;
  add(slug: string, quantity?: number, options?: Record<string, string>): void;
  setQuantity(id: string, quantity: number): void;
  remove(id: string): void;
  clear(): void;
}
export const cartApi: CartApi;
export function start(): CartApi | null;
export function initProductPages(root?: ParentNode): void;
export function initReveal(root?: ParentNode): void;
export function checkoutModeFor(catalog: Catalog, items?: unknown[]): CheckoutMode;
declare global {
  interface Window { veCart?: CartApi }
  interface Window { veLiveCatalog?: Catalog }
  interface DocumentEventMap { "ve:cart": CustomEvent<CartTotals>; "ve:live": CustomEvent<{ catalog: Catalog }> }
}
export function startLive(url?: string): Promise<Catalog | null>;
