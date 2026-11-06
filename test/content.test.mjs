import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateCatalog, getContent, publicCatalog, loadCatalog } from "../src/core.js";

const template = JSON.parse(readFileSync(new URL("../templates/ve.catalog.json", import.meta.url), "utf8"));
const withContent = (content) => ({ ...structuredClone(template), content });
const hero = () => ({
  id: "hero",
  label: "Home page hero",
  help: "Top of the home page.",
  fields: [
    { id: "title", label: "Slogan", type: "text", max: 40, value: "Always in bloom", required: true },
    { id: "subtitle", label: "One-line pitch", type: "textarea", value: "Lifelike flowers." },
    { id: "ctaHref", label: "Button link", type: "link", value: "/shop/" },
    { id: "art", label: "Picture", type: "image", value: "/assets/hero.webp", alt: "Flowers" },
    { id: "showPrice", label: "Show starting price", type: "toggle", value: true },
  ],
});

test("catalogs without content stay valid and get an empty list", () => {
  const r = validateCatalog(structuredClone(template));
  assert.equal(r.errors, undefined);
  assert.deepEqual(r.value.content, []);
});

test("content blocks validate and getContent returns values over fallbacks", () => {
  const c = loadCatalog(withContent([hero()]));
  const v = getContent(c, "hero", { title: "fallback", eyebrow: "kept" });
  assert.equal(v.title, "Always in bloom");
  assert.equal(v.eyebrow, "kept");
  assert.equal(v.ctaHref, "/shop/");
  assert.equal(v.art, "/assets/hero.webp");
  assert.equal(v.artAlt, "Flowers");
  assert.equal(v.showPrice, true);
  assert.deepEqual(getContent(c, "missing", { title: "x" }), { title: "x" });
  assert.equal(publicCatalog(c).content[0].id, "hero");
});

test("empty optional values fall back instead of blanking the page", () => {
  const b = hero();
  b.fields[1].value = "";
  const c = loadCatalog(withContent([b]));
  assert.equal(getContent(c, "hero", { subtitle: "default pitch" }).subtitle, "default pitch");
});

test("content errors are keyed by path with plain messages", () => {
  const b = hero();
  b.fields[0].value = "x".repeat(41);
  b.fields[2].value = "javascript:alert(1)";
  b.fields[3].value = "../secret.png";
  const dup = { id: "hero", fields: [{ id: "a", value: "" }] };
  const bad = { id: "Bad id!", fields: [{ id: "a", type: "rainbow" }] };
  const req = hero();
  req.id = "promo";
  req.fields[0].value = "";
  const r = validateCatalog(withContent([b, dup, bad, req, { id: "empty", fields: [] }]));
  assert.match(r.errors["content.0.fields.0.value"], /too long/);
  assert.match(r.errors["content.0.fields.2.value"], /#bundles/);
  assert.match(r.errors["content.0.fields.3.value"], /site path/);
  assert.match(r.errors["content.1.id"], /used twice/);
  assert.match(r.errors["content.2.id"], /Block id/);
  assert.match(r.errors["content.2.fields.0.type"], /one of/);
  assert.match(r.errors["content.3.fields.0.value"], /can't be empty/);
  assert.match(r.errors["content.4.fields"], /at least one/);
  assert.match(validateCatalog(withContent({})).errors.content, /list/);
});

test("single-line text rejects line breaks", () => {
  const b = hero();
  b.fields[0].value = "two\nlines";
  assert.match(validateCatalog(withContent([b])).errors["content.0.fields.0.value"], /one line/);
});

test("links accept site paths, #sections, mailto and https only", () => {
  for (const ok of ["/shop/", "#bundles", "mailto:hi@example.com", "https://example.com/"]) {
    const b = hero();
    b.fields[2].value = ok;
    assert.equal(validateCatalog(withContent([b])).errors, undefined, ok);
  }
  for (const bad of ["javascript:alert(1)", "http://example.com", "#", "# x", "data:text/html,hi"]) {
    const b = hero();
    b.fields[2].value = bad;
    assert.ok(validateCatalog(withContent([b])).errors?.["content.0.fields.2.value"], bad);
  }
});

import { validateCatalog as vc, getContent as gc, DEFAULT_CATALOG as DC } from "../src/core.js";
const galleryCatalog = (value, extra = {}) => ({ ...structuredClone(DC), content: [{ id: "about", label: "About", fields: [{ id: "photos", label: "Photos", type: "gallery", value, ...extra }] }] });

test("gallery field validates src, caption length, max and hard cap; getContent returns the array", () => {
  const ok = vc(galleryCatalog([{ src: "/a.webp", alt: "One" }, { src: "https://x.example/b.jpg", alt: "" }]));
  assert.ok(!ok.errors, JSON.stringify(ok.errors));
  assert.deepEqual(gc(ok.value, "about").photos, [{ src: "/a.webp", alt: "One" }, { src: "https://x.example/b.jpg", alt: "" }]);
  assert.deepEqual(gc(vc(galleryCatalog([])).value, "about", { photos: [{ src: "/fallback.webp", alt: "f" }] }).photos, [{ src: "/fallback.webp", alt: "f" }]);
  assert.ok(vc(galleryCatalog([{ src: "javascript:alert(1)", alt: "" }])).errors["content.0.fields.0.value.0.src"]);
  assert.ok(vc(galleryCatalog([{ src: "/a.webp", alt: "x".repeat(161) }])).errors["content.0.fields.0.value.0.alt"]);
  assert.ok(vc(galleryCatalog([{ src: "", alt: "no image" }])).errors["content.0.fields.0.value.0.src"]);
  const many = (n) => Array.from({ length: n }, (_, i) => ({ src: `/p${i}.webp`, alt: "" }));
  assert.ok(!vc(galleryCatalog(many(12))).errors);
  assert.ok(vc(galleryCatalog(many(13))).errors["content.0.fields.0.value"]);
  assert.ok(!vc(galleryCatalog(many(20), { max: 20 })).errors);
  assert.ok(vc(galleryCatalog(many(25), { max: 99 })).errors["content.0.fields.0.value"]);
  assert.equal(vc(galleryCatalog([], { max: 99 })).value.content[0].fields[0].max, 24);
  assert.ok(vc(galleryCatalog("nope")).errors["content.0.fields.0.value"]);
});
