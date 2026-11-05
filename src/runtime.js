// ve-backend browser runtime. Vanilla ESM, no dependencies, works with any framework or plain HTML.
// Cart behavior adapted from Hangr (src/lib/cart.tsx): browser-local cart, nothing leaves the device.
//
// Usage: include the catalog data island (<script type="application/json" id="ve-catalog">) once,
// then `import "ve-backend/runtime"` (or <script type="module" src=".../runtime.js">).
// Custom elements: <ve-cart-button>, <ve-cart>, <ve-checkout>, <ve-product-card slug>, <ve-product-grid category>, <ve-product-page slug>.
import {
  addToCart,
  cartTotals,
  CHECKOUT_FIELDS,
  checkoutModeFor,
  findProduct,
  formatMoney,
  normalizeSelection,
  orderNumber,
  removeLine,
  sanitizeLines,
  setQuantity,
  unitPrice,
  validateCheckout,
  validateCatalog,
  themeCss,
  MAX_QUANTITY,
} from "./core.js";
import { renderCartView, renderCheckoutView, renderConfirmation, renderProductCard, renderProductGrid, renderProductPage } from "./render.js";

const EVENT = "ve:cart";
let catalog = null;
let lines = [];
let storageKey = "ve-cart-v1";

const reduceMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

function readCatalog() {
  if (catalog) return catalog;
  const el = document.querySelector("script[data-ve-catalog]");
  if (!el) {
    console.error("[ve-backend] VE_CATALOG_MISSING: add the catalog data island (<VeHead/> in Astro, or renderDataScript(publicCatalog(catalog))) before the runtime script.");
    return null;
  }
  try {
    catalog = JSON.parse(el.textContent || "{}");
  } catch (e) {
    console.error("[ve-backend] VE_CATALOG_PARSE: the [data-ve-catalog] JSON is invalid.", e);
    return null;
  }
  catalog.theme = catalog.theme || { tints: {} };
  storageKey = `ve-cart-v1:${(catalog.company?.name || "store").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return catalog;
}

function load() {
  try {
    lines = sanitizeLines(JSON.parse(localStorage.getItem(storageKey) || "[]"), catalog);
  } catch {
    lines = [];
  }
}
function save() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(lines));
  } catch {
    /* storage unavailable: cart stays in memory for this page */
  }
  document.dispatchEvent(new CustomEvent(EVENT, { detail: cartApi.totals() }));
}

export const cartApi = {
  get lines() {
    return lines;
  },
  totals: () => cartTotals(lines, catalog),
  add(slug, quantity = 1, options = {}) {
    lines = addToCart(lines, catalog, slug, quantity, options);
    save();
  },
  setQuantity(id, quantity) {
    lines = setQuantity(lines, id, quantity);
    save();
  },
  remove(id) {
    lines = removeLine(lines, id);
    save();
  },
  clear() {
    lines = [];
    save();
  },
};

function announce(el, html) {
  if (!el) return;
  el.innerHTML = html;
}

function flashButton(btn, text = "Added") {
  const label = btn.querySelector("[data-ve-label]");
  if (!label) return;
  const before = label.dataset.original || label.textContent;
  label.dataset.original = before;
  btn.classList.add("is-added");
  label.textContent = text;
  clearTimeout(btn._veTimer);
  btn._veTimer = setTimeout(() => {
    btn.classList.remove("is-added");
    label.textContent = before;
  }, 1800);
}

function bumpCount() {
  document.querySelectorAll("[data-ve-count]").forEach((el) => {
    if (reduceMotion() || !el.animate) return;
    el.animate([{ transform: "scale(1)" }, { transform: "scale(1.35)" }, { transform: "scale(1)" }], { duration: 420, easing: "cubic-bezier(.16,1,.3,1)" });
  });
}

// ---------- <ve-cart-button> ----------
class VeCartButton extends HTMLElement {
  connectedCallback() {
    this._update = () => {
      const { count } = cartApi.totals();
      const link = this.querySelector("[data-ve-cart-link]");
      const badge = this.querySelector("[data-ve-count]");
      if (badge) {
        badge.textContent = String(count);
        badge.hidden = count === 0;
      }
      if (link) link.setAttribute("aria-label", `${this.querySelector(".ve-cart-label")?.textContent || "Cart"}, ${count} item${count === 1 ? "" : "s"}`);
    };
    document.addEventListener(EVENT, this._update);
    this._update();
  }
  disconnectedCallback() {
    document.removeEventListener(EVENT, this._update);
  }
}

// ---------- <ve-cart> ----------
class VeCart extends HTMLElement {
  connectedCallback() {
    this._render = () => {
      this.innerHTML = renderCartView(catalog, lines);
    };
    this.addEventListener("click", (e) => {
      const rm = e.target.closest("[data-ve-remove]");
      if (rm) return cartApi.remove(rm.dataset.veRemove);
      const step = e.target.closest("[data-ve-step]");
      const line = e.target.closest("[data-ve-line]");
      if (step && line) {
        const current = lines.find((l) => l.id === line.dataset.veLine);
        if (current) cartApi.setQuantity(current.id, Math.max(1, current.quantity + Number(step.dataset.veStep)));
        requestAnimationFrame(() => this.querySelector(`[data-ve-line="${CSS.escape(line.dataset.veLine)}"] [data-ve-step="${step.dataset.veStep}"]`)?.focus());
      }
    });
    document.addEventListener(EVENT, this._render);
    this._render();
  }
  disconnectedCallback() {
    document.removeEventListener(EVENT, this._render);
  }
}

// ---------- <ve-checkout> ----------
class VeCheckout extends HTMLElement {
  connectedCallback() {
    this._render = () => {
      if (this._done) return;
      const keep = this._values;
      this.innerHTML = renderCheckoutView(catalog, lines);
      const form = this.querySelector("[data-ve-checkout-form]");
      if (form && keep) for (const [k, v] of Object.entries(keep)) if (form.elements[k]) form.elements[k].value = v;
    };
    this.addEventListener("input", (e) => {
      const input = e.target.closest(".ve-input");
      if (!input) return;
      this._values = { ...(this._values || {}), [input.name]: input.value };
      if (input.getAttribute("aria-invalid")) setError(this, input.name, "");
    });
    this.addEventListener("submit", (e) => {
      const form = e.target.closest("[data-ve-checkout-form]");
      if (!form) return;
      e.preventDefault();
      const values = Object.fromEntries(CHECKOUT_FIELDS.map((k) => [k, form.elements[k]?.value || ""]));
      const errors = validateCheckout(values);
      CHECKOUT_FIELDS.forEach((k) => setError(this, k, errors[k] || ""));
      const first = CHECKOUT_FIELDS.find((k) => errors[k]);
      if (first) {
        form.elements[first]?.focus();
        return;
      }
      const totals = cartApi.totals();
      const order = {
        number: orderNumber(catalog.checkout.orderPrefix || "VE"),
        name: values.name.trim(),
        items: totals.items.map((i) => ({ name: i.product.name, quantity: i.quantity, options: Object.entries(i.options).map(([k, v]) => `${k}: ${v}`).join(" · "), total: i.lineTotal })),
        total: totals.total,
      };
      this._done = true;
      this._values = null;
      cartApi.clear();
      this.innerHTML = renderConfirmation(catalog, order);
      window.scrollTo({ top: 0, behavior: reduceMotion() ? "auto" : "smooth" });
      requestAnimationFrame(() => this.querySelector("#ve-confirm-title")?.focus({ preventScroll: true }));
      this.dispatchEvent(new CustomEvent("ve:order", { bubbles: true, detail: order }));
    });
    document.addEventListener(EVENT, this._render);
    this._render();
  }
  disconnectedCallback() {
    document.removeEventListener(EVENT, this._render);
  }
}
function setError(root, name, message) {
  const input = root.querySelector(`#ve-${name}`);
  const box = root.querySelector(`#ve-${name}-error`);
  if (!input || !box) return;
  box.textContent = message;
  box.hidden = !message;
  if (message) {
    input.setAttribute("aria-invalid", "true");
    input.setAttribute("aria-describedby", [input.getAttribute("aria-describedby"), box.id].filter((x) => x && !x.includes(box.id)).concat(box.id).join(" "));
  } else input.removeAttribute("aria-invalid");
}

