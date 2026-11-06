// Thin React wrappers (Next.js, Vite). They render the same HTML as every other surface and
// start the browser runtime on the client. Pass the validated catalog (loadCatalog(json)).
import { createElement, useEffect, useState } from "react";
import { publicCatalog, themeCss } from "../src/core.js";
import { fetchLiveCatalog, DEFAULT_LIVE_URL } from "../src/live.js";
import { renderCartButton, renderCartShell, renderCheckoutShell, renderDataScript, renderProductCard, renderProductGrid, renderProductPage, renderShopIndex, renderCategoryPage } from "../src/render.js";

const html = (__html, tag = "div", props = {}) => createElement(tag, { ...props, dangerouslySetInnerHTML: { __html } });
const useRuntime = () =>
  useEffect(() => {
    import("../src/runtime.js").then((m) => {
      m.start();
      m.initProductPages();
      m.initReveal();
    });
  }, []);

/** Render once in your root layout (inside <body>). */
export function VeProvider({ catalog, children }) {
  useRuntime();
  return createElement("div", { style: { display: "contents" } }, createElement("style", { dangerouslySetInnerHTML: { __html: themeCss(catalog.theme) } }), html(renderDataScript(publicCatalog(catalog)), "div", { hidden: true }), children);
}
export const ProductCard = ({ catalog, product, ...opts }) => html(renderProductCard(catalog, product, opts), "div", { style: { display: "contents" } });
export const ProductGrid = ({ catalog, ...opts }) => html(renderProductGrid(catalog, opts));
export const ShopIndex = ({ catalog, ...opts }) => html(renderShopIndex(catalog, opts), "div", { className: "ve-shop" });
export const CategoryPage = ({ catalog, slug, ...opts }) => html(renderCategoryPage(catalog, slug, opts), "div", { className: "ve-shop" });
export function ProductPage({ catalog, slug, ...opts }) {
  useRuntime();
  return html(renderProductPage(catalog, slug, opts));
}
export const CartButton = ({ catalog, ...opts }) => html(renderCartButton(catalog, opts), "span", { style: { display: "contents" } });
export const Cart = ({ catalog }) => html(renderCartShell(catalog));
export const Checkout = ({ catalog }) => html(renderCheckoutShell(catalog));

/**
 * Live catalog from the hosted editor (docs/hosted.md). Returns null until the fetch finishes (or forever if it fails),
 * so render the build-time catalog first and switch when this returns a value:
 *   const live = useLiveCatalog(); const hero = getContent(live || catalog, "hero", fallback);
 * All components share one request per url.
 */
const liveRequests = new Map();
export function useLiveCatalog(url = DEFAULT_LIVE_URL) {
  const [live, setLive] = useState(null);
  useEffect(() => {
    let alive = true;
    if (!liveRequests.has(url)) liveRequests.set(url, fetchLiveCatalog(url));
    liveRequests.get(url).then((c) => alive && c && setLive(c));
    return () => { alive = false; };
  }, [url]);
  return live;
}
