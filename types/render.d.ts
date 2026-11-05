import type { Catalog, Product, CartLine, CartTotals, CardStyle } from "./core";
export interface CardOptions { headingLevel?: number; loading?: "lazy" | "eager"; actions?: boolean; buyNow?: boolean; reveal?: boolean; className?: string; cardStyle?: CardStyle }
export interface GridOptions extends CardOptions { category?: string; products?: Product[]; featured?: boolean; limit?: number; columns?: number; emptyText?: string; eager?: boolean; gridAttrs?: Record<string, string | boolean> }
export const ICONS: Record<"arrow" | "bag" | "check" | "plus" | "external", string>;
export function esc(value: unknown): string;
export function renderVisual(catalog: Catalog, product: Product, opts?: { className?: string; loading?: string }): string;
export function renderPrice(catalog: Catalog, product: Product, opts?: { size?: string; unit?: number }): string;
export function renderProductCard(catalog: Catalog, product: Product, opts?: CardOptions): string;
export function renderProductGrid(catalog: Catalog, opts?: GridOptions): string;
export function renderCategoryNav(catalog: Catalog, active?: string): string;
export function renderShopIndex(catalog: Catalog, opts?: GridOptions & { tabs?: boolean }): string;
export function renderCategoryPage(catalog: Catalog, slug: string, opts?: GridOptions & { tabs?: boolean }): string;
export function renderStepper(label: string, value?: number): string;
export function renderOptions(catalog: Catalog, product: Product, selection?: Record<string, string>, prefix?: string): string;
export function renderProductPage(catalog: Catalog, slug: string, opts?: { crumbs?: boolean; faqs?: { q: string; a: string }[]; reveal?: boolean; cardStyle?: CardStyle }): string;
export function renderCartButton(catalog: Catalog, opts?: { label?: string; className?: string }): string;
export function renderCartView(catalog: Catalog, lines: CartLine[]): string;
export function renderOrderSummary(catalog: Catalog, totals: CartTotals, opts?: { editLink?: boolean }): string;
export function renderPosPanel(catalog: Catalog, totals: CartTotals): string;
export function renderCheckoutView(catalog: Catalog, lines: CartLine[]): string;
export function renderConfirmation(catalog: Catalog, order: { number: string; name?: string; items: { name: string; quantity: number; options?: string; total: number }[]; total: number }): string;
export function renderCartShell(catalog: Catalog): string;
export function renderCheckoutShell(catalog: Catalog): string;
export function renderDataScript(publicCatalog: Catalog): string;
