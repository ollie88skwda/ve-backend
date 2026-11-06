# Integrating ve-backend into a site

## 0. Install

```sh
npm install github:ollie88skwda/ve-backend#semver:^0.2.0
npx ve-backend init          # --astro or --html is auto-detected; add --force to overwrite
```

`init` creates (and never overwrites without `--force`):

- `src/data/ve.catalog.json`: starter catalog
- `.env.ve-backend.local`: random team passcode for the editor (mode 600, added to `.gitignore`)
- `.gitignore` entries: `.env.ve-backend.local`, `.ve-backend/`
- Astro: `src/pages/shop/index.astro`, `src/pages/shop/[slug].astro`, `src/pages/cart.astro`, `src/pages/checkout.astro`
- HTML: `shop.html`
- `package.json` script `"editor": "ve-backend editor"`

Then fill in the catalog (company, checkout, theme, categories, products) and run `npx ve-backend validate`.

## Astro (recommended)

### Option A: own the page files (most control)

After `init --astro`, replace `DefaultLayout` with the site's layout in each generated page:

```astro
---
import BaseLayout from "../../layouts/BaseLayout.astro";
import { VeHead, CategoryPage, ProductPage, ensureCatalog, getShopPaths, findProduct, findCategory } from "ve-backend/astro";
import raw from "../../data/ve.catalog.json";
const catalog = ensureCatalog(raw);
export const getStaticPaths = () => getShopPaths(catalog);   // categories + products, one route each
const { kind, slug } = Astro.props;
const item = kind === "category" ? findCategory(catalog, slug) : findProduct(catalog, slug);
---
<BaseLayout title={`${item.name} | ${catalog.company.name}`} description={item.tagline || item.description}>
  <VeHead catalog={raw} />
  <div class="ve-page">
    {kind === "category" ? <CategoryPage catalog={raw} slug={slug} /> : <ProductPage catalog={raw} slug={slug} />}
  </div>
</BaseLayout>
```

Put `<VeHead catalog={raw} />` once on **every** page that shows store UI, including the home page if it has cards and every page whose header has the cart button. The simplest approach is to put it in the site layout.

Header cart button: `<CartButton catalog={raw} label="Cart" className="header-cart" />`.

Home page cards: `<ProductGrid catalog={raw} category="bouquets" />` or `slugs={["a","b"]}` or `featured limit={3}`.

### Option B: integration generates the pages

```js
// astro.config.mjs
import veBackend from "ve-backend/astro/integration";
export default defineConfig({
  trailingSlash: "always",
  integrations: [veBackend({ catalog: "./src/data/ve.catalog.json", layout: "./src/layouts/BaseLayout.astro" })],
});
```

The layout receives `title` and `description` props and must render a default `<slot />`. Don't combine this with page files at the same paths. Use `routes: false` to keep only the virtual module.

### Astro gotchas

- Remove any old redirect or page at `/shop`, `/cart` or `/checkout` before adding the new ones.
- With `trailingSlash: "always"`, keep `shop.basePath` etc. ending in `/` (validation enforces it).
- A bad catalog fails the build with `VE_CATALOG_INVALID` and a list of field errors. Fix the JSON or use the editor.
- If the site has a sticky header, set `--ve-sticky-top` so the product buy box doesn't hide under it.

## React / Next.js

```jsx
"use client";
import { loadCatalog } from "ve-backend";
import { VeProvider, ProductGrid, ProductPage, CartButton, Cart, Checkout } from "ve-backend/react";
import "ve-backend/styles.css";
import raw from "@/data/ve.catalog.json";
const catalog = loadCatalog(raw);

export default function Shop() {
  return (
    <VeProvider catalog={catalog}>
      <CartButton catalog={catalog} />
      <ProductGrid catalog={catalog} category="hangers" />
    </VeProvider>
  );
}
```

- Wrap once near the root (layout) so every page has the data island and runtime.
- Product routes: generate `/shop/[slug]` from `getShopPaths(catalog)` (`generateStaticParams`) and render `<ProductPage catalog={catalog} slug={slug} />`.
- Cart and checkout pages: `<Cart catalog={catalog} />`, `<Checkout catalog={catalog} />`.
- The wrappers output static HTML and start the runtime on mount; they work with server rendering.

## Plain HTML (no build)

```html
<meta name="ve-catalog" content="/ve.catalog.json">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/ollie88skwda/ve-backend@v0.2.0/src/styles.css">
<script type="module" src="https://cdn.jsdelivr.net/gh/ollie88skwda/ve-backend@v0.2.0/src/runtime.js"></script>

<ve-cart-button></ve-cart-button>
<ve-product-grid category="bouquets"></ve-product-grid>
<ve-product-page slug="small-fall-bundle"></ve-product-page>
<ve-cart></ve-cart>
<ve-checkout></ve-checkout>
```

Pin the CDN to a tag (`@v0.2.0`) and bump it to update. Or copy `node_modules/ve-backend/src` into the site and reference it locally. See `examples/plain-html/index.html`.

## After integrating

1. Set `checkout.mode` and `checkout.posUrl` (VE Trade Show POS new-sale link) if the company uses the POS.
2. Match the brand (`docs/customizing.md`).
3. Add `npm run editor` instructions to the site's README or handoff for the humans.
4. Run the checklist in `AGENTS.md`.

## Updating the library in a site

```sh
npm update ve-backend        # newest 0.2.x tag
npm ls ve-backend            # confirm the version
```

Then rebuild and rerun the checklist. While the library is 0.x, npm treats a middle-number bump (0.2 → 0.3) as breaking: `^0.2.0` won't install 0.3.0. To move up, change the install line to `#semver:^0.3.0`, reinstall, and read the release notes.

Local development against an unreleased library: `npm link` in `ve-backend/`, then `npm link ve-backend` in the site (or `"ve-backend": "file:../ve-backend"`). Run `npm install` to go back to the GitHub version.
