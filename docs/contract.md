# Functional contract

Everything visual in ve-backend is replaceable. These pieces are **behavior** and must survive any redesign. If markup you ship is missing one of them, the matching feature silently stops working.

## 1. Page-level requirements

| Requirement | Why | How |
|---|---|---|
| Catalog data island, once per page that shows store UI | The runtime reads products, prices and checkout mode from it | Astro: `<VeHead catalog={raw} />`. React: `<VeProvider catalog={catalog}>`. Plain HTML: `<meta name="ve-catalog" content="/ve.catalog.json">` |
| Runtime script, once per page | Cart, buttons, forms, custom elements | Included by `VeHead` / `VeProvider`; plain HTML: `<script type="module" src=".../src/runtime.js">` |
| `ve-backend/styles.css` (or your full replacement) | Default layout and states such as `[hidden]`, `.is-added`, `.is-in` | Included by `VeHead`; React/HTML import it yourself |

The data island is `<script type="application/json" data-ve-catalog>`. It contains only public data (`publicCatalog()`): no passcodes, no hidden products.

## 2. Custom elements

The runtime defines these. Keep the tag if you keep the feature.

| Element | Feature | Notes |
|---|---|---|
| `<ve-cart-button>` | Live cart count in the header | Wraps an `<a data-ve-cart-link>` with a `[data-ve-count]` child |
| `<ve-cart>` | Cart page | Renders lines from `localStorage`; you style it, don't re-implement it |
| `<ve-checkout>` | Checkout page (demo form, POS handoff or both) | Fires `ve:order` on success |
| `<ve-product-card slug="…">` | Client-rendered card (plain HTML sites) | Astro/React render the same HTML at build time instead |
| `<ve-product-grid category="…">` | Client-rendered grid | Same |
| `<ve-product-page slug="…">` | Client-rendered product page | Same |

## 3. Behavior hooks (`data-ve-*`)

Classes (`.ve-*`) are only for styling and may be renamed or replaced. These attributes are how the runtime finds things. **Copy them exactly into any custom markup.**

### Product card

| Attribute | Element | Required for |
|---|---|---|
| `data-ve-card="<slug>"` | card root | analytics/targeting, editor preview |
| `data-ve-add="<slug>"` | `<button type="button">` | one-click add to cart (products **without** options) |
| `data-ve-label` | `<span>` inside the add button | button text flips to "Added" briefly |
| `data-ve-pos="<slug>"` | `<a href="<posUrl>">` | direct "Buy now" to the VE Trade Show POS |
| `data-ve-price` | element holding the price text | live price updates and count-up |
| `data-ve-reveal` | card root (optional) | scroll-in animation; omit to disable per card |

Products with options must link to their product page ("Choose options") instead of using `data-ve-add`, because the add button adds the default selection.

### Product page buy box

| Attribute | Element | Required for |
|---|---|---|
| `data-ve-product="<slug>"` | page root | scoping price updates and the sticky bar |
| `data-ve-product-form="<slug>"` | `<form novalidate>` | add to cart with options and quantity (form submit) |
| `data-ve-option="<option name>"` | `<input type="radio" name="…" value="<choice label>">` | option selection; `value` must equal a choice `label` from the catalog |
| `data-ve-stepper` | quantity wrapper | quantity control |
| `data-ve-step="-1"` / `data-ve-step="1"` | the minus / plus `<button type="button">`, **in that order** | quantity change; runtime disables them at 1 and 10 |
| `data-ve-qty` | `<output>` or `<span>` showing the number | quantity display |
| `data-ve-submit` | wrapper around the submit button | sticky bar shows when this scrolls away |
| `data-ve-status` | `<p role="status" aria-live="polite">` | "Added to cart" message for screen readers |
| `data-ve-thumb="<index>"` + `data-src` + `data-alt` | gallery thumbnail buttons | swapping the main photo |
| `data-ve-stickybar` / `data-ve-sticky-add="<slug>"` | sticky add bar and its button (optional) | mobile sticky add |

### Cart and checkout (rendered by the runtime inside `<ve-cart>` / `<ve-checkout>`)

| Attribute | Purpose |
|---|---|
| `data-ve-line="<line id>"` | one cart line; line id = slug plus encoded options |
| `data-ve-step` inside a line | quantity change for that line |
| `data-ve-remove="<line id>"` | remove line |
| `data-ve-checkout-form` | demo checkout form; fields named `name email address city region postal card expiry cvc` |
| `data-ve-pos-checkout` | POS handoff block |

You normally restyle these with CSS rather than replacing them. If you must replace the cart or checkout markup, render from `window.veCart` (below) and keep these attributes.

## 4. JavaScript API

```js
window.veCart.lines             // [{ id, slug, quantity, options }]
window.veCart.totals()          // { items: [{ id, slug, product, quantity, options, unitPrice, lineTotal, lineSavings }], count, subtotal, savings, total, hasPlaceholder }
window.veCart.add(slug, qty, options)   // options = { "Scent": "Lavender" }
window.veCart.setQuantity(lineId, qty)  // clamps 1..10
window.veCart.remove(lineId)
window.veCart.clear()
```

Events on `document`:

| Event | `detail` | When |
|---|---|---|
| `ve:cart` | `totals()` | any cart change, including from another tab |
| `ve:order` (bubbles from `<ve-checkout>`) | `{ number, name, items, total }` | demo order placed |

Use these to drive custom UI (a cart drawer, a confetti burst, an analytics ping) instead of reading `localStorage` directly. Storage key: `ve-cart-v1:<company-slug>`; treat it as private.

## 5. Catalog invariants

- `slug` values are unique across products **and** categories, lowercase, dash-separated. They are URLs.
- Prices are numbers with at most 2 decimals. `compareAt` must be higher than `price`.
- `checkout.mode` is `demo`, `pos` or `both`; `pos`/`both` require `checkout.posUrl` (https).
- `placeholder: true` marks an unconfirmed price; the card shows "Placeholder price, to be confirmed". Remove the flag only when a human confirms the price.
- `checkout.note` keeps the educational disclaimer.
- `content` block and field `id`s are read by page code; never rename or remove one without updating the component that reads it.

## 6. Accessibility invariants

Keep these when restyling: visible focus outlines (`--ve-focus`), 44px minimum hit areas on buttons, `aria-live` status messages, real `<button>`/`<a>` elements (not clickable `<div>`s), alt text from `images[].alt`, and no motion under `prefers-reduced-motion: reduce`.
