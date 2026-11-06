import { test } from "node:test";
import assert from "node:assert/strict";
import { validateCheckout, orderNumber, loadCatalog, addToCart } from "../src/core.js";
import { renderCheckoutView, renderConfirmation, renderPosPanel } from "../src/render.js";
import { cartTotals } from "../src/core.js";

const good = { name: "Ada Lovelace", email: "ada@example.com", address: "1 Main St", city: "Springfield", region: "CA", postal: "94110", card: "4242 4242 4242 4242", expiry: "04 / 28", cvc: "123" };

test("a complete demo checkout has no errors", () => {
  assert.deepEqual(validateCheckout(good), {});
});

test("every field reports a plain-language error", () => {
  const e = validateCheckout({});
  assert.deepEqual(Object.keys(e).sort(), ["address", "card", "city", "cvc", "email", "expiry", "name", "postal", "region"]);
  assert.match(e.card, /any number works/);
});

test("email, ZIP, card, expiry and CVC formats", () => {
  assert.ok(validateCheckout({ ...good, email: "nope" }).email);
  assert.ok(validateCheckout({ ...good, postal: "1234" }).postal);
  assert.deepEqual(validateCheckout({ ...good, postal: "94110-1234" }), {});
  assert.ok(validateCheckout({ ...good, card: "4242" }).card);
  assert.ok(validateCheckout({ ...good, expiry: "13/28" }).expiry);
  assert.deepEqual(validateCheckout({ ...good, expiry: "12/28" }), {});
  assert.ok(validateCheckout({ ...good, cvc: "12" }).cvc);
});

test("order numbers use the prefix and unambiguous characters", () => {
  const n = orderNumber("EB", () => [0, 1, 2, 3, 4, 31]);
  assert.equal(n, "EB-ABCDE9");
  assert.match(orderNumber("VE"), /^VE-[A-HJ-NP-Z2-9]{6}$/);
});

const catalog = loadCatalog({
  company: { name: "Test Co" },
  checkout: { mode: "both", posUrl: "https://portal.veinternational.org/tradeshowpos/abc/newsale/", posLabel: "Pay in POS" },
  categories: [],
  products: [{ slug: "a", name: "A <b>", price: 10 }],
});

test("checkout view: both mode shows POS panel and demo form; escapes names", () => {
  const html = renderCheckoutView(catalog, addToCart([], catalog, "a", 2));
  assert.match(html, /data-ve-pos-checkout/);
  assert.match(html, /href="https:\/\/portal\.veinternational\.org\/tradeshowpos\/abc\/newsale\/"/);
  assert.match(html, /data-ve-checkout-form/);
  assert.match(html, /A &lt;b&gt;/);
  assert.doesNotMatch(html, /A <b>/);
});

test("checkout view: demo-only has no POS panel; POS-only has no form", () => {
  const demo = loadCatalog({ ...catalog, checkout: { ...catalog.checkout, mode: "demo" } });
  assert.doesNotMatch(renderCheckoutView(demo, addToCart([], demo, "a")), /data-ve-pos-checkout/);
  const pos = loadCatalog({ ...catalog, checkout: { ...catalog.checkout, mode: "pos" } });
  const html = renderCheckoutView(pos, addToCart([], pos, "a"));
  assert.match(html, /data-ve-pos-checkout/);
  assert.doesNotMatch(html, /data-ve-checkout-form/);
});

test("empty cart shows an empty state instead of a form", () => {
  assert.match(renderCheckoutView(catalog, []), /Your cart is empty/);
});

test("confirmation and POS panel list the order lines", () => {
  const conf = renderConfirmation(catalog, { number: "VE-ABC123", name: "Ada L", items: [{ name: "A", quantity: 2, total: 20 }], total: 20 });
  assert.match(conf, /Demo order placed/);
  assert.match(conf, /VE-ABC123/);
  assert.match(conf, /No real payment/);
  const pos = renderPosPanel(catalog, cartTotals(addToCart([], catalog, "a", 3), catalog));
  assert.match(pos, /3 × A &lt;b&gt;/);
  assert.match(pos, /\$30\.00/);
});

test("no-cart mode: Buy links to the POS or the product page, no cart controls", async () => {
  const { renderProductCard, renderProductPage, renderCartButton } = await import("../src/render.js");
  const { buyLinkFor, cartEnabled } = await import("../src/core.js");
  const base = { company: { name: "T" }, categories: [], products: [{ slug: "a", name: "A", price: 10, options: [{ name: "Scent", values: [{ label: "X" }] }] }] };
  const noPos = loadCatalog({ ...base, checkout: { mode: "demo", cart: false } });
  assert.equal(cartEnabled(noPos), false);
  assert.deepEqual(buyLinkFor(noPos, noPos.products[0]), { href: "/shop/a/", external: false, pos: false });
  const card = renderProductCard(noPos, noPos.products[0]);
  assert.match(card, /href="\/shop\/a\/"[^>]*>Buy now/);
  assert.doesNotMatch(card, /data-ve-add|Add to cart|data-ve-pos/);
  const page = renderProductPage(noPos, "a");
  assert.doesNotMatch(page, /data-ve-product-form|data-ve-step|data-ve-option|Add to cart|data-ve-stickybar/);
  assert.match(page, /data-ve-buy="a"/);
  assert.equal(renderCartButton(noPos), "");
  const pos = loadCatalog({ ...base, checkout: { mode: "demo", cart: false, posUrl: "https://portal.veinternational.org/tradeshowpos/x/newsale/" } });
  assert.deepEqual(buyLinkFor(pos, pos.products[0]), { href: "https://portal.veinternational.org/tradeshowpos/x/newsale/", external: true, pos: true });
  assert.match(renderProductCard(pos, pos.products[0]), /data-ve-pos="a"/);
  // cart stays on by default, and pos mode still needs a link when the cart is on
  assert.equal(loadCatalog(base).checkout.cart, true);
  assert.throws(() => loadCatalog({ ...base, checkout: { mode: "pos" } }));
  assert.doesNotThrow(() => loadCatalog({ ...base, checkout: { mode: "pos", cart: false } }));
});
