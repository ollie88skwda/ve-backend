// ve-backend Astro entry: components plus helpers for getStaticPaths.
export { default as VeHead } from "./components/VeHead.astro";
export { default as ProductCard } from "./components/ProductCard.astro";
export { default as ProductGrid } from "./components/ProductGrid.astro";
export { default as ShopIndex } from "./components/ShopIndex.astro";
export { default as CategoryPage } from "./components/CategoryPage.astro";
export { default as ProductPage } from "./components/ProductPage.astro";
export { default as CartButton } from "./components/CartButton.astro";
export { default as Cart } from "./components/Cart.astro";
export { default as Checkout } from "./components/Checkout.astro";
export { ensureCatalog } from "./lib.js";
export { getShopPaths, findProduct, findCategory, visibleProducts, formatMoney, productUrl, categoryUrl, unitPrice, perUnit, loadCatalog } from "../src/core.js";
