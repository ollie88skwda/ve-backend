export type CheckoutMode = "demo" | "pos" | "both";
export type CardStyle = "arch" | "rounded" | "flat";
export type ButtonStyle = "pill" | "rounded" | "square";

export interface ProductImage { src: string; alt?: string }
export interface OptionValue { label: string; priceDelta?: number }
export interface ProductOption { name: string; values: OptionValue[] }
export interface Product {
  slug: string;
  name: string;
  category?: string;
  price: number;
  compareAt?: number;
  badge?: string;
  offer?: string;
  tagline?: string;
  description?: string;
  images?: ProductImage[];
  /** Name of a theme tint used behind the photo. */
  tint?: string;
  features?: string[];
  options?: ProductOption[];
  bundle?: { count: number; unit: string };
  /** Override the store checkout mode for this product. */
  checkout?: "" | CheckoutMode;
  posUrl?: string;
  featured?: boolean;
  visible?: boolean;
  /** Price not confirmed yet; the editor flags it. */
  placeholder?: boolean;
}
export interface Category { slug: string; name: string; eyebrow?: string; title?: string; description?: string; note?: string; image?: string; tint?: string; visible?: boolean }
export interface Theme {
  colors: Record<"background" | "surface" | "text" | "muted" | "heading" | "accent" | "accentText" | "accentHover" | "badge" | "badgeText" | "sale" | "border" | "focus", string>;
  fonts: Record<"display" | "body" | "accent", string>;
  fontFaces?: { family: string; src: string; weight?: string; style?: "normal" | "italic" }[];
  radius: string;
  card: CardStyle;
  imageFit: "contain" | "cover";
  imageScale: number;
  button: ButtonStyle;
  tints: Record<string, string>;
  motion: boolean;
}
export type ContentFieldType = "text" | "textarea" | "link" | "image" | "toggle";
export interface ContentField { id: string; label: string; type: ContentFieldType; help?: string; required?: boolean; max?: number; value: string | boolean; alt?: string }
/** An editable block of site content (hero, banner…) declared by the site and edited in the sales editor. */
export interface ContentBlock { id: string; label: string; help?: string; fields: ContentField[] }
export interface Catalog {
  version: 1;
  company: { name: string; tagline?: string; currency: string; locale: string; url?: string };
  shop: { title: string; intro?: string; basePath: string; cartPath: string; checkoutPath: string; allLabel: string };
  announcement: { enabled: boolean; text: string; linkLabel: string; link: string };
  contact: { email: string; phone: string; location: string; hours: string; instagram: string };
  checkout: { mode: CheckoutMode; posUrl: string; orderPrefix: string; posLabel: string; note: string; /** false = no cart: Buy goes to the POS link, or the product page when none is set. Default true. */ cart: boolean };
  theme: Theme;
  content: ContentBlock[];
  categories: Category[];
  products: Product[];
}
export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };
export interface CartLine { id: string; slug: string; options: Record<string, string>; quantity: number }
export interface CartItem extends CartLine { product: Product; unitPrice: number; lineTotal: number; lineSavings: number }
export interface CartTotals { items: CartItem[]; count: number; subtotal: number; savings: number; total: number; hasPlaceholder: boolean }
export type CheckoutValues = Record<"name" | "email" | "address" | "city" | "region" | "postal" | "card" | "expiry" | "cvc", string>;

export const CHECKOUT_MODES: CheckoutMode[];
export const CARD_STYLES: CardStyle[];
export const BUTTON_STYLES: ButtonStyle[];
export const MAX_QUANTITY: number;
export const DEFAULT_THEME: Theme;
export const DEFAULT_CATALOG: Catalog;
export const CHECKOUT_FIELDS: (keyof CheckoutValues)[];
export function slugify(text: string): string;
export function validateCatalog(input: unknown): { value: Catalog; errors?: undefined } | { errors: Record<string, string>; value?: undefined };
export function loadCatalog(input: unknown): Catalog;
export const CONTENT_TYPES: ContentFieldType[];
/** One content block as { fieldId: value } (image fields also give `<id>Alt`), over the given fallbacks. */
export function getContent<T extends Record<string, string | boolean> = Record<string, string>>(catalog: Catalog | unknown, blockId: string, fallback?: Partial<T>): T & Record<string, string | boolean>;
export function visibleProducts(catalog: Catalog, category?: string): Product[];
export function findProduct(catalog: Catalog, slug: string): Product | null;
export function findCategory(catalog: Catalog, slug: string): Category | null;
export function productUrl(catalog: Catalog, product: Product): string;
export function cartEnabled(catalog: Catalog): boolean;
export function buyLinkFor(catalog: Catalog, product: Product): { href: string; external: boolean; pos: boolean };
export function categoryUrl(catalog: Catalog, category: Category): string;
export function getShopPaths(catalog: Catalog): { params: { slug: string }; props: { kind: "category" | "product"; slug: string } }[];
export function formatMoney(catalog: Catalog, value: number): string;
export function defaultSelection(product: Product): Record<string, string>;
export function normalizeSelection(product: Product, selection?: Record<string, string>): Record<string, string>;
export function unitPrice(product: Product, selection?: Record<string, string>): number;
export function perUnit(product: Product): number | null;
export function savingsPercent(product: Product): number | null;
export function lineId(slug: string, selection?: Record<string, string>): string;
export function addToCart(lines: CartLine[], catalog: Catalog, slug: string, quantity?: number, selection?: Record<string, string>): CartLine[];
export function setQuantity(lines: CartLine[], id: string, quantity: number): CartLine[];
export function removeLine(lines: CartLine[], id: string): CartLine[];
export function sanitizeLines(raw: unknown, catalog: Catalog): CartLine[];
export function cartTotals(lines: CartLine[], catalog: Catalog): CartTotals;
export function checkoutModeFor(catalog: Catalog, items?: CartItem[]): CheckoutMode;
export function posUrlFor(catalog: Catalog, items?: CartItem[]): string;
export function validateCheckout(values: Partial<CheckoutValues>): Partial<Record<keyof CheckoutValues, string>>;
export function orderNumber(prefix?: string, randomBytes?: (n: number) => ArrayLike<number>): string;
export function themeCss(theme?: Theme, selector?: string): string;
export function publicCatalog(catalog: Catalog): Catalog;
