// ve-backend sales editor UI. Vanilla ESM, no build step.
// Adapted from Hangr's sales editor (public/admin/app.js), extended with categories, options,
// theme customization and a live preview that uses the same renderers as the real site.
import { CARD_STYLES, BUTTON_STYLES, CHECKOUT_MODES, DEFAULT_THEME, slugify, themeCss, validateCatalog } from "/ve/core.js";
import { renderProductCard, renderProductPage, renderProductGrid } from "/ve/render.js";

const $app = document.getElementById("app");
const $toasts = document.getElementById("toasts");
const state = { phase: "loading", catalog: null, saved: "", undoCount: 0, siteUrl: "", uploadBase: "/uploads/", tab: "products", editing: -1, errors: {}, saving: false, previewMode: "card", previewWidth: "desktop" };

const ICON = {
  grip: '<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><circle cx="7" cy="5" r="1.6"/><circle cx="13" cy="5" r="1.6"/><circle cx="7" cy="10" r="1.6"/><circle cx="13" cy="10" r="1.6"/><circle cx="7" cy="15" r="1.6"/><circle cx="13" cy="15" r="1.6"/></svg>',
  up: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5-5 5 5"/></svg>',
  down: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 8l5 5 5-5"/></svg>',
  x: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15"/></svg>',
  plus: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M10 4v12M4 10h12"/></svg>',
  undo: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h8a4 4 0 010 8H8M4 8l3-3M4 8l3 3"/></svg>',
  ext: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 5H5v10h10v-3M11 4h5v5M16 4l-7 7"/></svg>',
};

// ---------- helpers ----------
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "value") el.value = v;
    else if (k === "checked" || k === "disabled" || k === "selected") el[k] = Boolean(v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
}
const clone = (o) => JSON.parse(JSON.stringify(o));
const dirty = () => state.catalog && JSON.stringify(state.catalog) !== state.saved;
const money = (n) => new Intl.NumberFormat(state.catalog?.company?.locale || "en-US", { style: "currency", currency: state.catalog?.company?.currency || "USD" }).format(Number(n) || 0);
const err = (key) => state.errors[key];
const C = () => state.catalog;

function toast(message, kind = "") {
  const t = h("div", { class: `toast ${kind}` }, message);
  $toasts.append(t);
  setTimeout(() => t.remove(), kind === "bad" ? 7000 : 4500);
}
async function api(method, url, body, raw) {
  const res = await fetch(url, { method, credentials: "same-origin", headers: { "X-Requested-With": "ve-editor", ...(body && !raw ? { "Content-Type": "application/json" } : {}) }, body: body ? (raw ? body : JSON.stringify(body)) : undefined });
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  if (res.status === 401 && data.signedOut) {
    state.phase = "signin";
    render();
  }
  if (!res.ok) {
    const e = new Error(data.error || "Something went wrong.");
    e.data = data;
    throw e;
  }
  return data;
}
function confirmDialog({ title, body, yes, danger }) {
  return new Promise((resolve) => {
    const prev = document.activeElement;
    const close = (v) => {
      dlg.remove();
      document.removeEventListener("keydown", onKey, true);
      prev?.focus?.();
      resolve(v);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close(false);
      }
    };
    const cancel = h("button", { class: "btn", type: "button", onclick: () => close(false) }, "Cancel");
    const ok = h("button", { class: `btn ${danger ? "danger" : "primary"}`, type: "button", onclick: () => close(true) }, yes);
    const dlg = h("div", { class: "dlg", role: "alertdialog", "aria-modal": "true", "aria-labelledby": "dlg-t" }, h("div", { class: "dlg-box" }, h("h2", { id: "dlg-t" }, title), h("p", { class: "muted" }, body), h("div", { class: "btns" }, cancel, ok)));
    document.body.append(dlg);
    document.addEventListener("keydown", onKey, true);
    cancel.focus();
  });
}
function moveItem(arr, from, to) {
  if (to < 0 || to >= arr.length || from === to) return false;
  const [x] = arr.splice(from, 1);
  arr.splice(to, 0, x);
  return true;
}

// ---------- data ----------
function load(p) {
  state.catalog = p.catalog;
  state.saved = JSON.stringify(p.catalog);
  state.undoCount = p.undoCount;
  state.siteUrl = p.siteUrl || "";
  state.uploadBase = p.uploadBase || "/uploads/";
  applyTheme();
}
async function boot() {
  try {
    const s = await (await fetch("/api/session", { credentials: "same-origin" })).json();
    if (!s.signedIn) {
      state.phase = "signin";
      return render();
    }
    load(await api("GET", "/api/catalog"));
    state.phase = "ready";
  } catch {
    state.phase = "signin";
  }
  render();
}
async function save() {
  if (state.saving) return;
  state.saving = true;
  render();
  try {
    load(await api("PUT", "/api/catalog", state.catalog));
    state.errors = {};
    toast("Saved. The site updates in a few seconds.", "ok");
  } catch (e) {
    if (e.data?.errors) {
      state.errors = e.data.errors;
      const first = Object.keys(e.data.errors)[0] || "";
      const pm = /^products\.(\d+)\./.exec(first);
      if (pm && state.editing < 0) {
        state.tab = "products";
        toast(`${e.message} (Check “${state.catalog.products[+pm[1]]?.name || "a product"}”.)`, "bad");
      } else {
        const tabFor = { categories: "categories", theme: "look", company: "settings", shop: "settings", checkout: "settings", contact: "settings", announcement: "settings" };
        const t = tabFor[first.split(".")[0]];
        if (t && state.editing < 0) state.tab = t;
        toast(`${e.message} ${Object.values(e.data.errors)[0]}`, "bad");
      }
    } else toast(e.message || "Couldn't save. Please try again.", "bad");
  }
  state.saving = false;
  render();
}
async function undo() {
  const lose = dirty();
  if (!(await confirmDialog({ title: "Undo the last save?", body: lose ? "This puts the site back the way it was before your most recent save. Changes you haven't saved yet will be lost." : "This puts the site back the way it was before your most recent save.", yes: "Undo last save", danger: lose }))) return;
  try {
    load(await api("POST", "/api/undo"));
    state.errors = {};
    state.editing = -1;
    toast("Last save undone. The site updates in a few seconds.", "ok");
  } catch (e) {
    toast(e.message, "bad");
  }
  render();
}
async function discard() {
  if (!(await confirmDialog({ title: "Discard unsaved changes?", body: "Everything you changed since the last save goes back to how it was.", yes: "Discard changes", danger: true }))) return;
  state.catalog = JSON.parse(state.saved);
  state.errors = {};
  state.editing = -1;
  applyTheme();
  render();
}

