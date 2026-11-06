# Catalog reference (`ve.catalog.json`)

One file is the source of truth for the store. It's validated by `validateCatalog()` at build time, in the editor on every save, and by `npx ve-backend validate`. Errors are keyed by path (for example `products.2.price`).

Default location: `src/data/ve.catalog.json`. Override with `--catalog`, or `"ve-backend": { "catalog": "…" }` in the site's `package.json`.

## Top level

```json
{
  "version": 1,
  "company": {},
  "shop": {},
  "announcement": {},
  "contact": {},
  "checkout": {},
  "theme": {},
  "categories": [],
  "products": []
}
```

## `company`

| Field | Rules | Use |
|---|---|---|
| `name` | required, ≤80 | page titles, cart storage key, schema.org brand |
| `tagline` | ≤140 | optional display |
| `currency` | 3 letters, default `USD` | price formatting |
| `locale` | default `en-US` | price formatting |
| `url` | https | absolute image URLs in product structured data |

## `shop`

| Field | Rules | Default |
|---|---|---|
| `title` | ≤60 | `Shop` |
| `intro` | ≤300 | |
| `basePath` | `/like/this/` | `/shop/` |
| `cartPath` | `/like/this/` | `/cart/` |
| `checkoutPath` | `/like/this/` | `/checkout/` |
| `allLabel` | ≤40 | `All products` (first category tab) |

## `checkout`

| Field | Rules | Use |
|---|---|---|
| `mode` | `demo` / `pos` / `both` | `demo`: educational checkout form + order confirmation. `pos`: hand off to the VE Trade Show POS. `both`: POS first, demo form below |
| `posUrl` | https, required unless `demo` | the company's VE Trade Show POS **new sale** link, e.g. `https://portal.veinternational.org/tradeshowpos/<id>/newsale/` |
| `posLabel` | ≤40 | POS button text |
| `orderPrefix` | 1–6 letters/numbers | demo order numbers like `EB-7K2M9Q` |
| `note` | ≤240 | educational disclaimer shown in the buy box and checkout. Keep it |

Per-product `checkout` and `posUrl` override these (e.g. bundles go to POS, everything else uses the demo).

## `announcement` and `contact`

`announcement`: `enabled`, `text` (≤140, required if enabled), `linkLabel` (≤30), `link` (https or `/path`). Exposed for the site to render.
`contact`: `email` (valid address), `phone` (≤30), `location`, `hours`, `instagram` (https). The email shows under the product buy box.

## `categories[]` (up to 20)

| Field | Rules |
|---|---|
| `slug` | lowercase-dashes, unique across categories **and** products; becomes `/shop/<slug>/` |
| `name` | required, ≤40 (tab and breadcrumb label) |
| `eyebrow` | ≤60, small italic line above the heading |
| `title` | ≤80, heading on the category page (falls back to `name`) |
| `description` | ≤400 |
| `note` | ≤240, small print under the grid |
| `image` | `/path` or https; header art for the category page |
| `tint` | a `theme.tints` name |
| `visible` | `false` hides the category and its tab |

## `products[]` (up to 200)

| Field | Rules | Notes |
|---|---|---|
| `slug` | lowercase-dashes, unique | `/shop/<slug>/`; generated from `name` if empty |
| `name` | required, ≤80 | |
| `category` | an existing category slug | |
| `price` | number ≥0, ≤2 decimals | |
| `compareAt` | > `price` | shown crossed out; enables "save" amounts |
| `badge` | ≤24 | e.g. `Best value` (pill on the photo) |
| `offer` | ≤30 | e.g. `25% off` (beside the price) |
| `tagline` | ≤140 | one line on the card |
| `description` | ≤1200 | blank lines make paragraphs |
| `images[]` | ≤8 of `{ src, alt }`; `src` is `/path` or https; `alt` ≤160 | first image is the card photo |
| `tint` | a `theme.tints` name | background behind the photo |
| `features[]` | ≤12 strings, ≤120 each | "Highlights" checklist |
| `options[]` | ≤4 of `{ name, values: [{ label, priceDelta }] }`, ≤20 values | e.g. Scent, Size. `priceDelta` may be negative. First value is the default |
| `bundle` | `{ count: 1..1000, unit }` | shows "7 bouquets" and "$44.28 per bouquet" |
| `checkout` | `""` / `demo` / `pos` / `both` | per-product override |
| `posUrl` | https | per-product POS link |
| `featured` | boolean | for `featured` grids |
| `visible` | boolean, default `true` | `false` hides it everywhere |
| `placeholder` | boolean | price not confirmed; flagged on the card, in the editor and by `validate` |

## `theme`

See `docs/customizing.md`. Fields: `colors{background surface text muted heading accent accentText accentHover badge badgeText sale border focus}` (hex), `fonts{display body accent}` (CSS font lists), `fontFaces[{family src weight style}]`, `radius` (`16px`), `card` (`arch|rounded|flat`), `button` (`pill|rounded|square`), `imageFit` (`contain|cover`), `imageScale` (0.3–1), `tints{name: hex}`, `motion` (boolean).

## Example product

```json
{
  "slug": "medium-fall-bundle",
  "name": "Medium Fall Bundle",
  "category": "bouquets",
  "price": 459.99,
  "badge": "Best value",
  "offer": "25% off",
  "tagline": "Keep some, gift the rest",
  "description": "Fourteen lifelike fall bouquets, each with a hidden, refillable scent pod.",
  "images": [{ "src": "/assets/img/bouquets.webp", "alt": "A blush peony and rose bouquet tied with a ribbon" }],
  "tint": "blush",
  "bundle": { "count": 14, "unit": "bouquets" },
  "checkout": "pos",
  "featured": true,
  "visible": true
}
```

## Editing safely as an agent

- Edit the JSON directly, then run `npx ve-backend validate`; fix every reported path.
- Keep slugs stable once published (they are URLs). To rename, change `name` only.
- Don't remove `placeholder: true` unless a human gave you the real price.
- If the editor is running, it may be writing the same file. Prefer the editor for human changes, and reload it after you edit the JSON by hand.