// ---------- client-rendered product elements (for sites without a build step) ----------
class VeProductCard extends HTMLElement {
  connectedCallback() {
    if (this.childElementCount) return;
    const p = findProduct(catalog, this.getAttribute("slug"));
    if (p) this.innerHTML = renderProductCard(catalog, p, { reveal: false });
  }
}
class VeProductGrid extends HTMLElement {
  connectedCallback() {
    if (this.childElementCount) return;
    this.innerHTML = renderProductGrid(catalog, { category: this.getAttribute("category") || "", limit: Number(this.getAttribute("limit")) || 0, reveal: false });
  }
}
class VeProductPage extends HTMLElement {
  connectedCallback() {
    if (!this.childElementCount) this.innerHTML = renderProductPage(catalog, this.getAttribute("slug"), { reveal: false });
    initProductPages(this);
  }
}

// ---------- add-to-cart buttons and product pages (works on server-rendered markup) ----------
function onDocumentClick(e) {
  const add = e.target.closest("[data-ve-add]");
  if (add) {
    e.preventDefault();
    const slug = add.dataset.veAdd;
    const product = findProduct(catalog, slug);
    if (!product) return;
    cartApi.add(slug, 1, {});
    flashButton(add);
    bumpCount();
    return;
  }
  const sticky = e.target.closest("[data-ve-sticky-add]");
  if (sticky) {
    const form = document.querySelector(`[data-ve-product-form="${CSS.escape(sticky.dataset.veStickyAdd)}"]`);
    form?.requestSubmit();
  }
}

