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
| `VE_ADMIN_BAD_COMMAND` | `admin`, `hosted-user` | unknown subcommand | `set`/`add`, `list` or `remove` |
| `VE_HOSTED_NO_STORAGE` | `createHostedEditor` | no `storage` adapter passed | pass `vercelBlobStorage({ prefix })` |
| `VE_HOSTED_NO_SEED` | `createHostedEditor` | no `seed` catalog passed | import `ve.catalog.json` and pass it as `seed` |
| `VE_HOSTED_NO_BLOB_PACKAGE` | hosted storage | `@vercel/blob` isn't installed | `npm i @vercel/blob` |
| `VE_HOSTED_NO_SESSION_SECRET` | hosted editor (HTTP 500) | `VE_SESSION_SECRET` missing or under 32 characters | set it (`openssl rand -base64 48`), redeploy |
| `VE_HOSTED_NO_USERS` | hosted editor (HTTP 500) | `VE_ADMIN_USERS` missing or not a JSON object | `ve-backend hosted-user add <name>`, set the printed value, redeploy |
| `VE_HOSTED_CSRF` | hosted editor (403) | write without same-origin `Origin` + `X-Requested-With: ve-editor` | use the editor UI from the same host; check a proxy isn't changing `Host`/`Origin` |
| `VE_HOSTED_BAD_LOGIN` | hosted editor (401) | wrong username or password | retry; reset with `hosted-user add` and redeploy |
| `VE_HOSTED_RATE_LIMITED` | hosted editor (429) | too many failed sign-ins | wait `Retry-After` seconds (max 15 min) |
| `VE_HOSTED_HANDLER_FAILED` | hosted editor (500) | storage or handler crashed; the log line has the cause | check `BLOB_READ_WRITE_TOKEN`, store linked to the project, prefix; reads are safe to retry, check the editor before retrying a save |
| `VE_HOSTED_STORED_INVALID` | public catalog (503) | the saved catalog no longer validates (library upgraded stricter) | sign in, fix the listed fields, save |
| `VE_HOSTED_MEDIA_FAILED` | media route (404) | photo read failed | check the prefix matches the one the upload used |
| `VE_HOSTED_USER_UNKNOWN` | `hosted-user remove` | the name isn't in the current value | `hosted-user list` against the current `VE_ADMIN_USERS` |

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
| Hosted site shows old text after a save | page is cached, or the text is baked into static HTML | hard reload; the page must read the live catalog (`docs/hosted.md`); SEO tags need a rebuild |
| Hosted editor says "not set up yet" | missing env vars | read the `VE_HOSTED_*` code in the function log |
