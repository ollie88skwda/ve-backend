# Hosted editor (edit the live site online)

`ve-backend/hosted` serves the same sales editor UI and API as the local editor, from your site's own host, so the company team can change prices, copy and photos on the **live** site from a phone. It is a set of Web-standard `(Request) => Response` handlers, so it runs on Vercel Functions, Cloudflare Workers, Deno, Bun or Node 18+. The local editor (`npx ve-backend editor`) is unchanged.

## How it works

- Admins sign in at `/admin/` with a username and password (env-configured, hashed). Saves go to a storage adapter (Vercel Blob in production), not to git.
- The site fetches the saved catalog from `/api/catalog` (public, no private fields) **at runtime**, so saves appear on the next page load without a rebuild or redeploy.
- The build-time `ve.catalog.json` is the **seed** and the fallback: it is used until the first save, or if the live fetch fails.

## What updates live, and what needs a rebuild

| Edit in the hosted editor | Live without redeploy? |
|---|---|
| Content blocks (hero text, ribbon, buy link, images) read with `liveContent(live, id, fallback)` / `getContent(live \|\| catalog, …)` on the client | Yes, after the page loads (brief flash of build-time text on static pages; hide until `ve:live` if that matters) |
| Existing product name, price, tagline, badge, visibility, images, options | Yes where the page renders products on the client (`useLiveCatalog` + `mergeLiveProducts`, `<meta name="ve-live">`) |
| Cart/checkout prices (`<meta name="ve-live">`) | Yes |
| Text that is baked into static HTML (page `<title>`, SEO tags, JSON-LD, server-rendered markup you did not overlay) | No, until the next build |
| **New product or category slugs** on a static export | No page exists until a rebuild; `mergeLiveProducts` returns them as `added` so you can list them, but links to them 404 |
| Theme colors/fonts | Build time (`themeCss`) unless your code re-applies `themeCss(live.theme)` |
| Logo, fonts, code, layout | Rebuild |

