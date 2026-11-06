# Sales editor and logins

The sales editor is a local web app that lets non-coders change products, prices, photos, site content (hero slogan and other blocks from `docs/content.md`), checkout and theme with a live preview. It writes `ve.catalog.json` and saves photos into the site's `public/uploads/`.

```sh
npm run editor                        # added by `init`; same as: npx ve-backend editor
npx ve-backend editor --port 4410 --host 127.0.0.1 --site-url http://localhost:4321/
```

| Flag | Default | Use |
|---|---|---|
| `--port` | 4410 | |
| `--host` | 127.0.0.1 | keep local; only expose through a private network such as Tailscale, never the public internet |
| `--catalog` | `src/data/ve.catalog.json` | |
| `--public` | `public` | where uploads go (`<public>/uploads/`) |
| `--site-url` | `VE_SITE_URL` env, else none | the site's dev server, shown in the live preview |

The same settings can live in the site's `package.json` under `"ve-backend": { "catalog", "publicDir", "siteUrl", "port" }`.

## Who can sign in

There are two kinds of login. The editor starts if at least one exists.

### Team passcode (per site)

- `VE_EDITOR_PASSCODE` in the environment, or in `.env.ve-backend.local` in the site root (created by `init`, gitignored, mode 600).
- To sign in, leave **Username** empty and type the passcode.
- Share it with the company's team out of band. Never commit it, print it, or paste it into chat or docs.

### Personal admin logins (per computer user, every site)

An admin login works in **every** ve-backend editor started by the same user account on the same computer, without per-site setup.

```sh
ve-backend admin set <username>             # password from stdin, or VE_ADMIN_PASSWORD
ve-backend admin list
ve-backend admin remove <username>
```

- Stored in `~/.config/ve-backend/admins.json` (mode 600) as salted scrypt hashes, never plaintext. Override the location with `VE_ADMINS_FILE`.
- Usernames: 2–40 characters from `a-z 0-9 . _ -`, case-insensitive. Passwords: at least 10 characters.
- Changes apply at the next sign-in, with no restart.
- Admin logins don't carry over to other computers or to deployed sites. The public store has no login, because shoppers never sign in.

Setting a password without it touching shell history:

```sh
read -rs PW && printf '%s' "$PW" | npx ve-backend admin set alex && unset PW
```

### Security behavior

- Session cookie: `HttpOnly; SameSite=Strict`, 12 hours.
- Repeated failed sign-ins from one address are blocked for a few minutes; each failure is delayed.
- Unknown usernames take the same time as wrong passwords.
- The editor never returns the passcode or hashes over its API.

## What the editor does to files

- Every save validates the catalog first (same rules as `validate`); invalid saves are rejected with field errors.
- Saves are atomic (temp file + rename), with a timestamped copy in `.ve-backend/history/` for **Undo**. Keep `.ve-backend/` out of git.
- Photo uploads: ≤8 MB, JPG/PNG/WebP/AVIF only (checked by file contents), saved to `public/uploads/` with a random-suffixed filename.

## Agents and the editor

- Prefer giving humans the editor over hand-editing JSON for routine price/text changes.
- If you edit the JSON while the editor is open, tell the human to reload it, since an unsaved editor tab would overwrite your change.
- Don't automate sign-in with a human's password. For testing, start a throwaway editor with a temporary `VE_EDITOR_PASSCODE` and a copy of the catalog, or use the tests in `test/editor.test.mjs`.
