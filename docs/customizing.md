# Customizing: make it the brand's own

There are three layers. Start at layer 1 and only go deeper when the design needs it. Every layer keeps the store working as long as you follow `docs/contract.md`.

| Layer | Where | Changes | Survives `npm update`? |
|---|---|---|---|
| 1. Theme tokens | `theme` in `ve.catalog.json` (also editable in the sales editor's **Look** tab) | colors, fonts, card shape, button shape, tints, photo fit/scale, motion | yes |
| 2. CSS | the site's own stylesheet, targeting `--ve-*` variables and `.ve-*` classes | anything visual: layout, typography, hover effects, spacing | yes |
| 3. Custom markup | the site's own components, wired with `data-ve-*` hooks | completely new card/page structures | yes, if hooks are kept |

Never edit `node_modules/ve-backend`. If a change can't be done in these layers, change the library itself (see `docs/maintaining.md`) and release a version.

## Before you design: read the brand

1. Find the site's design tokens (often `:root` in a global CSS file, `tailwind.config`, `DESIGN.md`, or a theme file). Reuse the site's colors and fonts rather than inventing new ones.
2. Look at existing buttons, headings and cards on the home page. The store should look like the same site, not a plugin.
3. Note the header height (for `--ve-sticky-top`) and page width/gutters (`--ve-max`, `--ve-gutter`).

## Layer 1: theme tokens

```json
"theme": {
  "colors": {
    "background": "#FFF7DB", "surface": "#FFFFFF", "text": "#7A3446", "muted": "#8B5A66",
    "heading": "#BF5E73", "accent": "#7A3446", "accentText": "#FFF7DB", "accentHover": "#BF5E73",
    "badge": "#7A3446", "badgeText": "#FFF7DB", "sale": "#A12620", "border": "#E8C9CF", "focus": "#7A3446"
  },
  "fonts": { "display": "\"Higuen\", Georgia, serif", "body": "\"CDA Independence Text\", sans-serif", "accent": "\"Old Standard TT\", Georgia, serif" },
  "fontFaces": [{ "family": "Higuen", "src": "/assets/fonts/higuen-regular.woff2", "weight": 400, "style": "normal" }],
  "radius": "18px",
  "card": "arch",
  "button": "pill",
  "imageFit": "contain",
  "imageScale": 0.76,
  "tints": { "butter": "#FCF7B1", "blush": "#FCDCDA", "sage": "#C3D9BC" },
  "motion": true
}
```

| Token | Choices | Effect |
|---|---|---|
| `card` | `arch` / `rounded` / `flat` | arch: semicircle photo frame with a tilted badge; rounded: bordered card that lifts on hover; flat: square photo, minimal |
| `button` | `pill` / `rounded` / `square` | button corner radius |
| `imageFit` | `contain` / `cover` | `contain` for cut-out product art on a tint; `cover` for full-bleed photos |
| `imageScale` | 0.3 to 1 | how much of the frame a `contain` image fills |
| `tints` | any names → colors | per-product background behind the photo; pick with `product.tint` |
| `motion` | `true` / `false` | scroll reveal, badge bob, hover lift |

Contrast: `text` on `background`, `accentText` on `accent` and `badgeText` on `badge` must each be at least 4.5:1. Check before shipping.

## Layer 2: CSS

The theme becomes CSS variables on `:root`. Override them in site CSS for scoped variations:

```css
/* Site-wide fit */
:root {
  --ve-sticky-top: calc(var(--header-h, 4.5rem) + 1.5rem); /* product page buy box sticks below the header */
  --ve-max: 76rem;
  --ve-gutter: clamp(1.25rem, 4vw, 3rem);
}

/* A darker store section without touching the catalog */
.holiday-shop { --ve-background: #2b1a20; --ve-text: #fff3e8; --ve-heading: #ffd6a5; --ve-accent: #ffd6a5; --ve-accent-text: #2b1a20; }
```

Variables: `--ve-background --ve-surface --ve-text --ve-muted --ve-heading --ve-accent --ve-accent-text --ve-accent-hover --ve-badge --ve-badge-text --ve-sale --ve-border --ve-focus --ve-font-display --ve-font-body --ve-font-accent --ve-tint-<name> --ve-radius --ve-button-radius --ve-image-fit --ve-image-scale --ve-gap --ve-ease --ve-sticky-top --ve-max --ve-gutter --ve-columns`.

Main classes to target:

```text
Card:      .ve-card .ve-card--{arch|rounded|flat} .ve-card-media .ve-visual .ve-badge .ve-card-body
           .ve-card-title .ve-card-meta .ve-price .ve-price-now .ve-price-was .ve-offer .ve-card-each
           .ve-placeholder .ve-card-actions .ve-button .ve-button--ghost
Grid:      .ve-grid (uses --ve-columns)  .ve-section .ve-section-head .ve-tabs .ve-eyebrow
Product:   .ve-product .ve-detail .ve-gallery .ve-thumbs .ve-buycol .ve-title .ve-tagline .ve-price--lg
           .ve-buybox .ve-options .ve-option .ve-stepper .ve-buy-actions .ve-features .ve-faq .ve-related .ve-stickybar
Cart:      .ve-cart-layout .ve-lines .ve-line .ve-line-controls .ve-remove .ve-summary .ve-totals .ve-total-row
Checkout:  .ve-form .ve-group .ve-field .ve-input .ve-error .ve-pos .ve-confirm .ve-order-number
Header:    .ve-cart-button .ve-cart-label .ve-cart-count
States:    .is-added (button just added)  .ve-will-reveal / .is-in (scroll reveal)  [aria-invalid="true"] (field error)
```

Recipes:

```css
/* Bigger, editorial product titles in the brand display font */
.ve-card-title { font-size: clamp(1.6rem, 2.4vw, 2rem); letter-spacing: -0.01em; }

/* Two columns of cards on a narrow section */
.featured .ve-grid { --ve-columns: 2; }

/* Photo zooms and tilts on hover; respects reduced motion */
@media (prefers-reduced-motion: no-preference) {
  .ve-card img { transition: transform .8s var(--ve-ease); }
  .ve-card:hover img { transform: scale(1.06) rotate(-2deg); }
}

/* Glassy sale badge */
.ve-badge { background: color-mix(in srgb, var(--ve-badge) 80%, transparent); backdrop-filter: blur(8px); }

/* Hide the "per bouquet" line on the home page only */
.home .ve-card-each { display: none; }
```

Component options also change output without CSS (Astro props / React props / render options):

| Option | On | Effect |
|---|---|---|
| `cardStyle` | cards, grids, product page | override `theme.card` for this instance |
| `columns` | grids | sets `--ve-columns` |
| `category` / `slugs` / `featured` / `limit` | grids | which products |
| `headingLevel` | cards, grids | `h2`–`h4` for correct document outline |
| `buyNow` | cards | force the POS "Buy now" button on/off |
| `reveal` | cards, grids | `false` disables the built-in scroll reveal (use when the site has its own motion) |
| `countUp` | cards, grids | price animates up from 0 when it scrolls into view |
| `className` / `gridAttrs` | cards, grids | add your own class or attributes (e.g. `{ "data-stagger": true }` to plug into site motion) |
| `faqs` | product page | extra `{ q, a }` questions above the built-in disclaimer FAQ |
| `crumbs` | product page | `false` hides breadcrumbs |

### Using the site's own animation library

If the site already animates sections (Motion/Framer Motion, GSAP, AOS), pass `reveal={false}` and tag the grid with the site's own attribute via `gridAttrs`, so there is one motion system, not two:

```astro
<ProductGrid catalog={raw} category="bouquets" reveal={false} gridAttrs={{ "data-stagger": true }} />
```

## Layer 3: custom markup

Build your own card or page when the design needs a structure the defaults can't produce (e.g. a horizontal "story" card, a carousel, a comparison table with buy buttons). Read product data from the validated catalog, and put the behavior hooks on your elements.

Astro example: a fully custom card that still adds to cart and links to the POS.

```astro
---
import { ensureCatalog, formatMoney, productUrl } from "ve-backend/astro";
import raw from "../data/ve.catalog.json";
const catalog = ensureCatalog(raw);
const { slug } = Astro.props;
const p = catalog.products.find((x) => x.slug === slug)!;
const pos = p.posUrl || catalog.checkout.posUrl;
const mode = p.checkout || catalog.checkout.mode;
---
<article class="story-card" data-ve-card={p.slug}>
  <img src={p.images[0]?.src} alt={p.images[0]?.alt ?? ""} />
  <h3><a href={productUrl(catalog, p)}>{p.name}</a></h3>
  <p class="price" data-ve-price>{formatMoney(catalog, p.price)}</p>
  {mode !== "demo" && pos && <a class="btn" href={pos} data-ve-pos={p.slug}>Buy now</a>}
  {p.options?.length
    ? <a class="btn ghost" href={productUrl(catalog, p)}>Choose options</a>
    : <button type="button" class="btn ghost" data-ve-add={p.slug}><span data-ve-label>Add to cart</span></button>}
  {p.placeholder && <p class="note">Placeholder price, to be confirmed</p>}
</article>
```

Requirements for custom markup:

- `<VeHead catalog={raw} />` (or the React/HTML equivalent) is on the page.
- Hooks from `docs/contract.md` are present and spelled exactly.
- Text comes from the catalog, never typed in.
- Run the verification checklist in `AGENTS.md`.

React: use `loadCatalog`, `formatMoney`, `productUrl` from `ve-backend` and render the same attributes. Plain HTML: the custom elements accept the same hooks inside them.

Custom cart drawer: listen for `ve:cart` and render from `window.veCart.totals()`; call `window.veCart.setQuantity` / `remove`. Keep a link to the real `/cart/` and `/checkout/` pages for no-JS and accessibility.

## What not to do

- Don't copy library CSS into the site and edit it; override instead, or the site stops receiving fixes.
- Don't build a second cart in `localStorage`; use `window.veCart`.
- Don't hardcode the POS URL in markup; read `checkout.posUrl` / `product.posUrl`.
- Don't remove `[hidden]`, focus styles, or the reduced-motion rules.
- Don't remove the "educational store" disclaimer.