Rule of thumb: **editing what exists is live; adding new pages needs a deploy.** After products are added in the editor, a developer copies the saved catalog back into the repo (sign in, then open `/api/admin/catalog` and take its `catalog` value, or use the editor's data), commits it as `ve.catalog.json` and redeploys, so the new pages exist.

## Setup on Vercel (agent steps)

1. Install: `npm i github:ollie88skwda/ve-backend#semver:^0.3.0 @vercel/blob`.
2. Create a **private** Blob store and link it to the project: `vercel blob create-store <name> --access private` (or Dashboard > Storage > Blob), connect it to the project. This sets `BLOB_READ_WRITE_TOKEN`. Use a distinct `prefix` per site/environment (below).
3. Create the first admin user and set the two env vars (Production, and Preview if you test there):

   ```sh
   read -rs PW && printf '%s' "$PW" | npx ve-backend hosted-user add oliver --out .ve-users.tmp && unset PW
   vercel env add VE_ADMIN_USERS production --sensitive < .ve-users.tmp && rm .ve-users.tmp
   openssl rand -base64 48 | vercel env add VE_SESSION_SECRET production --sensitive
   ```

   `hosted-user` prints or writes **hashes only**, never the password. Add more users the same way, starting from the current value (`VE_ADMIN_USERS` in the environment or `--users <file>`). `remove` and `list` work the same. Rotating `VE_SESSION_SECRET` signs everyone out; changing a user's hash signs that user out.
4. Add the routes. Vercel Functions (`api/` folder, any framework with `outputDirectory`/static export):

   ```js
   // lib/ve-hosted.mjs
   import { createHostedEditor, vercelBlobStorage } from "ve-backend/hosted";
   import seed from "../src/data/ve.catalog.json" with { type: "json" };
   export const ve = createHostedEditor({ storage: vercelBlobStorage({ prefix: "mysite/ve/" }), seed, siteUrl: "/" });
   ```

   ```js
   // api/admin/[...path].mjs   (login, logout, session, catalog, validate, undo and upload all live under /api/admin/*)
   import { ve } from "../../lib/ve-hosted.mjs";
   export const GET = (r) => ve.admin(r), POST = GET, PUT = GET;
   // api/catalog.mjs
   import { ve } from "../lib/ve-hosted.mjs";
   export const GET = (r) => ve.publicCatalog(r);
   // api/media/[name].mjs
   import { ve } from "../../lib/ve-hosted.mjs";
   export const GET = (r) => ve.media(r);
   ```

5. Serve the UI at `/admin/`. For a static export, copy the files at build time:

   ```js
   import { uiFile, UI_FILES } from "ve-backend/hosted";
   // for each name of UI_FILES: write uiFile(name, { base: "/admin", apiBase: "/api/admin" }).body to out/admin/<name>
   ```

   (`index.html` goes to `/admin/index.html`, `editor/app.js` to `/admin/editor/app.js`, `ve/core.js` to `/admin/ve/core.js`, and so on.) Add the security headers for `/admin/*` in `vercel.json` (copy `SECURITY_HEADERS` from the export). A function route that returns `uiFile()` works too.
6. Make the site read the live catalog (next section), deploy, open `/admin/`, sign in, change a price, save, reload the shop.

`vercel.json` must not rewrite `/api/*`. If the project uses `"outputDirectory"` with no framework, Vercel still deploys `api/*.mjs` as Functions.

### Options (`createHostedEditor`)

| Option | Default | Meaning |
|---|---|---|
| `storage` | required | `vercelBlobStorage({ prefix })`, `fileStorage(dir)` or `memoryStorage()` (tests) |
| `seed` | required | catalog JSON used until the first save |
| `apiBase` | `/api/admin` | where `admin` is mounted |
| `mediaBase` | `/api/media` | public photo route; uploads return `/api/media/<file>` |
| `usersEnv` / `secretEnv` | `VE_ADMIN_USERS` / `VE_SESSION_SECRET` | env var names (`env` can be an object or function for non-Node hosts) |
| `cookie` | `__Host-ve_editor` | session cookie name |
| `maxUpload` | 4 MB | Vercel rejects bodies over ~4.5 MB |
| `cors` | `*` | `Access-Control-Allow-Origin` on the public catalog only |

**Blob prefix:** the editor reads and writes only under its `prefix` (`catalog-current`, history, rate-limit counters, `media/`). Use a different prefix for a new editor so existing data in the store is never touched.

## Reading the live catalog on the site

React / Next (client components):

```jsx
import { useLiveCatalog } from "ve-backend/react";
import { getContent } from "ve-backend";
function Hero({ catalog }) {
  const live = useLiveCatalog();                     // null until fetched (or if the fetch fails)
  const hero = getContent(live || catalog, "hero", { title: "Fallback" });
  return <h1>{hero.title}</h1>;
}
```

For products: `mergeLiveProducts(buildProducts, live).products` (from `ve-backend/live`) overlays live fields on the products you already render, matched by slug.

Plain HTML or any framework: add `<meta name="ve-live" content="/api/catalog">` before the runtime script (Astro: `<VeHead catalog={raw} live />`). The runtime then replaces its catalog with the live one (cart prices follow) and fires `document` event `ve:live` with `{ catalog }` so your own script can re-render copy.

Shared helpers in `ve-backend/live`: `fetchLiveCatalog(url?)` (never throws, returns null on failure), `liveContent(live, id, fallback)`, `mergeLiveProducts`.

## Security properties

- Passwords: PBKDF2-SHA256 hashes in `VE_ADMIN_USERS` (iterations 10 000 to 1 000 000 accepted; new hashes use 210 000; hashes with 100 000 iterations from Hangr's older editor work). Never plaintext; the CLI never prints a password.
- Unknown usernames hash a dummy so timing doesn't leak accounts; comparisons are constant-time.
- Session cookie `__Host-ve_editor`: HMAC-signed, `HttpOnly; Secure; SameSite=Strict`, 12 hours, bound to the user's password hash, revocable on sign-out.
- CSRF: writes need `Origin` equal to the site host, header `X-Requested-With: ve-editor`, and no cross-site `Sec-Fetch-Site`.
- Rate limit: 5 failed sign-ins per username and 20 per network address per 15 minutes (`429`, `Retry-After`). Counters live in storage and are last-writer-wins: a strong brake, not exact.
- Uploads: JPG/PNG/WebP/AVIF by file contents, 4 MB, random file names, served with `nosniff` and a sandboxing CSP.
- Admin responses are `no-store` with CSP `frame-ancestors 'none'`, `nosniff`, `X-Robots-Tag: noindex`.
- The public catalog goes through `publicCatalog()`: hidden products, private contact fields and editor metadata are removed.
- Saves use a version check: the editor sends the version it loaded (`?version=`); if someone else saved since, the server answers 409 `VE_HOSTED_STALE` ("Someone else saved changes. Reload to see them before saving.") and the editor offers **Reload latest**. A client that sends no version (old editor) still overwrites. The check is per function instance (not an atomic lock), so two saves in the same instant can still race; Undo (30 versions) recovers.
- The public catalog is sent with `Cache-Control: public, max-age=0, s-maxage=5, stale-while-revalidate=30` (override with `publicCache`), so a save shows on the site within seconds.
- Login lockout: 5 failed tries per account+network address and 20 per address for 15 minutes, so a stranger can't lock out a real user. Each limit is one fixed storage key with its expiry inside. The dummy hash for unknown users uses the highest iteration count among configured users so timing doesn't reveal usernames.
- New content blocks/fields added to the bundled seed after the first save (for example a new gallery) are merged into the stored catalog on read; saved values are never overwritten, and the next save persists the merge.
- `ve-backend/hosted` loads `node:fs` lazily; `uiFile()` needs Node (use it in a build step).

The hosted editor has **no team passcode**; use named users.

## Verify (agent checklist)

1. `GET /api/catalog` is public JSON with no `savedBy`, and `GET /api/admin/catalog` without a cookie is `401`.
2. Sign in at `/admin/`, change a price and a content block, save: the shop shows both after a reload, with no deploy.
3. Undo restores them; a bad value (price "free") shows a red note and is not saved.
4. Upload a photo; `/api/media/<file>` loads without login.
5. Never print or paste passwords, `VE_SESSION_SECRET` or `BLOB_READ_WRITE_TOKEN`.

Error codes are in `docs/troubleshooting.md`.
