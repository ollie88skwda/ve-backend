# ve-backend: agent guide

You are probably an AI coding agent asked to add a store to a Virtual Enterprise (VE) company website, or to restyle one. Read this file fully before editing. It tells you what you may change freely, what you must keep, and how to verify.

## What this package is

- One JSON catalog (`ve.catalog.json`) drives product cards, category pages, product pages, a cart, and checkout.
- Checkout is either an educational demo form (`demo`), a link to the company's VE Trade Show POS (`pos`), or both.
- A local sales editor (`npx ve-backend editor`) lets humans edit the catalog with a live preview. The hosted editor (`ve-backend/hosted`, `docs/hosted.md`) serves the same editor from the live site on Vercel; the site overlays the saved catalog at runtime.
- The catalog's `content` blocks make any page copy (hero slogan, banners, button labels) editable by admins in the editor's **Site content** tab. Agents decide which fields exist; admins change the values.
- Source is plain ESM JavaScript + CSS with no build step. Astro components, React wrappers and plain-HTML custom elements all render the same HTML from `src/render.js`.

## Read next (in order, only what the task needs)

1. `docs/contract.md`: the functional contract. The `data-ve-*` hooks, element names, events and catalog fields you must not break.
2. `docs/customizing.md`: the three layers of customization and recipes for making the store look like the brand.
3. `docs/integrate.md`: adding ve-backend to an Astro, Next/React or plain HTML site.
4. `docs/content.md`: making any page section (hero slogan, banners, button text) editable by admins.
5. `docs/catalog.md`: every catalog field, with validation rules.
6. `docs/editor.md`: local sales editor, logins, passcodes.
7. `docs/hosted.md`: hosted editor on Vercel so the live site can be edited online (users, Blob, routes, live overlay, what needs a rebuild).
8. `docs/troubleshooting.md`: stable error codes and fixes.
9. `docs/maintaining.md`: only if you are changing this library itself (releases, tests).

## Golden rules

1. **Data goes in the catalog, not in markup.** Never hardcode a product name, price, image or POS link in a page. Add it to `ve.catalog.json` (or tell the human to use the editor) and render it with a component.
2. **Style from the outside.** Change the look with theme tokens, then `--ve-*` CSS variables, then site CSS targeting `.ve-*` classes. Do not edit files inside `node_modules/ve-backend`; they are overwritten on `npm update`.
3. **Keep every `data-ve-*` attribute and custom element** the runtime relies on (list in `docs/contract.md`). Classes are for styling; `data-ve-*` attributes are for behavior. Removing one silently breaks add to cart, quantity, options, checkout or the cart count.
4. **If you build fully custom markup**, copy the hook attributes onto your elements exactly (recipe in `docs/customizing.md`, "Layer 3"). Then run the verification checklist below.
5. **Never invent facts.** Unknown prices get `"placeholder": true` and an obvious number; unknown contact details stay empty. List them for the human.
6. **Keep the educational disclaimer.** VE stores are not real shops. Do not remove `checkout.note` text or the demo checkout's "no real payment" messaging.
7. **Secrets never go in chat, git or logs.** `.env.ve-backend.local` and `~/.config/ve-backend/` are private.
8. **Respect reduced motion.** Any animation you add must stop under `prefers-reduced-motion: reduce`.

## Fast paths

| Task | Do this |
|---|---|
| Add store to an Astro site | `npm install github:ollie88skwda/ve-backend#semver:^0.3.0` → `npx ve-backend init --astro` → edit catalog → `npx ve-backend validate` |
| Add/edit a product | Edit `src/data/ve.catalog.json` (or `npm run editor`), then `npx ve-backend validate` |
| Make cards match the brand | Set `theme` in the catalog (colors, fonts, `card`, `button`, `tints`), then fine-tune in site CSS. See `docs/customizing.md` |
| "Make the hero/banner/text editable in ve-backend" | Add a block to `content` in the catalog, read it with `getContent()` in the component. See `docs/content.md` |
| Show products on the home page | `<VeHead catalog={raw} />` once per page, then `<ProductGrid catalog={raw} category="…" />` |
| Send buyers to the VE POS | `checkout.mode: "pos"` and `checkout.posUrl: "https://portal.veinternational.org/tradeshowpos/…/newsale/"` |
| "The live site should be editable online" | Follow `docs/hosted.md`: `ve-backend/hosted` handlers + Blob store + `ve-backend hosted-user add`; read the live catalog with `useLiveCatalog` / `<VeHead live />`. New slugs still need a rebuild |
| Update the library in a site | `npm update ve-backend` then rebuild and rerun the checklist |

## Verification checklist (run before saying you're done)

1. `npx ve-backend validate` passes and lists placeholder prices to report.
2. The site builds (`npm run build` or `astro build`) with no `VE_*` errors.
3. In a browser at 390px and 1440px wide, with the console open and no errors:
   - The shop page, one category page and one product page render.
   - "Add to cart" on a card changes the header cart count.
   - On a product page, changing an option updates the price, the quantity stepper works, and adding goes to the cart.
   - `/cart/` shows the line; plus/minus/remove work; totals update.
   - Demo checkout: submit empty shows field errors; valid test data shows "Demo order placed" with an order number.
   - POS checkout: the button links to the configured POS URL.
4. No horizontal scrolling at 390px.
5. With reduced motion turned on, nothing animates and everything is visible.

## Repo map

```text
src/core.js        catalog validation, defaults, cart math, checkout validation, themeCss()  (pure, no DOM)
src/render.js      HTML string renderers for every component (shared by Astro, React, runtime)
src/runtime.js     browser runtime: cart in localStorage, custom elements, click/submit handlers
src/styles.css     default store styles, all values from --ve-* variables
astro/             Astro components, ensureCatalog(), integration that injects shop routes
react/             thin React wrappers around render.js
editor/            sales editor server (node:http) + UI in editor/public/
hosted/            hosted editor: Web-standard handlers, auth, storage adapters (ve-backend/hosted)
src/live.js        runtime fetch of the hosted public catalog (ve-backend/live)
bin/ve-backend.mjs CLI: init, editor, validate, admin, hosted-user
templates/         files `init` copies into a site
examples/          demo Astro site and a plain HTML page
types/             .d.ts for every entry point
test/              node:test suites (npm test)
docs/              everything linked above
```

Store UI and sales editor adapted from Hangr, a VE company store.
