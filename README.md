# ve-backend

A plug-and-play storefront for **Virtual Enterprise (VE)** student companies. One catalog file drives product cards, product pages, category pages, a cart, and checkout (an educational demo form or your **VE Trade Show POS** link). A passcode-protected **sales editor** lets anyone on the team change products, prices, photos and the look of the store with a live preview.

- Works with **Astro** (static pages generated for you), **React/Next.js**, or **plain HTML** (custom elements, no build step).
- Plain ESM JavaScript + CSS. No build step on install, no runtime dependencies. Types included.
- Brandable with CSS variables: colors, fonts, corner radius, card shapes (arch, rounded, flat), button shape, tinted photo backgrounds, entrance and hover motion (off for reduced-motion visitors).

> Store UI and sales editor adapted from **Hangr** (a VE company store). Thanks to the Hangr team.

**Using an AI coding agent?** Point it at [`AGENTS.md`](AGENTS.md). It covers the rules, and `docs/` covers the functional contract (`data-ve-*` hooks, events), theming and custom-markup recipes, integration, catalog fields, the editor and error codes, so an agent can restyle the store without breaking cart or checkout.

## Install

```sh
npm install github:ollie88skwda/ve-backend#semver:^0.2.0
npx ve-backend init        # adds src/data/ve.catalog.json, a passcode file and shop pages
npm run editor             # opens the sales editor at http://127.0.0.1:4410/
```

### Updating

```sh
npm update ve-backend      # picks up the newest v0.2.x tag on GitHub
```

Releases are git tags (`v0.1.0`, `v0.1.1`, …). `#semver:^0.2.0` means "newest 0.2.x release" (for 0.x versions npm treats the middle number as breaking, so moving to 0.3.0 means editing the install line). Pin an exact version with `#v0.1.0`.

### Developing the library against a live site

```sh
# in ve-backend/
npm link
# in your site/
npm link ve-backend        # or: "ve-backend": "file:../ve-backend" in package.json
```

Edits to the library then hot-reload in the site's dev server. Run `npm install` in the site to go back to the GitHub version.

### npm registry

The package is structured for `npm publish` (name, `files`, `exports`, `publishConfig`), but it is not on the npm registry yet. Once someone runs `npm login` and `npm publish`, sites can switch to `npm install ve-backend`.

## Astro

Two ways. Pick one.

**A. Let the integration generate every page** (fastest):

```js
// astro.config.mjs
import { defineConfig } from "astro/config";
import veBackend from "ve-backend/astro/integration";

export default defineConfig({
  trailingSlash: "always",
  integrations: [veBackend({ catalog: "./src/data/ve.catalog.json", layout: "./src/layouts/BaseLayout.astro" })],
});
```

This adds `/shop/`, `/shop/<category>/`, `/shop/<product>/`, `/cart/` and `/checkout/` inside your layout (which receives `title` and `description` props and must render a default `<slot />`).

**B. Own the page files** (`npx ve-backend init --astro` writes these for you):

```astro
---
// src/pages/shop/[slug].astro
import BaseLayout from "../../layouts/BaseLayout.astro";
import { VeHead, CategoryPage, ProductPage, ensureCatalog, getShopPaths } from "ve-backend/astro";
import raw from "../../data/ve.catalog.json";
export const getStaticPaths = () => getShopPaths(ensureCatalog(raw));
const { kind, slug } = Astro.props;
---
<BaseLayout title="…">
  <VeHead catalog={raw} />
  {kind === "category" ? <CategoryPage catalog={raw} slug={slug} /> : <ProductPage catalog={raw} slug={slug} />}
</BaseLayout>
```

Components (all take `catalog`): `VeHead` (once per page: theme variables, catalog data, runtime script), `ProductCard slug`, `ProductGrid category|slugs|featured|limit|columns`, `ShopIndex`, `CategoryPage slug`, `ProductPage slug`, `CartButton`, `Cart`, `Checkout`. Options on cards and grids: `cardStyle`, `headingLevel`, `buyNow`, `reveal`, `className`, `gridAttrs`.

The catalog is validated at build time; a bad catalog fails the build with a list of every problem (`VE_CATALOG_INVALID`).

## React / Next.js

```jsx
import { loadCatalog } from "ve-backend";
import { VeProvider, ProductGrid, CartButton, Cart, Checkout } from "ve-backend/react";
import "ve-backend/styles.css";
import raw from "./ve.catalog.json";
const catalog = loadCatalog(raw);

<VeProvider catalog={catalog}>
  <CartButton catalog={catalog} />
  <ProductGrid catalog={catalog} category="hangers" />
</VeProvider>
```

The wrappers render the same HTML as Astro and start the browser runtime on the client.

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

See `examples/plain-html/index.html`.

## The catalog (`ve.catalog.json`)

