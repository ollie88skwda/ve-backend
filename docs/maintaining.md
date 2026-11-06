# Maintaining the library

Only for changes to ve-backend itself (this repo), not to a site using it.

## Principles

- `src/render.js` is the single source of HTML. Astro, React and the runtime all call it. Change markup there, once.
- `src/core.js` stays pure (no DOM, no Node APIs) so it runs in builds, browsers and tests.
- Every visual value goes through a `--ve-*` variable in `src/styles.css`. No hardcoded brand colors.
- Adding a `data-ve-*` hook, event, catalog field or error code means updating `docs/contract.md`, `docs/catalog.md` or `docs/troubleshooting.md` and `types/` in the same change.
- Removing or renaming a hook, element, event, catalog field or export is a **breaking change**: while on 0.x bump the minor (0.2 → 0.3) and update the install lines in the docs; after 1.0 bump the major.
- No runtime dependencies. Astro and React are optional peer dependencies.

## Test

```sh
npm test                     # node:test suites in test/: catalog, cart, checkout, astro rendering, editor server + admin logins, hosted handlers (auth, CSRF, rate limit, undo, upload, public catalog)
npm run demo                 # demo Astro site at examples/demo-site
npm run editor:demo          # editor against the demo site
```

Before a release, also install the branch into a real site (`npm install github:ollie88skwda/ve-backend#<branch>`), build it, and run the browser checklist in `AGENTS.md`.

## Release

```sh
npm version patch            # or minor / major; creates the commit and vX.Y.Z tag
git push --follow-tags
```

Sites on `#semver:^0.3.0` pick up 0.3.x releases with `npm update ve-backend`. When an npm account is logged in, `npm publish` also works; `package.json` is already set up for it.

## Credit

The store UI and sales editor are adapted from Hangr, a VE company store. Keep the credit in `README.md`, `src/index.js` and `AGENTS.md`.
