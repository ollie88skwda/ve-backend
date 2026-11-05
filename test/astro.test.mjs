// Builds examples/demo-site with the real Astro integration and checks the generated pages.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFile, rm, cp } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import path from "node:path";

const lib = fileURLToPath(new URL("..", import.meta.url));
const site = path.join(lib, "test", ".tmp", "site");
const out = path.join(site, "dist");
const page = (p) => readFile(path.join(out, p, "index.html"), "utf8");

before(async () => {
  await rm(path.join(lib, "test", ".tmp"), { recursive: true, force: true });
  await cp(path.join(lib, "examples", "demo-site"), site, { recursive: true, filter: (s) => !["node_modules", "dist", ".astro"].includes(path.basename(s)) });
  // Point the copied config at the library root (two levels deeper than the example).
  const cfg = path.join(site, "astro.config.mjs");
  const fs = await import("node:fs/promises");
  await fs.writeFile(cfg, (await fs.readFile(cfg, "utf8")).replace("../../astro/integration.js", "../../../astro/integration.js"));
  const idx = path.join(site, "src/pages/index.astro");
  await fs.writeFile(idx, (await fs.readFile(idx, "utf8")).replaceAll("../../../../", "../../../../../"));
  // Add a second category + product so category tabs render.
  const catPath = path.join(site, "src/data/ve.catalog.json");
  const cat = JSON.parse(await fs.readFile(catPath, "utf8"));
  cat.categories.push({ slug: "gifts", name: "Gifts", description: "Gift sets." });
  cat.products.push({ slug: "gift-set", name: "Gift Set", category: "gifts", price: 49, compareAt: 59, options: [{ name: "Size", values: ["Small", { label: "Large", priceDelta: 10 }] }], images: [{ src: "/img/gift.webp", alt: "Gift set" }] });
  cat.products.push({ slug: "secret", name: "Secret", category: "gifts", price: 1, visible: false });
  await fs.writeFile(catPath, JSON.stringify(cat));
  execFileSync(process.execPath, [path.join(lib, "node_modules", "astro", "bin", "astro.mjs"), "build", "--root", site], { stdio: "pipe", cwd: site });
});

test("generates shop index, category, product, cart and checkout pages", async () => {
  for (const p of ["shop", "shop/featured", "shop/gifts", "shop/starter-product", "shop/gift-set", "cart", "checkout", ""]) {
    assert.ok((await page(p)).includes("data-ve-catalog"), `${p || "/"} has the catalog data island`);
  }
});

test("hidden products get no page", async () => {
  await assert.rejects(page("shop/secret"));
});

test("shop index renders a section and tab per category, cards link to product pages", async () => {
  const html = await page("shop");
  assert.match(html, /class="ve-tabs"/);
  assert.match(html, /href="\/shop\/gifts\/"/);
  assert.match(html, /data-ve-card="gift-set"/);
  assert.match(html, /href="\/shop\/gift-set\/"/);
  assert.doesNotMatch(html, /data-ve-card="secret"/);
});

test("product page has price, compare-at, options, buy form and JSON-LD", async () => {
  const html = await page("shop/gift-set");
  assert.match(html, /<h1 class="ve-title">Gift Set<\/h1>/);
  assert.match(html, /\$49\.00/);
  assert.match(html, /<s class="ve-price-was">/);
  assert.match(html, /data-ve-option="Size"/);
  assert.match(html, /data-ve-product-form="gift-set"/);
  assert.match(html, /"@type":"Product"/);
});

test("theme CSS variables and runtime script are included", async () => {
  const html = await page("shop/starter-product");
  assert.match(html, /--ve-tint-sand:#f1ece2/);
  assert.match(html, /<script type="module"/);
});

test("cart and checkout pages ship client shells", async () => {
  assert.match(await page("cart"), /<ve-cart/);
  assert.match(await page("checkout"), /<ve-checkout/);
});