function selectionOf(form, product) {
  const sel = {};
  form.querySelectorAll("[data-ve-option]:checked").forEach((i) => (sel[i.dataset.veOption] = i.value));
  return normalizeSelection(product, sel);
}

export function initProductPages(root = document) {
  root.querySelectorAll("[data-ve-product-form]").forEach((form) => {
    if (form._veReady) return;
    form._veReady = true;
    const product = findProduct(catalog, form.dataset.veProductForm);
    if (!product) return;
    const page = form.closest("[data-ve-product]") || document;
    const qtyOut = form.querySelector("[data-ve-qty]");
    const [minus, plus] = form.querySelectorAll("[data-ve-step]");
    let qty = 1;
    const setQty = (n) => {
      qty = Math.max(1, Math.min(MAX_QUANTITY, n));
      qtyOut.textContent = String(qty);
      minus.disabled = qty <= 1;
      plus.disabled = qty >= MAX_QUANTITY;
    };
    form.addEventListener("click", (e) => {
      const step = e.target.closest("[data-ve-step]");
      if (step) setQty(qty + Number(step.dataset.veStep));
    });
    const updatePrice = () => {
      const price = formatMoney(catalog, unitPrice(product, selectionOf(form, product)));
      page.querySelectorAll(".ve-price-now[data-ve-price], .ve-stickybar [data-ve-price]").forEach((el, i) => {
        if (i < 2) el.textContent = price;
      });
    };
    form.addEventListener("change", (e) => {
      if (e.target.matches("[data-ve-option]")) updatePrice();
    });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const sel = selectionOf(form, product);
      cartApi.add(product.slug, qty, sel);
      const opt = Object.values(sel).filter(Boolean).join(", ");
      announce(form.querySelector("[data-ve-status]"), `Added ${qty} × ${escapeHtml(product.name)}${opt ? ` (${escapeHtml(opt)})` : ""}. <a href="${catalog.shop.cartPath}">View cart</a>`);
      const btn = form.querySelector('button[type="submit"]');
      if (btn) flashButton(btn);
      bumpCount();
    });
    // Gallery thumbnails
    page.querySelectorAll("[data-ve-thumb]").forEach((b) =>
      b.addEventListener("click", () => {
        const img = page.querySelector(".ve-visual--hero img");
        if (img) {
          img.src = b.dataset.src;
          img.alt = b.dataset.alt || "";
        }
        page.querySelectorAll("[data-ve-thumb]").forEach((x) => x.removeAttribute("aria-current"));
        b.setAttribute("aria-current", "true");
      }),
    );
    // Sticky add-to-cart bar on phones once the buy button scrolls away (Hangr pattern)
    const bar = page.querySelector("[data-ve-stickybar]");
    const target = form.querySelector("[data-ve-submit]");
    if (bar && target && "IntersectionObserver" in window) {
      new IntersectionObserver(([entry]) => {
        const show = !entry.isIntersecting && entry.boundingClientRect.top < 0;
        bar.classList.toggle("is-visible", show);
        bar.toggleAttribute("inert", !show);
        bar.setAttribute("aria-hidden", String(!show));
      }).observe(target);
    }
  });
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// ---------- entrance motion (respects reduced motion; content visible without JS) ----------
export function initReveal(root = document) {
  if (reduceMotion() || !("IntersectionObserver" in window) || document.documentElement.dataset.veMotion === "off") return;
  const vh = window.innerHeight;
  const items = [...root.querySelectorAll("[data-ve-reveal]")].filter((el) => !el._veSeen && el.getBoundingClientRect().top > vh * 0.92);
  if (!items.length) return;
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        io.unobserve(entry.target);
        entry.target.classList.add("is-in");
      });
    },
    { rootMargin: "0px 0px -8% 0px" },
  );
  items.forEach((el) => {
    el._veSeen = true;
    el.classList.add("ve-will-reveal");
    io.observe(el);
  });
}

