# Troubleshooting and error codes

Every thrown error and CLI failure carries a stable `VE_*` code. Search for the code here first.

| Code | Where | Meaning | Fix |
|---|---|---|---|
| `VE_CATALOG_INVALID` | build, runtime, `validate` | catalog failed validation; message lists `path: problem` | fix each path in the JSON or in the editor; rerun `npx ve-backend validate` |
| `VE_CATALOG_FILE_MISSING` | CLI, Astro integration | catalog file not found | check `--catalog` / `package.json` `"ve-backend".catalog`; run `npx ve-backend init` |
| `VE_CATALOG_PROP_MISSING` | Astro components | a component was rendered without `catalog={…}` | pass the imported JSON to every ve-backend component |
| `VE_CATALOG_MISSING` | browser runtime | no `<script data-ve-catalog>` and no `<meta name="ve-catalog">` on the page | add `<VeHead catalog={raw} />` / `<VeProvider>` / the meta tag |
| `VE_CATALOG_PARSE` | browser runtime | data island isn't valid JSON | don't hand-write the island; render it with `VeHead` |
| `VE_CATALOG_FETCH` | browser runtime (plain HTML) | `<meta name="ve-catalog">` URL didn't load | check the path is served (it must be public) |
| `VE_PRODUCT_NOT_FOUND` | Astro `ProductCard` / pages | slug isn't in the catalog or is hidden | check spelling and `visible` |
| `VE_EDITOR_NO_PASSCODE` | editor | no team passcode and no admin logins | run `npx ve-backend init` (creates `.env.ve-backend.local`) or `ve-backend admin set <name>` |
| `VE_EDITOR_NO_CATALOG` | editor | catalog file missing | as `VE_CATALOG_FILE_MISSING` |
| `VE_EDITOR_START_FAILED` | editor | server setup threw; cause attached | read the cause line; usually a bad path option |
| `VE_EDITOR_LISTEN_FAILED` | editor | port busy or host not allowed | use another `--port`, or stop the other editor for this site |
| `VE_EDITOR_REQUEST_FAILED` | editor log | an API request crashed; the browser shows a generic error | read the logged cause; retry is safe for reads, check the file before retrying saves |
| `VE_ADMIN_NO_USERNAME` | `admin set/remove` | missing username | `ve-backend admin set <username>` |
| `VE_ADMIN_BAD_USERNAME` | `admin set` | username has disallowed characters | 2–40 of `a-z 0-9 . _ -` |
| `VE_ADMIN_NO_PASSWORD` | `admin set` | nothing on stdin and no `VE_ADMIN_PASSWORD` | pipe the password in |
| `VE_ADMIN_WEAK_PASSWORD` | `admin set` | under 10 characters | use a longer password |
| `VE_ADMIN_SAVE_FAILED` | `admin set` | couldn't write the admins file | check permissions on `~/.config/ve-backend/` or `VE_ADMINS_FILE` |
| `VE_ADMIN_BAD_COMMAND` | `admin` | unknown subcommand | `set`, `list` or `remove` |

## Symptoms without an error

| Symptom | Likely cause | Fix |
|---|---|---|
| "Add to cart" does nothing | runtime not loaded on that page, or `data-ve-add` missing/misspelled | add `VeHead`; compare markup with `docs/contract.md` |
| Cart count never changes | header button lacks `<ve-cart-button>` / `data-ve-count` | use `<CartButton>` |
| Product page price doesn't change with options | radio `value` doesn't equal the choice `label`, or `data-ve-price` removed | keep values from the catalog; keep the price element |
| Quantity buttons inverted | the `data-ve-step` buttons are out of order | minus (`-1`) first, plus (`1`) second |
| Buy box hides under the header | sticky header taller than `--ve-sticky-top` | set `--ve-sticky-top` in site CSS |
| Cards invisible until scrolled, or stuck invisible | site CSS overrides `.ve-will-reveal` or `opacity` | pass `reveal={false}` or remove the override |
| Two animations fight on the same cards | site motion plus built-in reveal | `reveal={false}` and use the site's system |
| Fonts fall back to serif | `fontFaces[].src` path wrong, or font not in `public/` | fix the path; check the network tab |
| Cart empty on another subdomain or port | `localStorage` is per origin | expected; use one origin |
| Build fails after `npm update` | catalog rule tightened or API changed | read the error codes; check the release notes on GitHub |