| Key | What it does |
|---|---|
| `company` | `name`, `tagline`, `currency` (USD), `locale` (en-US), `url` (for search previews) |
| `shop` | `title`, `intro`, `basePath` (`/shop/`), `cartPath`, `checkoutPath`, `allLabel` |
| `checkout` | `mode`: `demo`, `pos` or `both`; `posUrl` (your VE Trade Show POS new-sale link); `posLabel`; `orderPrefix` for demo order numbers; `note` (educational disclaimer) |
| `theme` | see Theming |
| `categories[]` | `slug`, `name`, `eyebrow`, `title`, `description`, `note`, `image`, `visible` |
| `products[]` | `slug`, `name`, `category`, `price`, `compareAt` (crossed out), `badge`, `offer`, `tagline`, `description`, `images[{src,alt}]`, `tint`, `features[]`, `options[{name, values[{label, priceDelta}]}]`, `bundle{count, unit}` (shows "$32.86 per bouquet"), `checkout`/`posUrl` (per-product override), `featured`, `visible`, `placeholder` (price not confirmed; flagged in the editor and on the card) |
| `contact`, `announcement` | shown where your site renders them; email appears on product pages |

Checkout modes:

- **demo**: the Hangr-style demo checkout. Validates name, email, address, ZIP, card (any 13 to 19 digits), expiry and CVC, then shows a demo order confirmation with an order number. Clearly labeled educational; nothing is stored or sent.
- **pos**: checkout lists the cart and links to your VE Trade Show POS new-sale page. Cards and product pages show a "Buy now" button straight to the POS.
- **both**: POS first, demo form below.

The cart lives in the visitor's browser (`localStorage`), keyed per company. Nothing leaves the device.

## Theming

Every theme value becomes a CSS variable, so you can also override them in your own CSS.

```json
"theme": {
  "colors": { "background": "#FFF7DB", "accent": "#7A3446", "heading": "#BF5E73", "…": "…" },
  "fonts": { "display": "\"Higuen\", Georgia, serif", "body": "…", "accent": "…" },
  "fontFaces": [{ "family": "Higuen", "src": "/assets/fonts/higuen.woff2" }],
  "radius": "18px",
  "card": "arch",
  "button": "pill",
  "imageFit": "contain",
  "imageScale": 0.76,
  "tints": { "butter": "#FCF7B1", "blush": "#FCDCDA" },
  "motion": true
}
```

| Variable | From |
|---|---|
| `--ve-background`, `--ve-surface`, `--ve-text`, `--ve-muted`, `--ve-heading`, `--ve-accent`, `--ve-accent-text`, `--ve-accent-hover`, `--ve-badge`, `--ve-badge-text`, `--ve-sale`, `--ve-border`, `--ve-focus` | `theme.colors` |
| `--ve-font-display`, `--ve-font-body`, `--ve-font-accent` | `theme.fonts` |
| `--ve-tint-<name>` | `theme.tints` (pick one per product with `tint`) |
| `--ve-radius`, `--ve-button-radius`, `--ve-image-fit`, `--ve-image-scale` | `radius`, `button`, `imageFit`, `imageScale` |
| `--ve-sticky-top`, `--ve-max`, `--ve-gutter` | set these in your CSS to match your header height and page width |

Card styles: `arch` (semicircle photo frame, tilting badge), `rounded` (bordered card with lift on hover), `flat` (square photo). Cards fade and rise in as they scroll into view; all motion is disabled for `prefers-reduced-motion`.

## Sales editor

```sh
npx ve-backend editor [--port 4410] [--host 127.0.0.1] [--catalog src/data/ve.catalog.json] [--public public] [--site-url https://…]
```

- **Passcode**: `VE_EDITOR_PASSCODE` from the environment, or from `.env.ve-backend.local` in the site root (`init` creates one and adds it to `.gitignore`). The passcode is never printed or logged. Five wrong tries locks sign-in for five minutes.
- **Personal admin logins**: `ve-backend admin set <username>` (password from stdin or `VE_ADMIN_PASSWORD`) creates a login that works in every ve-backend editor run by the same user on this computer. Stored as scrypt hashes in `~/.config/ve-backend/admins.json` (override with `VE_ADMINS_FILE`). Also `ve-backend admin list` and `ve-backend admin remove <username>`. Sign in with your username and password; leave the username empty to use the team passcode. See `docs/editor.md`.
- **Products**: add, duplicate, delete, drag to reorder, show/hide, feature. Edit name, prices, compare-at price, badge, offer, category, card tint, description, highlights, photos (upload or use an existing site image; reorder; alt text), options with price changes, bundle size, per-product checkout, web address.
- **Live preview**: product card or full product page, desktop or phone width, rendered with the same code as the site, updating as you type.
- **Categories**, **Look** (colors, fonts, card/button shape, photo fit, tints, motion) and **Store settings** (checkout mode and POS link, company, contact, announcement).
- **History**: every save keeps the previous version in `.ve-backend/history/` (last 30). "Undo last save" restores it. "Discard" drops unsaved changes.
- Saves are validated with the same rules as the build, written atomically, and picked up by your dev server's hot reload.

Settings can also go in the site's `package.json`:

```json
"ve-backend": { "catalog": "src/data/ve.catalog.json", "publicDir": "public", "siteUrl": "https://example.com/", "port": 4410 }
```

`npx ve-backend validate` checks the catalog from the command line and lists placeholder prices.

## Development

```sh
npm install
npm test          # catalog validation, cart math, checkout validation, editor API, Astro page generation
npm run demo      # demo Astro site in examples/demo-site
npm run editor:demo
```

## Credits

Store UI (product tiles, product page, cart, demo checkout) and the sales editor are adapted from **Hangr**, a Virtual Enterprise company store. Built for **Everbloom** first.

MIT License.
