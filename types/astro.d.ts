import type { Catalog } from "./core";
export function ensureCatalog(raw: unknown): Catalog;
export { getShopPaths, findProduct, findCategory, visibleProducts, formatMoney } from "./core";
export const VeHead: any;
export const ProductCard: any;
export const ProductGrid: any;
export const ShopIndex: any;
export const CategoryPage: any;
export const ProductPage: any;
export const CartButton: any;
export const Cart: any;
export const Checkout: any;
export interface VeBackendOptions { catalog?: string; layout?: string; layoutProps?: Record<string, unknown>; routes?: boolean }
export default function veBackend(options?: VeBackendOptions): { name: string; hooks: Record<string, unknown> };