// ---------- live theme for previews ----------
function applyTheme() {
  const el = document.getElementById("ve-fonts");
  try {
    el.textContent = themeCss({ ...DEFAULT_THEME, ...C().theme, colors: { ...DEFAULT_THEME.colors, ...C().theme?.colors }, fonts: { ...DEFAULT_THEME.fonts, ...C().theme?.fonts }, tints: C().theme?.tints || DEFAULT_THEME.tints, fontFaces: C().theme?.fontFaces || [] }, ".preview-stage");
  } catch {
    /* half-typed theme value: keep the last good CSS */
  }
}
/** A render-safe copy of the catalog (half-typed prices become 0) for the preview. */
function previewCatalog() {
  const c = clone(C());
  c.products.forEach((p, i) => {
    p.price = Number(p.price) || 0;
    if (p.compareAt === "" || p.compareAt == null || !Number(p.compareAt)) delete p.compareAt;
    else p.compareAt = Number(p.compareAt);
    p.slug = p.slug || slugify(p.name) || `product-${i}`;
    p.images = (p.images || []).filter((im) => im.src);
    (p.options || []).forEach((o) => o.values.forEach((v) => (v.priceDelta = Number(v.priceDelta) || 0)));
    if (p.bundle && !Number(p.bundle.count)) delete p.bundle;
  });
  return c;
}

// ---------- rendering ----------
function render() {
  const a = document.activeElement;
  const fk = a?.dataset?.k ? { k: a.dataset.k, s: a.selectionStart, e: a.selectionEnd } : null;
  const y = window.scrollY;
  const drawerScroll = document.querySelector(".drawer-form")?.scrollTop;
  $app.replaceChildren(state.phase === "signin" ? signin() : state.phase === "ready" ? shell() : h("p", { class: "page muted" }, "Loading…"));
  if (fk) {
    const el = $app.querySelector(`[data-k="${CSS.escape(fk.k)}"]`);
    if (el) {
      el.focus({ preventScroll: true });
      try {
        el.setSelectionRange(fk.s, fk.e);
      } catch {
        /* not a text input */
      }
    }
  }
  window.scrollTo(0, y);
  const df = document.querySelector(".drawer-form");
  if (df && drawerScroll) df.scrollTop = drawerScroll;
}
function signin() {
  const msg = h("p", { class: "error", id: "pc-err", role: "alert" });
  const btn = h("button", { class: "btn primary", type: "submit" }, "Sign in");
  const input = h("input", { class: "input", id: "pc", type: "password", name: "passcode", autocomplete: "current-password", required: true, "aria-describedby": "pc-err" });
  const form = h(
    "form",
    {
      onsubmit: async (e) => {
        e.preventDefault();
        btn.disabled = true;
        msg.textContent = "";
        try {
          await api("POST", "/api/login", { passcode: input.value });
          input.value = "";
          load(await api("GET", "/api/catalog"));
          state.phase = "ready";
          render();
        } catch (ex) {
          msg.textContent = ex.message;
          input.classList.add("invalid");
          form.classList.remove("shake");
          void form.offsetWidth;
          form.classList.add("shake");
          btn.disabled = false;
          input.select();
        }
      },
    },
    h("div", { class: "field" }, h("label", { for: "pc" }, "Passcode"), input, h("p", { class: "help" }, "Ask your sales lead if you don't have it."), msg),
    btn,
  );
  setTimeout(() => input.focus(), 0);
  return h("main", { class: "signin" }, h("div", { class: "signin-box" }, h("p", { class: "kicker" }, "ve-backend"), h("h1", {}, "Sales editor"), h("p", { class: "muted" }, "Update products, prices, categories and the look of your store."), form), credit());
}
const credit = () => h("p", { class: "credit" }, "ve-backend · Store UI and sales editor adapted from ", h("strong", {}, "Hangr"), ".");

function shell() {
  const tabs = [["products", "Products"], ["categories", "Categories"], ["look", "Look"], ["settings", "Store settings"]];
  const wrap = h("div", {});
  wrap.append(
    h("header", { class: "topbar" }, h("div", { class: "topbar-in" },
      h("div", { class: "brand" }, h("strong", {}, C().company?.name || "Store"), h("span", {}, "Sales editor")),
      state.siteUrl ? h("a", { class: "btn", href: state.siteUrl, target: "_blank", rel: "noreferrer" }, "View site", h("span", { html: ICON.ext })) : null,
      h("button", { class: "btn quiet", type: "button", onclick: async () => { try { await api("POST", "/api/logout"); } catch (e) { return toast(e.message, "bad"); } state.phase = "signin"; state.catalog = null; render(); } }, "Sign out"))),
    h("main", { class: "page", id: "main" },
      h("div", { class: "tabs", role: "tablist", "aria-label": "Sections" }, tabs.map(([id, label]) => h("button", {
        class: "tab", type: "button", role: "tab", id: `tab-${id}`, "aria-selected": String(state.tab === id), "aria-controls": "tabpanel",
        onclick: () => { state.tab = id; render(); },
        onkeydown: (e) => { const i = tabs.findIndex((t) => t[0] === id); const n = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : null; if (n == null) return; e.preventDefault(); state.tab = tabs[(n + tabs.length) % tabs.length][0]; render(); document.getElementById(`tab-${state.tab}`).focus(); },
      }, label))),
      h("section", { id: "tabpanel", role: "tabpanel", "aria-labelledby": `tab-${state.tab}` }, state.tab === "products" ? productsTab() : state.tab === "categories" ? categoriesTab() : state.tab === "look" ? lookTab() : settingsTab()),
      credit()),
    savebar());
  if (state.editing >= 0 && C().products[state.editing]) wrap.append(drawer());
  return wrap;
}
function savebar() {
  const d = dirty();
  return h("div", { class: "savebar" }, h("div", { class: "savebar-in" },
    h("span", { class: `dirty ${d ? "on" : ""}`, id: "dirty" }, h("i", {}), d ? "You have unsaved changes" : "All changes saved"),
    h("button", { class: "btn quiet", type: "button", id: "discard", disabled: !d, onclick: discard }, "Discard"),
    h("button", { class: "btn spacer", type: "button", disabled: state.undoCount === 0 || state.saving, onclick: undo, id: "undo", title: `${state.undoCount} earlier version${state.undoCount === 1 ? "" : "s"} saved` }, h("span", { html: ICON.undo }), `Undo last save${state.undoCount ? ` (${state.undoCount})` : ""}`),
    h("button", { class: "btn primary", type: "button", id: "save", disabled: !d || state.saving, onclick: save }, state.saving ? h("span", { class: "spin" }) : null, state.saving ? "Saving…" : "Save changes")));
}
function refreshChrome() {
  const d = dirty();
  const el = document.getElementById("dirty");
  if (el) {
    el.className = `dirty ${d ? "on" : ""}`;
    el.lastChild.textContent = d ? "You have unsaved changes" : "All changes saved";
  }
  for (const id of ["save", "discard"]) {
    const b = document.getElementById(id);
    if (b) b.disabled = !d || state.saving;
  }
}
let previewTimer = 0;
function onEdit() {
  refreshChrome();
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    applyTheme();
    document.querySelectorAll("[data-preview]").forEach((el) => el.replaceWith(previewFor(el.dataset.preview)));
    document.querySelectorAll("[data-card]").forEach((card) => {
      const p = C().products[+card.dataset.card];
      if (!p) return;
      card.querySelector("h3").textContent = p.name || "Untitled product";
      card.querySelector(".price").textContent = money(p.price);
    });
    const t = document.getElementById("drawer-t");
    if (t && state.editing >= 0) t.textContent = C().products[state.editing]?.name || "New product";
  }, 60);
}

