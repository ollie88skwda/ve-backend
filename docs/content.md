# Editable site content

Make any part of a site (hero slogan, seasonal banner, button labels, an "about" blurb, a promo image) editable by the company's admins in the sales editor's **Site content** tab, without touching code.

How the work splits:

| Who | Does what | Where |
|---|---|---|
| Agent / developer | decides **which** blocks and fields exist, their labels, limits and help text, and renders them in the page | `content` in `ve.catalog.json` and the page component |
| Admins | change the **values** (text, links, images, on/off) and save | sales editor → **Site content** |

Admins can't add or remove fields, so the page layout stays exactly as coded.

## When a human asks "make X editable in ve-backend"

1. Find the section's component and every piece of hardcoded copy, links, images and on/off parts in it.
2. Add one block for the section to `content` in the catalog. Use the current text as the starting `value`s so nothing visibly changes.
3. In the component, read the block with `getContent(catalog, "<blockId>", fallbacks)`, using the same current text as fallbacks.
4. Replace the hardcoded copy with the values. Keep classes, structure and animation hooks untouched.
5. Run `npx ve-backend validate`, check the page renders the same, then change one value in the editor (or the JSON), confirm the page updates, and change it back.
6. Tell the human the block name to look for under **Site content**.

## Block format

```json
"content": [
  {
    "id": "hero",
    "label": "Home page hero",
    "help": "The first thing visitors see. Change the slogan for each season or campaign.",
    "fields": [
      { "id": "tagline", "label": "Slogan", "type": "text", "max": 40, "required": true, "help": "Short and bold.", "value": "Always in bloom" },
      { "id": "pitch", "label": "One-line pitch", "type": "textarea", "max": 120, "required": true, "value": "Lifelike flowers with a hidden, refillable scent pod." },
      { "id": "primaryLabel", "label": "Main button text", "type": "text", "max": 28, "required": true, "value": "Shop fall bundles" },
      { "id": "primaryHref", "label": "Main button link", "type": "link", "required": true, "value": "#bundles" },
      { "id": "art", "label": "Hero picture", "type": "image", "value": "/assets/hero.webp", "alt": "A bouquet on a table" },
      { "id": "showPrice", "label": "Show “Bundles from” price", "type": "toggle", "value": true }
    ]
  }
]
```

| Key | Rules |
|---|---|
| block `id` | unique, starts with a letter, letters/numbers/`-`/`_`, ≤40. It's what code reads, so **never rename it** after shipping |
| block `label`, `help` | what admins see (≤60, ≤240). Plain language: say where on the site it shows |
| field `id` | unique within the block, same characters as block id. Becomes the property name in code |
| field `label`, `help` | what admins see. Put examples and length guidance in `help` |
| `type` | `text` (one line), `textarea` (multi-line), `link`, `image`, `toggle`. Default `text` |
| `max` | character limit for `text`/`textarea` (default 140 / 1000, up to 5000). **Set it from the design**: the longest text that still fits the layout at 390px wide |
| `required` | empty value is rejected on save |
| `value` | the current content. `toggle` is `true`/`false` |
| `alt` | `image` only: description for screen readers, editable by admins |

Validation (same in build, editor and `validate`):

- `text` can't contain line breaks.
- `link` must be a site path (`/shop/`), an in-page section (`#bundles`), a `mailto:` address or an `https://` URL. `javascript:`, `data:` and `http:` are rejected.
- `image` must be a site path or an `https://` URL.
- Errors are keyed like `content.0.fields.2.value` and shown next to the field in the editor.

Limits: 40 blocks, 40 fields per block.

## Reading content in code

`getContent(catalog, blockId, fallbacks)` returns `{ fieldId: value }`. Image fields also give `<fieldId>Alt`. Empty optional text falls back to your fallback, so a cleared field never leaves a blank gap. Toggles always use the saved value.

Astro:

```astro
---
import { getContent } from "ve-backend";
import { catalog } from "../data/bundles";            // loadCatalog(raw), validated once

const hero = getContent(catalog, "hero", {
  tagline: "Always in bloom",                          // same text as the catalog's starting value
  pitch: "Lifelike flowers with a hidden, refillable scent pod.",
  primaryLabel: "Shop fall bundles",
  primaryHref: "#bundles",
  showPrice: true,
});
---
<p class="hero-tagline">{hero.tagline}</p>
<p class="hero-what">{hero.pitch}</p>
<a class="button" href={hero.primaryHref}>{hero.primaryLabel}</a>
{hero.showPrice && <p class="hero-price">Bundles from $309.99</p>}
```

React / Next.js: same call on the validated catalog (`import { getContent } from "ve-backend"`).

Plain HTML: the runtime puts `content` into the page's catalog data. Read it after load:

```js
const data = JSON.parse(document.querySelector("script[data-ve-catalog]").textContent);
const hero = data.content.find((b) => b.id === "hero");
```

Rules for the component:

- Always pass fallbacks equal to the shipped copy. The page must render even if the block is deleted.
- Render values as text (`{hero.tagline}` in Astro/JSX escapes HTML). Never inject them as HTML (`set:html`, `dangerouslySetInnerHTML`, `innerHTML`).
- Keep one block per page section, named after the section (`hero`, `holidayBanner`, `aboutIntro`). Don't make a giant "home" block.
- Make things that change together editable together (a button's text and link). Leave structure, styling and motion in code.
- Content changes reach a static site on the next build. The dev server hot-reloads; a deployed static site needs a rebuild/redeploy after admins save.

## Seasonal and campaign copy

For copy that rotates (fall → holiday → spring), keep **one** block and let admins overwrite values each season. The editor keeps every saved version in `.ve-backend/history/`, and **Undo last save** restores the previous one.

If the site needs scheduled changes (switch on a date by itself), that's a code feature, not content: add a `toggle` field like `showHolidayBanner` and explain the manual switch to the human, or ask before building date-based logic.

## Checklist before saying "it's editable"

1. `npx ve-backend validate` passes.
2. The page looks identical before any edit.
3. Changing each field in the editor and saving updates the page; clearing optional fields falls back cleanly.
4. The longest allowed text (`max`) doesn't break the layout at 390px and 1440px.
5. You told the human which block to edit under **Site content**.
