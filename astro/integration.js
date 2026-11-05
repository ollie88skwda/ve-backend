// ve-backend Astro integration: generates /shop/, /shop/<category>/, /shop/<product>/, /cart/ and /checkout/
// from one catalog JSON file, wrapped in your own layout. Zero page files needed.
//
//   import veBackend from "ve-backend/astro/integration";
//   export default defineConfig({ integrations: [veBackend({ catalog: "./src/data/ve.catalog.json", layout: "./src/layouts/BaseLayout.astro" })] });
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const VIRTUAL = "virtual:ve-backend/site";
const RESOLVED = `\0${VIRTUAL}`;

export default function veBackend(options = {}) {
  const { catalog = "./src/data/ve.catalog.json", layout, routes = true, layoutProps = {} } = options;
  return {
    name: "ve-backend",
    hooks: {
      "astro:config:setup": ({ config, injectRoute, updateConfig, logger }) => {
        const root = fileURLToPath(config.root);
        const catalogPath = path.resolve(root, catalog);
        if (!fs.existsSync(catalogPath)) {
          throw new Error(`VE_CATALOG_FILE_MISSING: ${catalogPath} does not exist. Run "npx ve-backend init" or set the catalog option.`);
        }
        const layoutPath = layout ? path.resolve(root, layout) : path.join(here, "components", "DefaultLayout.astro");
        const shop = JSON.parse(fs.readFileSync(catalogPath, "utf8")).shop || {};
        const base = (shop.basePath || "/shop/").replace(/^\/|\/$/g, "");
        const cart = (shop.cartPath || "/cart/").replace(/^\/|\/$/g, "");
        const checkout = (shop.checkoutPath || "/checkout/").replace(/^\/|\/$/g, "");
        updateConfig({
          vite: {
            plugins: [
              {
                name: "ve-backend:site",
                resolveId: (id) => (id === VIRTUAL ? RESOLVED : null),
                load: (id) =>
                  id === RESOLVED
                    ? `import catalog from ${JSON.stringify(catalogPath)};\nexport { default as Layout } from ${JSON.stringify(layoutPath)};\nexport const layoutProps = ${JSON.stringify(layoutProps)};\nexport { catalog };`
                    : null,
              },
            ],
          },
        });
        if (!routes) return;
        injectRoute({ pattern: `/${base}`, entrypoint: path.join(here, "pages", "shop-index.astro") });
        injectRoute({ pattern: `/${base}/[slug]`, entrypoint: path.join(here, "pages", "shop-slug.astro") });
        injectRoute({ pattern: `/${cart}`, entrypoint: path.join(here, "pages", "cart.astro") });
        injectRoute({ pattern: `/${checkout}`, entrypoint: path.join(here, "pages", "checkout.astro") });
        logger.info(`shop routes: /${base}/, /${base}/[slug]/, /${cart}/, /${checkout}/`);
      },
    },
  };
}