// ---------- field helpers ----------
function textField({ label, help, key, get, set, errKey, textarea, max, type = "text", attrs = {}, prefix, rows }) {
  const id = `f-${key}`;
  const control = h(textarea ? "textarea" : "input", {
    class: `${textarea ? "textarea" : "input"} ${err(errKey) ? "invalid" : ""}`, id, "data-k": key, type: textarea ? null : type, value: get() ?? "", maxlength: max, rows,
    "aria-invalid": err(errKey) ? "true" : null, "aria-describedby": `${id}-h ${id}-e`,
    oninput: (e) => { set(e.target.value); if (state.errors[errKey]) { delete state.errors[errKey]; e.target.classList.remove("invalid"); const m = document.getElementById(`${id}-e`); if (m) m.textContent = ""; } onEdit(); },
    ...attrs,
  });
  return h("div", { class: "field" }, h("label", { for: id }, label), prefix ? h("div", { class: "money" }, h("span", { "aria-hidden": "true" }, prefix), control) : control, help ? h("p", { class: "help", id: `${id}-h` }, help) : null, h("p", { class: "error", id: `${id}-e`, role: "alert" }, err(errKey) || ""));
}
function moneyField({ label, help, key, errKey, get, set, optional }) {
  const text = new WeakMap();
  return textField({ label, help, key, errKey, prefix: "$", attrs: { inputmode: "decimal", autocomplete: "off" }, get: () => { const v = get(); return v === null || v === undefined ? "" : String(v); }, set: (v) => { const n = Number(v.replace(/[$,\s]/g, "")); set(v.trim() === "" ? (optional ? null : NaN) : Number.isNaN(n) ? v : n); void text; } });
}
function selectField({ label, help, key, errKey, value, options, onchange }) {
  const id = `f-${key}`;
  return h("div", { class: "field" }, h("label", { for: id }, label),
    h("select", { class: "input", id, "data-k": key, onchange: (e) => { onchange(e.target.value); onEdit(); } }, options.map(([v, l]) => h("option", { value: v, selected: v === value }, l))),
    help ? h("p", { class: "help" }, help) : null, h("p", { class: "error", role: "alert" }, err(errKey) || ""));
}
function switchField({ label, checked, onchange, key }) {
  return h("label", { class: "switch" }, h("input", { type: "checkbox", role: "switch", checked, "data-k": key, onchange: (e) => { onchange(e.target.checked); onEdit(); } }), h("span", { class: "track", "aria-hidden": "true" }), h("span", {}, label));
}
function colorField({ label, key, get, set, errKey }) {
  const id = `f-${key}`;
  const text = h("input", { class: `input ${err(errKey) ? "invalid" : ""}`, id, "data-k": key, value: get(), maxlength: 60, autocomplete: "off", spellcheck: "false", oninput: (e) => { set(e.target.value.trim()); if (/^#[0-9a-f]{6}$/i.test(e.target.value.trim())) swatch.value = e.target.value.trim(); onEdit(); } });
  const swatch = h("input", { type: "color", class: "swatch", "aria-label": `${label} color picker`, value: /^#[0-9a-f]{6}$/i.test(get()) ? get() : "#000000", oninput: (e) => { set(e.target.value); text.value = e.target.value; onEdit(); } });
  return h("div", { class: "field" }, h("label", { for: id }, label), h("div", { class: "color-row" }, swatch, text), h("p", { class: "error", role: "alert" }, err(errKey) || ""));
}
function sortable(list, selector, onMove) {
  list.querySelectorAll("[data-grip]").forEach((grip) => {
    const row = grip.closest(selector);
    grip.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      e.preventDefault();
      const i = +row.dataset.i;
      onMove(i, i + (e.key === "ArrowUp" ? -1 : 1), true);
    });
    grip.addEventListener("pointerdown", (e) => {
      if (e.button) return;
      e.preventDefault();
      grip.setPointerCapture(e.pointerId);
      row.classList.add("dragging");
      let target = null;
      const move = (ev) => {
        list.querySelectorAll(".drop-before").forEach((x) => x.classList.remove("drop-before"));
        const over = document.elementsFromPoint(ev.clientX, ev.clientY).map((x) => x.closest?.(selector)).find((x) => x && list.contains(x) && x !== row);
        target = over || null;
        if (over) over.classList.add("drop-before");
        if (ev.clientY < 80) window.scrollBy(0, -12);
        else if (ev.clientY > innerHeight - 100) window.scrollBy(0, 12);
      };
      const up = () => {
        grip.removeEventListener("pointermove", move);
        grip.removeEventListener("pointerup", up);
        grip.removeEventListener("pointercancel", up);
        row.classList.remove("dragging");
        list.querySelectorAll(".drop-before").forEach((x) => x.classList.remove("drop-before"));
        if (target) onMove(+row.dataset.i, +target.dataset.i, false);
      };
      grip.addEventListener("pointermove", move);
      grip.addEventListener("pointerup", up);
      grip.addEventListener("pointercancel", up);
    });
  });
}

// ---------- previews (same renderers as the live site) ----------
function previewFor(kind) {
  const c = previewCatalog();
  let html = "";
  try {
    if (kind === "product") {
      const p = c.products[state.editing];
      html = state.previewMode === "page" ? renderProductPage(c, p.slug, { crumbs: false }) : `<div class="preview-card">${renderProductCard(c, p, { reveal: false })}</div>`;
    } else if (kind === "theme") {
      const sample = c.products.filter((p) => p.visible).slice(0, 3);
      html = sample.length ? renderProductGrid(c, { products: sample, reveal: false }) : "<p>Add a product to preview the look.</p>";
    }
  } catch (e) {
    html = `<p class="error">Preview unavailable: ${String(e.message).replace(/</g, "&lt;")}</p>`;
  }
  const stage = h("div", { class: `preview-stage ${state.previewWidth === "phone" ? "is-phone" : ""}`, html });
  stage.addEventListener("click", (e) => { if (e.target.closest("a,button")) e.preventDefault(); });
  return h("div", { class: "preview-wrap", "data-preview": kind }, stage);
}
function previewPanel(kind, title) {
  const seg = (key, val, label) => h("button", { type: "button", class: "seg-btn", "aria-pressed": String(state[key] === val), onclick: () => { state[key] = val; render(); } }, label);
  return h("div", { class: "preview" },
    h("div", { class: "preview-head" }, h("h3", {}, title),
      h("div", { class: "segs" },
        kind === "product" ? h("div", { class: "seg", role: "group", "aria-label": "Preview" }, seg("previewMode", "card", "Card"), seg("previewMode", "page", "Product page")) : null,
        h("div", { class: "seg", role: "group", "aria-label": "Screen size" }, seg("previewWidth", "desktop", "Desktop"), seg("previewWidth", "phone", "Phone")))),
    previewFor(kind),
    h("p", { class: "help" }, "Live preview. Buttons don't work here. Save to update the real site."));
}

// ---------- products ----------
function productsTab() {
  const ps = C().products;
  const list = h("ul", { class: "list", id: "plist" });
  ps.forEach((p, i) => list.append(productRow(p, i)));
  sortable(list, "li", (from, to, kb) => { if (moveItem(ps, from, to)) { render(); if (kb) document.querySelector(`[data-card="${to}"] [data-grip]`)?.focus(); } });
  const placeholders = ps.filter((p) => p.placeholder).length;
  return h("div", {},
    h("div", { class: "section-head" }, h("div", {}, h("h1", {}, "Products"), h("p", {}, "Everything in your store. Drag to reorder. Tap Edit to change a product and watch the preview update as you type.")),
      h("button", { class: "btn blue", type: "button", id: "add", onclick: addProduct }, h("span", { html: ICON.plus }), "Add product")),
    placeholders ? h("p", { class: "notice" }, `${placeholders} product${placeholders === 1 ? " has a" : "s have"} a placeholder price. Open each one marked “Price to confirm”, set the real price and turn off “Placeholder price”.`) : null,
    ps.length ? list : h("div", { class: "empty" }, "No products yet. Tap “Add product” to create your first one."));
}
function productRow(p, i) {
  const ps = C().products;
  const hasErr = Object.keys(state.errors).some((k) => k.startsWith(`products.${i}.`));
  const name = p.name || "Untitled product";
  const cat = C().categories.find((c) => c.slug === p.category);
  return h("li", { class: `card ${p.visible ? "" : "hidden-product"} ${hasErr ? "has-error" : ""}`, "data-card": i, "data-i": i },
    h("button", { class: "grip", type: "button", "data-grip": true, "aria-label": `Reorder ${name}. Drag, or use the up and down arrow keys.`, html: ICON.grip }),
    h("div", { class: "thumb", "aria-hidden": "true", style: `background:${C().theme?.tints?.[p.tint] || "#eee"}` }, p.images?.[0]?.src ? h("img", { src: p.images[0].src, alt: "", loading: "lazy" }) : (name[0] || "?").toUpperCase()),
    h("div", { class: "info" },
      h("h3", {}, name),
      h("p", { class: "price" }, money(p.price), p.placeholder ? h("span", { class: "tag warn" }, "Price to confirm") : null, cat ? h("span", { class: "tag" }, cat.name) : null),
      h("div", { class: "pills" },
        switchField({ label: "Featured", checked: p.featured, key: `feat-${i}`, onchange: (v) => { p.featured = v; } }),
        switchField({ label: "Shown in store", checked: p.visible, key: `vis-${i}`, onchange: (v) => { p.visible = v; render(); } })),
      hasErr ? h("p", { class: "err-flag" }, "This product needs a quick fix. Tap Edit to see it.") : null),
    h("div", { class: "actions" },
      h("div", { class: "row" },
        h("button", { class: "btn icon", type: "button", disabled: i === 0, "aria-label": `Move ${name} up`, html: ICON.up, onclick: () => { moveItem(ps, i, i - 1); render(); } }),
        h("button", { class: "btn icon", type: "button", disabled: i === ps.length - 1, "aria-label": `Move ${name} down`, html: ICON.down, onclick: () => { moveItem(ps, i, i + 1); render(); } })),
      h("div", { class: "row" },
        h("button", { class: "btn primary", type: "button", "data-k": `edit-${i}`, onclick: () => { state.editing = i; render(); } }, "Edit", h("span", { class: "sr" }, ` ${name}`)),
        h("button", { class: "btn", type: "button", onclick: () => duplicate(i) }, "Duplicate", h("span", { class: "sr" }, ` ${name}`)),
        h("button", { class: "btn danger", type: "button", onclick: () => removeProduct(i) }, "Delete", h("span", { class: "sr" }, ` ${name}`)))));
}
function blankProduct() {
  return { slug: "", name: "New product", category: C().categories[0]?.slug || "", price: 0, badge: "", offer: "", tagline: "", description: "", images: [], tint: Object.keys(C().theme?.tints || {})[0] || "", features: [], options: [], checkout: "", posUrl: "", featured: false, visible: false, placeholder: false };
}
function addProduct() {
  C().products.push(blankProduct());
  state.editing = C().products.length - 1;
  render();
}
function duplicate(i) {
  const c = clone(C().products[i]);
  c.slug = "";
  c.name = `${c.name} copy`.slice(0, 80);
  c.featured = false;
  C().products.splice(i + 1, 0, c);
  toast(`Duplicated. Tap Edit on “${c.name}” to change it.`);
  render();
}
async function removeProduct(i) {
  const p = C().products[i];
  if (!(await confirmDialog({ title: `Delete “${p.name || "this product"}”?`, body: "It disappears from the list now and from the site once you save. You can use “Undo last save” afterwards if you change your mind.", yes: "Delete product", danger: true }))) return false;
  C().products.splice(i, 1);
  state.errors = {};
  state.editing = -1;
  render();
  return true;
}

function drawer() {
  const i = state.editing;
  const p = C().products[i];
  p.images = p.images || [];
  p.options = p.options || [];
  p.features = p.features || [];
  const close = () => { state.editing = -1; document.removeEventListener("keydown", onKey); render(); document.querySelector(`[data-k="edit-${i}"]`)?.focus(); };
  const eKey = (f) => `products.${i}.${f}`;
  const tf = (o) => textField({ ...o, key: `p${i}-${o.field}`, errKey: eKey(o.field), get: () => p[o.field], set: (v) => { p[o.field] = v; } });
  const tints = Object.keys(C().theme?.tints || {});

  // features
  const chipInput = h("input", { class: "input", id: "feat-new", "data-k": "feat-new", placeholder: "e.g. Pollen-free", maxlength: 120, "aria-label": "New highlight", onkeydown: (e) => { if (e.key === "Enter") { e.preventDefault(); addFeature(); } } });
  const addFeature = () => { const v = chipInput.value.trim(); if (!v) return; p.features.push(v); render(); document.getElementById("feat-new")?.focus(); };
  const feats = h("div", { class: "field" }, h("span", { class: "lbl", id: "feat-l" }, "Highlights"),
    h("p", { class: "help" }, "Short points shown on the product page. Press Enter to add one."),
    h("div", { class: "chips", role: "list", "aria-labelledby": "feat-l" }, p.features.map((f, fi) => h("span", { class: "chip", role: "listitem" }, f, h("button", { type: "button", "aria-label": `Remove ${f}`, html: ICON.x, onclick: () => { p.features.splice(fi, 1); render(); } })))),
    h("div", { class: "addrow" }, chipInput, h("button", { class: "btn", type: "button", onclick: addFeature }, "Add")),
    h("p", { class: "error", role: "alert" }, err(eKey("features")) || ""));

  // photos
  const photoMsg = h("p", { class: "error", role: "alert" }, err(eKey("images")) || "");
  async function upload(file) {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { photoMsg.textContent = "That photo is over 8 MB. Please choose a smaller one."; return; }
    if (!/^image\/(jpeg|png|webp|avif)$/.test(file.type)) { photoMsg.textContent = "Please choose a JPG, PNG, WebP or AVIF photo."; return; }
    photoMsg.textContent = "Uploading…";
    try {
      const r = await api("POST", `/api/upload?slug=${encodeURIComponent(p.slug || slugify(p.name))}`, file, true);
      p.images.push({ src: r.path, alt: p.name });
      delete state.errors[eKey("images")];
      render();
    } catch (ex) { photoMsg.textContent = ex.message; }
  }
  const drop = h("label", { class: "drop", ondragover: (e) => { e.preventDefault(); drop.classList.add("over"); }, ondragleave: () => drop.classList.remove("over"), ondrop: (e) => { e.preventDefault(); drop.classList.remove("over"); upload(e.dataTransfer.files[0]); } },
    h("input", { type: "file", accept: "image/jpeg,image/png,image/webp,image/avif", "aria-label": "Upload a photo", onchange: (e) => upload(e.target.files[0]) }),
    h("strong", {}, "Drop a photo here, or tap to choose"), h("span", { class: "help" }, "JPG, PNG, WebP or AVIF, up to 8 MB. Transparent PNG/WebP looks best on tinted cards."));
  const photos = h("div", { class: "field" }, h("span", { class: "lbl" }, "Photos"),
    h("ul", { class: "photos" }, p.images.map((im, j) => h("li", { class: "photo" },
      h("div", { class: "pimg", style: `background:${C().theme?.tints?.[p.tint] || "#eee"}` }, h("img", { src: im.src, alt: "" })),
      h("div", { class: "photo-fields" },
        textField({ label: `Photo ${j + 1} description`, help: j === 0 ? "Main photo. Describe it for screen readers." : "", key: `p${i}-img${j}-alt`, errKey: "", max: 160, get: () => im.alt, set: (v) => { im.alt = v; } }),
        textField({ label: "Image address", key: `p${i}-img${j}-src`, errKey: "", max: 500, get: () => im.src, set: (v) => { im.src = v; }, attrs: { autocomplete: "off", spellcheck: "false" } }),
        h("div", { class: "btns" },
          h("button", { class: "btn icon", type: "button", disabled: j === 0, "aria-label": "Move photo earlier", html: ICON.up, onclick: () => { moveItem(p.images, j, j - 1); render(); } }),
          h("button", { class: "btn icon", type: "button", disabled: j === p.images.length - 1, "aria-label": "Move photo later", html: ICON.down, onclick: () => { moveItem(p.images, j, j + 1); render(); } }),
          h("button", { class: "btn danger", type: "button", onclick: () => { p.images.splice(j, 1); render(); } }, "Remove photo")))))),
    drop,
    h("button", { class: "btn quiet", type: "button", onclick: () => { p.images.push({ src: "/assets/img/", alt: p.name }); render(); } }, "Use an image already on the site"),
    photoMsg);

  // options
  const opts = h("div", { class: "field" }, h("span", { class: "lbl" }, "Options"),
    h("p", { class: "help" }, "Choices shoppers pick before adding to cart, like Scent or Size. A price change adds to (or takes off) the base price."),
    p.options.map((o, oi) => h("div", { class: "opt-card" },
      h("div", { class: "opt-head" },
        textField({ label: "Option name", key: `p${i}-o${oi}-name`, errKey: eKey(`options.${oi}.name`), max: 30, get: () => o.name, set: (v) => { o.name = v; } }),
        h("button", { class: "btn danger", type: "button", onclick: () => { p.options.splice(oi, 1); render(); } }, "Remove option")),
      h("ul", { class: "opt-values" }, o.values.map((v, vi) => h("li", {},
        textField({ label: "Choice", key: `p${i}-o${oi}-v${vi}`, errKey: "", max: 40, get: () => v.label, set: (x) => { v.label = x; } }),
        moneyField({ label: "Price change", key: `p${i}-o${oi}-d${vi}`, errKey: "", get: () => v.priceDelta || 0, set: (x) => { v.priceDelta = x; } }),
        h("button", { class: "btn icon danger", type: "button", "aria-label": `Remove choice ${v.label}`, html: ICON.x, onclick: () => { o.values.splice(vi, 1); render(); } })))),
      h("button", { class: "btn", type: "button", onclick: () => { o.values.push({ label: "", priceDelta: 0 }); render(); } }, h("span", { html: ICON.plus }), "Add choice"),
      h("p", { class: "error", role: "alert" }, err(eKey(`options.${oi}.values`)) || ""))),
    p.options.length < 4 ? h("button", { class: "btn", type: "button", onclick: () => { p.options.push({ name: "", values: [{ label: "", priceDelta: 0 }] }); render(); } }, h("span", { html: ICON.plus }), "Add option") : null);

  const bundleOn = Boolean(p.bundle);
  const form = h("div", { class: "drawer-form" },
    tf({ field: "name", label: "Product name", help: "The name shoppers see.", max: 80 }),
    tf({ field: "tagline", label: "Short tagline", help: "One line under the name.", max: 140 }),
    h("div", { class: "grid2" },
      moneyField({ label: "Price", help: "For example 39 or 39.99.", key: `p${i}-price`, errKey: eKey("price"), get: () => p.price, set: (v) => { p.price = v; } }),
      moneyField({ label: "Compare-at price (optional)", help: "Shown crossed out, like a regular price.", key: `p${i}-compare`, errKey: eKey("compareAt"), optional: true, get: () => p.compareAt, set: (v) => { if (v === null) delete p.compareAt; else p.compareAt = v; } })),
    h("div", { class: "field" }, switchField({ label: "Placeholder price (not confirmed yet)", checked: p.placeholder, key: `p${i}-ph`, onchange: (v) => { p.placeholder = v; } }), h("p", { class: "help" }, "Turn off once the real price is set. Placeholder products show “Price to confirm” in this list.")),
    h("div", { class: "grid2" },
      selectField({ label: "Category", key: `p${i}-cat`, errKey: eKey("category"), value: p.category, options: [["", "No category"], ...C().categories.map((c) => [c.slug, c.name])], onchange: (v) => { p.category = v; } }),
      selectField({ label: "Card background", help: "Tint behind the photo.", key: `p${i}-tint`, errKey: eKey("tint"), value: p.tint, options: [["", "Default"], ...tints.map((t) => [t, t])], onchange: (v) => { p.tint = v; } })),
    h("div", { class: "grid2" },
      tf({ field: "badge", label: "Badge (optional)", help: "A small tag on the photo, like “Best value”.", max: 24 }),
      tf({ field: "offer", label: "Offer (optional)", help: "Shown beside the price, like “25% off”.", max: 30 })),
    tf({ field: "description", label: "Description", help: "A few sentences for the product page. Leave a blank line between paragraphs.", textarea: true, max: 1200, rows: 5 }),
    feats, photos, opts,
    h("div", { class: "field" }, switchField({ label: "Sold as a bundle", checked: bundleOn, key: `p${i}-bundle`, onchange: (v) => { if (v) p.bundle = { count: 2, unit: "items" }; else delete p.bundle; render(); } }),
      bundleOn ? h("div", { class: "grid2" },
        textField({ label: "How many in the bundle", key: `p${i}-bcount`, errKey: eKey("bundle.count"), max: 4, attrs: { inputmode: "numeric" }, get: () => p.bundle.count, set: (v) => { p.bundle.count = Number(v) || v; } }),
        textField({ label: "Unit name (plural)", help: "For example bouquets. Used for “$32.86 per bouquet”.", key: `p${i}-bunit`, errKey: eKey("bundle.unit"), max: 30, get: () => p.bundle.unit, set: (v) => { p.bundle.unit = v; } })) : null),
    h("div", { class: "grid2" },
      selectField({ label: "Checkout", help: "Store default comes from Store settings.", key: `p${i}-ck`, errKey: eKey("checkout"), value: p.checkout || "", options: [["", "Store default"], ["demo", "Demo checkout"], ["pos", "VE Trade Show POS"], ["both", "Both"]], onchange: (v) => { p.checkout = v; } }),
      tf({ field: "posUrl", label: "POS link (optional)", help: "Only if this product uses a different POS link.", max: 500, type: "url", attrs: { inputmode: "url", autocomplete: "off" } })),
    textField({ label: "Web address", help: `Shown as ${C().shop?.basePath || "/shop/"}${p.slug || slugify(p.name) || "…"}/. Lowercase words and dashes. Leave empty to make one from the name.`, key: `p${i}-slug`, errKey: eKey("slug"), max: 60, get: () => p.slug, set: (v) => { p.slug = v.trim(); }, attrs: { autocomplete: "off", spellcheck: "false" } }),
    h("div", { class: "field" },
      switchField({ label: "Featured", checked: p.featured, key: "d-feat", onchange: (v) => { p.featured = v; } }),
      switchField({ label: "Shown in store", checked: p.visible, key: "d-vis", onchange: (v) => { p.visible = v; } }),
      h("p", { class: "help" }, "Turn off “Shown in store” to hide a product without deleting it.")));

  const onKey = (e) => { if (e.key === "Escape" && !document.querySelector(".dlg")) close(); };
  document.addEventListener("keydown", onKey);
  const dr = h("aside", { class: "drawer", role: "dialog", "aria-modal": "true", "aria-labelledby": "drawer-t" },
    h("div", { class: "drawer-head" }, h("h2", { id: "drawer-t", tabindex: "-1" }, p.name || "New product"), h("button", { class: "btn primary", type: "button", id: "done", onclick: close }, "Done")),
    h("div", { class: "drawer-body" }, form, previewPanel("product", "How it looks on the site")),
    h("div", { class: "drawer-foot" }, h("p", { class: "help" }, "Changes here are not live until you press “Save changes”."), h("button", { class: "btn danger", type: "button", onclick: async () => { document.removeEventListener("keydown", onKey); await removeProduct(i); } }, "Delete product")));
  const holder = h("div", {});
  holder.append(h("div", { class: "scrim", onclick: close }), dr);
  if (!document.activeElement?.dataset?.k?.startsWith(`p${i}`)) setTimeout(() => { const n = dr.querySelector(`[data-k="p${i}-name"]`); if (n && !dr.contains(document.activeElement)) n.focus({ preventScroll: true }); }, 0);
  return holder;
}

// ---------- categories ----------
function categoriesTab() {
  const cs = C().categories;
  const list = h("div", { id: "clist" });
  cs.forEach((c, i) => {
    const used = C().products.filter((p) => p.category === c.slug).length;
    const f = (field, label, extra = {}) => textField({ label, key: `c${i}-${field}`, errKey: `categories.${i}.${field}`, get: () => c[field], set: (v) => { c[field] = v; }, ...extra });
    list.append(h("div", { class: "row-card", "data-i": i },
      h("button", { class: "grip", type: "button", "data-grip": true, "aria-label": `Reorder ${c.name || "category"}. Drag, or use the up and down arrow keys.`, html: ICON.grip }),
      h("div", { class: "row-fields" },
        h("div", { class: "grid2" }, f("name", "Name", { max: 40 }), f("slug", "Web address", { max: 60, help: `${C().shop?.basePath || "/shop/"}${c.slug || "…"}/`, attrs: { autocomplete: "off", spellcheck: "false" } })),
        h("div", { class: "grid2" }, f("eyebrow", "Eyebrow (optional)", { max: 60, help: "Small italic line above the heading." }), f("title", "Page heading (optional)", { max: 80 })),
        f("description", "Description", { textarea: true, max: 400, rows: 2 }),
        f("note", "Note (optional)", { max: 240, help: "Small highlighted note above the products." }),
        h("div", { class: "grid2" }, f("image", "Art image (optional)", { max: 500, help: "Small image above the page heading, like /assets/img/rose.webp." }), switchField({ label: "Shown in store", checked: c.visible !== false, key: `c${i}-vis`, onchange: (v) => { c.visible = v; } })),
        h("p", { class: "help" }, `${used} product${used === 1 ? "" : "s"} in this category.`)),
      h("div", { class: "btnrow" },
        h("button", { class: "btn icon", type: "button", disabled: i === 0, "aria-label": `Move ${c.name} up`, html: ICON.up, onclick: () => { moveItem(cs, i, i - 1); render(); } }),
        h("button", { class: "btn icon", type: "button", disabled: i === cs.length - 1, "aria-label": `Move ${c.name} down`, html: ICON.down, onclick: () => { moveItem(cs, i, i + 1); render(); } }),
        h("button", { class: "btn icon danger", type: "button", "aria-label": `Remove ${c.name || "category"}`, html: ICON.x, onclick: async () => {
          if (!(await confirmDialog({ title: `Remove “${c.name || "this category"}”?`, body: used ? `${used} product${used === 1 ? "" : "s"} will move to “No category”. Nothing is deleted.` : "Its page goes away once you save.", yes: "Remove category", danger: true }))) return;
          C().products.forEach((p) => { if (p.category === c.slug) p.category = ""; });
          cs.splice(i, 1);
          render();
        } }))));
  });
  sortable(list, ".row-card", (from, to, kb) => { if (moveItem(cs, from, to)) { render(); if (kb) document.querySelectorAll("#clist [data-grip]")[to]?.focus(); } });
  return h("div", {},
    h("div", { class: "section-head" }, h("div", {}, h("h1", {}, "Categories"), h("p", {}, "Each category gets its own shop page and a tab on the main shop page. Drag to reorder.")),
      h("button", { class: "btn blue", type: "button", onclick: () => { cs.push({ slug: "", name: "", eyebrow: "", title: "", description: "", note: "", image: "", tint: "", visible: true }); render(); document.querySelector(`[data-k="c${cs.length - 1}-name"]`)?.focus(); } }, h("span", { html: ICON.plus }), "Add category")),
    h("div", { class: "panel" }, cs.length ? list : h("p", { class: "muted" }, "No categories yet."), err("categories") ? h("p", { class: "error" }, err("categories")) : null));
}

// ---------- look (theme) ----------
function lookTab() {
  const t = (C().theme = C().theme || clone(DEFAULT_THEME));
  t.colors = { ...DEFAULT_THEME.colors, ...t.colors };
  t.fonts = { ...DEFAULT_THEME.fonts, ...t.fonts };
  t.tints = t.tints || { ...DEFAULT_THEME.tints };
  const colorLabels = { background: "Page background", surface: "Panels (buy box, cart summary)", text: "Body text", muted: "Secondary text", heading: "Headings and product names", accent: "Buttons", accentText: "Button text", accentHover: "Button hover", badge: "Badge background", badgeText: "Badge text", sale: "Sale and errors", border: "Lines and borders", focus: "Keyboard focus ring" };
  const seg = (label, key, list, names = {}) => h("div", { class: "field" }, h("span", { class: "lbl" }, label), h("div", { class: "seg", role: "group", "aria-label": label }, list.map((v) => h("button", { type: "button", class: "seg-btn", "aria-pressed": String(t[key] === v), onclick: () => { t[key] = v; render(); } }, names[v] || v))));
  const tintNames = Object.keys(t.tints);
  return h("div", { class: "look" },
    h("div", { class: "section-head" }, h("div", {}, h("h1", {}, "Look"), h("p", {}, "Colors, fonts and card shapes. The preview uses your real products."))),
    h("div", { class: "look-grid" },
      h("div", {},
        h("div", { class: "panel" }, h("h2", { class: "panel-title" }, "Cards"),
          seg("Card shape", "card", CARD_STYLES, { arch: "Arch", rounded: "Rounded card", flat: "Flat" }),
          seg("Button shape", "button", BUTTON_STYLES, { pill: "Pill", rounded: "Rounded", square: "Square" }),
          seg("Photo fit", "imageFit", ["contain", "cover"], { contain: "Whole photo", cover: "Fill the frame" }),
          textField({ label: "Photo size inside the frame", help: "0.4 to 1. Use about 0.76 for cut-out photos on arch cards.", key: "t-scale", errKey: "theme.imageScale", max: 4, attrs: { inputmode: "decimal" }, get: () => t.imageScale, set: (v) => { t.imageScale = Number(v) || v; } }),
          textField({ label: "Corner radius", help: "For example 16px.", key: "t-radius", errKey: "theme.radius", max: 8, get: () => t.radius, set: (v) => { t.radius = v; } }),
          h("div", { class: "field" }, switchField({ label: "Entrance and hover motion", checked: t.motion !== false, key: "t-motion", onchange: (v) => { t.motion = v; } }), h("p", { class: "help" }, "Always off for visitors who ask their device for reduced motion."))),
        h("div", { class: "panel" }, h("h2", { class: "panel-title" }, "Colors"), h("div", { class: "grid2" }, Object.keys(DEFAULT_THEME.colors).map((k) => colorField({ label: colorLabels[k] || k, key: `t-c-${k}`, errKey: `theme.colors.${k}`, get: () => t.colors[k], set: (v) => { t.colors[k] = v; } })))),
        h("div", { class: "panel" }, h("h2", { class: "panel-title" }, "Card backgrounds"), h("p", { class: "help" }, "Named tints you can pick per product (Card background)."),
          h("ul", { class: "tints" }, tintNames.map((name) => h("li", {},
            colorField({ label: name, key: `t-t-${name}`, errKey: `theme.tints.${name}`, get: () => t.tints[name], set: (v) => { t.tints[name] = v; } }),
            tintNames.length > 1 ? h("button", { class: "btn icon danger", type: "button", "aria-label": `Remove tint ${name}`, html: ICON.x, onclick: () => { delete t.tints[name]; render(); } }) : null))),
          h("button", { class: "btn", type: "button", onclick: async () => { const name = slugify(prompt("Name for the new tint (for example sky):") || ""); if (!name) return; t.tints[name] = "#eeeeee"; render(); } }, h("span", { html: ICON.plus }), "Add tint")),
        h("div", { class: "panel" }, h("h2", { class: "panel-title" }, "Fonts"),
          ["display", "body", "accent"].map((k) => textField({ label: { display: "Headings", body: "Body text", accent: "Accent (italic eyebrows, offers)" }[k], help: "A CSS font list, like \"Higuen\", Georgia, serif.", key: `t-f-${k}`, errKey: `theme.fonts.${k}`, max: 200, get: () => t.fonts[k], set: (v) => { t.fonts[k] = v; } })),
          h("p", { class: "help" }, "Font files your site already loads work here. To bundle a font with the store styles, add it under theme.fontFaces in the catalog file."))),
      previewPanel("theme", "Preview")));
}

// ---------- settings ----------
function settingsTab() {
  const c = C();
  const group = (obj, prefix, field, label, extra = {}) => textField({ label, key: `${prefix}-${field}`, errKey: `${prefix}.${field}`, get: () => obj[field], set: (v) => { obj[field] = v; }, ...extra });
  const ck = c.checkout;
  return h("div", {},
    h("div", { class: "section-head" }, h("div", {}, h("h1", {}, "Store settings"), h("p", {}, "Company details, checkout and contact info."))),
    h("div", { class: "panel" }, h("h2", { class: "panel-title" }, "Checkout"),
      h("div", { class: "field" }, h("span", { class: "lbl" }, "How shoppers pay"), h("div", { class: "radios" }, CHECKOUT_MODES.map((m) => h("label", { class: "radio" }, h("input", { type: "radio", name: "ck-mode", value: m, checked: ck.mode === m, onchange: () => { ck.mode = m; onEdit(); render(); } }),
        h("span", {}, h("strong", {}, { demo: "Demo checkout", pos: "VE Trade Show POS", both: "Both" }[m]), h("small", {}, { demo: "Practice form with an order confirmation. No real payment.", pos: "Checkout sends shoppers to your VE Trade Show POS new-sale page.", both: "POS button first, demo form below it." }[m]))))),
        h("p", { class: "error", role: "alert" }, err("checkout.mode") || "")),
      group(ck, "checkout", "posUrl", "VE Trade Show POS new-sale link", { help: "Looks like https://portal.veinternational.org/tradeshowpos/…/newsale/", max: 500, type: "url", attrs: { inputmode: "url", autocomplete: "off" } }),
      h("div", { class: "grid2" }, group(ck, "checkout", "posLabel", "POS button label", { max: 40 }), group(ck, "checkout", "orderPrefix", "Demo order number prefix", { max: 6, help: "For example EB gives EB-7K2M9Q." })),
      group(ck, "checkout", "note", "Educational note", { max: 240, help: "Shown under buy buttons and on checkout." })),
    h("div", { class: "panel" }, h("h2", { class: "panel-title" }, "Company"),
      h("div", { class: "grid2" }, group(c.company, "company", "name", "Company name", { max: 80 }), group(c.company, "company", "tagline", "Tagline", { max: 140 })),
      h("div", { class: "grid2" }, group(c.company, "company", "currency", "Currency", { max: 3, help: "3-letter code, like USD." }), group(c.company, "company", "url", "Website (optional)", { max: 500, type: "url", help: "Used for product search previews." }))),
    h("div", { class: "panel" }, h("h2", { class: "panel-title" }, "Shop page"),
      h("div", { class: "grid2" }, group(c.shop, "shop", "title", "Shop title", { max: 60 }), group(c.shop, "shop", "allLabel", "“All” tab label", { max: 40 })),
      group(c.shop, "shop", "intro", "Shop intro", { textarea: true, max: 300, rows: 2 })),
    h("div", { class: "panel" }, h("h2", { class: "panel-title" }, "Contact"),
      h("div", { class: "grid2" }, group(c.contact, "contact", "email", "Email", { max: 120, type: "email" }), group(c.contact, "contact", "phone", "Phone", { max: 30, type: "tel" })),
      h("div", { class: "grid2" }, group(c.contact, "contact", "hours", "Hours", { max: 80 }), group(c.contact, "contact", "location", "Location", { max: 120 })),
      group(c.contact, "contact", "instagram", "Instagram link", { max: 500, type: "url" })),
    h("div", { class: "panel" }, h("h2", { class: "panel-title" }, "Announcement"),
      h("div", { class: "field" }, switchField({ label: "Show the announcement", checked: c.announcement.enabled, key: "a-enabled", onchange: (v) => { c.announcement.enabled = v; } })),
      group(c.announcement, "announcement", "text", "Message", { max: 140 }),
      h("div", { class: "grid2" }, group(c.announcement, "announcement", "linkLabel", "Link label (optional)", { max: 30 }), group(c.announcement, "announcement", "link", "Link (optional)", { max: 500 }))));
}

document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "s" && state.phase === "ready") {
    e.preventDefault();
    if (dirty()) save();
  }
});
window.addEventListener("beforeunload", (e) => {
  if (state.phase === "ready" && dirty()) {
    e.preventDefault();
    e.returnValue = "";
  }
});
void validateCatalog;
boot();
