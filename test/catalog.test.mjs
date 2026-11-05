import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadCatalog, validateCatalog, getShopPaths, themeCss, slugify } from "../src/core.js";

const template = JSON.parse(readFileSync(new URL("../templates/ve.catalog.json", import.meta.url), "utf8"));
const base = () => structuredClone(template);

test("the starter template is valid", () => {
  const r = validateCatalog(base());
  assert.equal(r.errors, undefined);
  assert.equal(r.value.products.length, 1);
});

test("rejects non-objects with a readable error", () => {
  assert.ok(validateCatalog(null).errors._);
  assert.ok(validateCatalog([]).errors._);
});

test("price must be a number with at most 2 decimals", () => {
  const c = base();
  c.products[0].price = 12.345;
  assert.match(validateCatalog(c).errors["products.0.price"], /2 decimals/);
  c.products[0].price = -1;
  assert.match(validateCatalog(c).errors["products.0.price"], /below 0/);
  c.products[0].price = "29.99";
  assert.equal(validateCatalog(c).value.products[0].price, 29.99);
});

test("compare-at price must be higher than the price", () => {
  const c = base();
  c.products[0].compareAt = 10;
  assert.ok(validateCatalog(c).errors["products.0.compareAt"]);
  c.products[0].compareAt = 40;
  assert.equal(validateCatalog(c).value.products[0].compareAt, 40);
});

test("unknown category and duplicate slugs are reported", () => {
  const c = base();
  c.products[0].category = "nope";
  assert.ok(validateCatalog(c).errors["products.0.category"]);
  const d = base();
  d.products.push({ ...d.products[0] });
  assert.ok(validateCatalog(d).errors["products.1.slug"]);
  const e = base();
  e.products[0].slug = "featured";
  assert.match(validateCatalog(e).errors["products.0.slug"], /category/);
});

test("missing slugs are generated from names and kept unique", () => {
  const c = base();
  c.products = [{ name: "Rose Bouquet", price: 1 }, { name: "Rose Bouquet", price: 2 }];
  c.categories = [];
  const v = validateCatalog(c).value;
  assert.deepEqual(v.products.map((p) => p.slug), ["rose-bouquet", "rose-bouquet-2"]);
  assert.equal(slugify("Boutonnière Rosé!"), "boutonniere-rose");
});

test("POS checkout needs a POS link; links must be https", () => {
  const c = base();
  c.checkout.mode = "pos";
  assert.ok(validateCatalog(c).errors["checkout.posUrl"]);
  c.checkout.posUrl = "http://insecure.example";
  assert.match(validateCatalog(c).errors["checkout.posUrl"], /https/);
  c.checkout.posUrl = "https://portal.veinternational.org/tradeshowpos/x/newsale/";
  assert.equal(validateCatalog(c).errors, undefined);
});

test("options need choices; choice prices are validated", () => {
  const c = base();
  c.products[0].options = [{ name: "Scent", values: [] }];
  assert.ok(validateCatalog(c).errors["products.0.options.0.values"]);
  c.products[0].options = [{ name: "Scent", values: ["Rose", { label: "Peony", priceDelta: 2.5 }] }];
  const v = validateCatalog(c).value.products[0].options[0];
  assert.deepEqual(v.values, [{ label: "Rose", priceDelta: 0 }, { label: "Peony", priceDelta: 2.5 }]);
});

test("theme rejects CSS injection and falls back to defaults", () => {
  const c = base();
  c.theme.colors.accent = "red;}body{display:none";
  assert.ok(validateCatalog(c).errors["theme.colors.accent"]);
  const d = base();
  d.theme.card = "weird";
  assert.equal(validateCatalog(d).value.theme.card, "rounded");
  const css = themeCss(validateCatalog(base()).value.theme);
  assert.match(css, /--ve-accent:#24262b/);
  assert.match(css, /--ve-tint-sand:#f1ece2/);
});

test("images must be site paths or https, never javascript:", () => {
  const c = base();
  c.products[0].images = [{ src: "javascript:alert(1)", alt: "" }];
  assert.ok(validateCatalog(c).errors["products.0.images"]);
});

test("loadCatalog throws VE_CATALOG_INVALID with every problem listed", () => {
  const c = base();
  c.company.name = "";
  c.products[0].price = "abc";
  assert.throws(() => loadCatalog(c), (e) => e.code === "VE_CATALOG_INVALID" && /company\.name/.test(e.message) && /products\.0\.price/.test(e.message));
});

test("getShopPaths lists visible categories and products only", () => {
  const c = base();
  c.products.push({ slug: "hidden-one", name: "Hidden", category: "featured", price: 1, visible: false });
  const paths = getShopPaths(loadCatalog(c)).map((p) => `${p.props.kind}:${p.params.slug}`);
  assert.deepEqual(paths, ["category:featured", "product:starter-product"]);
});
