import { test } from "node:test";
import assert from "node:assert/strict";
import { loadCatalog, addToCart, setQuantity, removeLine, cartTotals, sanitizeLines, unitPrice, perUnit, savingsPercent, checkoutModeFor, posUrlFor, MAX_QUANTITY } from "../src/core.js";

const catalog = loadCatalog({
  company: { name: "Test Co" },
  checkout: { mode: "demo", posUrl: "https://portal.veinternational.org/tradeshowpos/abc/newsale/" },
  categories: [{ slug: "pods", name: "Pods" }],
  products: [
    { slug: "pod", name: "Pod", category: "pods", price: 12.5, compareAt: 15, options: [{ name: "Plan", values: [{ label: "One-time" }, { label: "Subscription", priceDelta: -2.5 }] }] },
    { slug: "bundle", name: "Bundle", price: 459.99, bundle: { count: 14, unit: "bouquets" }, checkout: "pos" },
    { slug: "cheap", name: "Cheap", price: 0.1 },
    { slug: "gone", name: "Gone", price: 5, visible: false },
  ],
});

test("adding the same product and options merges lines", () => {
  let lines = addToCart([], catalog, "pod", 1);
  lines = addToCart(lines, catalog, "pod", 2);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].quantity, 3);
  assert.deepEqual(lines[0].options, { Plan: "One-time" });
});

test("different options make separate lines with their own prices", () => {
  let lines = addToCart([], catalog, "pod", 1, { Plan: "One-time" });
  lines = addToCart(lines, catalog, "pod", 2, { Plan: "Subscription" });
  const t = cartTotals(lines, catalog);
  assert.equal(t.items.length, 2);
  assert.equal(t.items[1].unitPrice, 10);
  assert.equal(t.subtotal, 32.5);
  assert.equal(t.count, 3);
});

test("quantities clamp to 1..MAX and 0 removes", () => {
  let lines = addToCart([], catalog, "cheap", 50);
  assert.equal(lines[0].quantity, MAX_QUANTITY);
  lines = setQuantity(lines, lines[0].id, 0);
  assert.equal(lines.length, 0);
  lines = removeLine(addToCart([], catalog, "cheap"), "cheap");
  assert.equal(lines.length, 0);
});

test("money stays exact to the cent (no float drift)", () => {
  const lines = addToCart([], catalog, "cheap", 3);
  assert.equal(cartTotals(lines, catalog).subtotal, 0.3);
});

test("savings come from the compare-at price", () => {
  const lines = addToCart([], catalog, "pod", 2);
  assert.equal(cartTotals(lines, catalog).savings, 5);
  assert.equal(savingsPercent(catalog.products[0]), 17);
});

test("unknown, hidden and malformed stored lines are dropped", () => {
  const raw = [{ slug: "nope", quantity: 1 }, { slug: "gone", quantity: 1 }, { slug: "pod", quantity: -2 }, { slug: "pod", quantity: 2, options: { Plan: "Bogus" } }, "junk"];
  const lines = sanitizeLines(raw, catalog);
  assert.equal(lines.length, 1);
  assert.deepEqual(lines[0].options, { Plan: "One-time" });
  assert.deepEqual(sanitizeLines("not an array", catalog), []);
});

test("unit price and per-unit bundle price", () => {
  assert.equal(unitPrice(catalog.products[0], { Plan: "Subscription" }), 10);
  assert.equal(perUnit(catalog.products[1]), 32.86);
});

test("checkout mode: product override applies when every item agrees", () => {
  const pos = cartTotals(addToCart([], catalog, "bundle"), catalog).items;
  assert.equal(checkoutModeFor(catalog, pos), "pos");
  assert.equal(posUrlFor(catalog, pos), catalog.checkout.posUrl);
  const mixed = cartTotals(addToCart(addToCart([], catalog, "bundle"), catalog, "cheap"), catalog).items;
  assert.equal(checkoutModeFor(catalog, mixed), "demo");
});