function define(name, ctor) {
  if (!customElements.get(name)) customElements.define(name, ctor);
}

export function start() {
  if (window.__veStarted) return cartApi;
  if (!readCatalog()) return null;
  window.__veStarted = true;
  load();
  window.addEventListener("storage", (e) => {
    if (e.key === storageKey) {
      load();
      document.dispatchEvent(new CustomEvent(EVENT, { detail: cartApi.totals() }));
    }
  });
  document.addEventListener("click", onDocumentClick);
  define("ve-cart-button", VeCartButton);
  define("ve-cart", VeCart);
  define("ve-checkout", VeCheckout);
  define("ve-product-card", VeProductCard);
  define("ve-product-grid", VeProductGrid);
  define("ve-product-page", VeProductPage);
  initProductPages();
  initReveal();
  window.veCart = cartApi;
  return cartApi;
}

export { checkoutModeFor };

/**
 * Plain-HTML sites without a build step: <meta name="ve-catalog" content="/ve.catalog.json">.
 * The runtime fetches and validates the raw catalog, injects the theme CSS, then starts.
 */
async function boot() {
  const meta = document.querySelector('meta[name="ve-catalog"]');
  if (meta && !document.querySelector("script[data-ve-catalog]")) {
    try {
      const raw = await (await fetch(meta.content, { cache: "no-cache" })).json();
      const result = validateCatalog(raw);
      if (result.errors) {
        console.error("[ve-backend] VE_CATALOG_INVALID", result.errors);
        return;
      }
      catalog = result.value;
      storageKey = `ve-cart-v1:${(catalog.company?.name || "store").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
      const style = document.createElement("style");
      style.textContent = themeCss(catalog.theme);
      document.head.prepend(style);
    } catch (e) {
      console.error(`[ve-backend] VE_CATALOG_FETCH: could not load ${meta.content}.`, e);
      return;
    }
  }
  start();
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
}
