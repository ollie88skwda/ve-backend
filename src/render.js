// ve-backend renderers: catalog -> HTML strings. Isomorphic (Node, browser, any framework).
// Astro components call these with set:html; the browser runtime and the editor preview use the same
// functions, so every surface shows identical markup. UI adapted from Hangr's store components.
import {
  cartTotals,
  categoryUrl,
  buyLinkFor,
  cartEnabled,
  checkoutModeFor,
  defaultSelection,
  findCategory,
  formatMoney,
  perUnit,
  posUrlFor,
  productUrl,
  savingsPercent,
  unitPrice,
  visibleProducts,
  MAX_QUANTITY,
} from "./core.js";

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
const attrs = (o = {}) =>
  Object.entries(o)
    .filter(([, v]) => v !== false && v !== null && v !== undefined)
    .map(([k, v]) => (v === true ? ` ${k}` : ` ${k}="${esc(v)}"`))
    .join("");

export const ICONS = {
  arrow: '<svg class="ve-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  bag: '<svg class="ve-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8L5 8Z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/></svg>',
  check: '<svg class="ve-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  plus: '<span class="ve-plus" aria-hidden="true"></span>',
  external: '<svg class="ve-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 5H5v14h14v-5M14 4h6v6M20 4l-9 9"/></svg>',
};

const tintVar = (catalog, name) => {
  const tints = catalog.theme?.tints || {};
  const key = name && Object.prototype.hasOwnProperty.call(tints, name) ? name : Object.keys(tints)[0] || "default";
  return `var(--ve-tint-${key})`;
};
const firstImage = (p) => p.images?.[0] || null;
const money = (catalog, v) => esc(formatMoney(catalog, v));

/** Visual box: photo on a tinted background in the theme's card shape, or a text tile. */
export function renderVisual(catalog, product, { className = "", loading = "lazy", image } = {}) {
  const img = image || firstImage(product);
  const style = `--ve-tint:${tintVar(catalog, product.tint)}`;
  const inner = img
    ? `<img src="${esc(img.src)}" alt="${esc(img.alt || "")}" loading="${loading}" decoding="async">`
    : `<span class="ve-visual-text">${esc(product.name)}</span>`;
  return `<div class="ve-visual ${className}" style="${style}">${inner}</div>`;
}

export function renderPrice(catalog, product, { size = "", unit, countUp = false } = {}) {
  const price = unit ?? product.price;
  const save = savingsPercent(product);
  return `<p class="ve-price ${size}"><span class="ve-price-now" data-ve-price${countUp ? ` data-count="${price}"` : ""}>${money(catalog, price)}</span>${
    product.compareAt ? `<s class="ve-price-was"><span class="ve-sr">Was </span>${money(catalog, product.compareAt)}</s>` : ""
  }${product.offer ? `<span class="ve-offer">${esc(product.offer)}</span>` : save ? `<span class="ve-offer">Save ${save}%</span>` : ""}</p>`;
}

const productCheckout = (catalog, product) => product.checkout || catalog.checkout.mode;
const productPos = (catalog, product) => product.posUrl || catalog.checkout.posUrl;

/**
 * Product card. Options: { headingLevel=3, loading, actions=true, buyNow (auto when POS), reveal, className, cardStyle }
 */
export function renderProductCard(catalog, product, opts = {}) {
  const h = `h${opts.headingLevel || 3}`;
  const url = productUrl(catalog, product);
  const mode = productCheckout(catalog, product);
  const pos = productPos(catalog, product);
  const showBuy = (opts.buyNow ?? mode !== "demo") && pos;
  const each = perUnit(product);
  const card = opts.cardStyle || catalog.theme?.card || "rounded";
  const hasOptions = (product.options || []).length > 0;
  const bundleLine = product.bundle
    ? `<p class="ve-card-meta"><strong>${esc(product.bundle.count)}</strong> ${esc(product.bundle.unit)}${product.tagline ? ` · ${esc(product.tagline)}` : ""}</p>`
    : product.tagline
      ? `<p class="ve-card-meta">${esc(product.tagline)}</p>`
      : "";
  const noCart = !cartEnabled(catalog);
  const buy = buyLinkFor(catalog, product);
  const actions =
    opts.actions === false
      ? ""
      : noCart
        ? `<div class="ve-card-actions"><a class="ve-button" href="${esc(buy.href)}"${buy.pos ? ` data-ve-pos="${esc(product.slug)}" target="_blank" rel="noreferrer"` : ""}>Buy now${buy.pos ? ICONS.external : ICONS.arrow}<span class="ve-sr">: ${esc(product.name)}</span></a></div>`
        : `<div class="ve-card-actions">${
          showBuy
            ? `<a class="ve-button" href="${esc(pos)}" data-ve-pos="${esc(product.slug)}">Buy now ${ICONS.arrow}</a>`
            : ""
        }${
          hasOptions
            ? `<a class="ve-button ${showBuy ? "ve-button--ghost" : ""}" href="${esc(url)}">Choose options<span class="ve-sr">: ${esc(product.name)}</span></a>`
            : `<button type="button" class="ve-button ${showBuy ? "ve-button--ghost" : ""}" data-ve-add="${esc(product.slug)}">${ICONS.bag}<span data-ve-label>Add to cart</span><span class="ve-sr">: ${esc(product.name)}</span></button>`
        }</div>`;
  return `<article class="ve-card ve-card--${esc(card)}${opts.className ? ` ${esc(opts.className)}` : ""}" data-ve-card="${esc(product.slug)}"${opts.reveal === false ? "" : " data-ve-reveal"}>
<a class="ve-card-media" href="${esc(url)}" tabindex="-1" aria-hidden="true">${product.badge ? `<span class="ve-badge">${esc(product.badge)}</span>` : ""}${renderVisual(catalog, product, { loading: opts.loading })}</a>
<div class="ve-card-body">
<${h} class="ve-card-title"><a href="${esc(url)}">${esc(product.name)}</a></${h}>
${bundleLine}
${renderPrice(catalog, product, { countUp: opts.countUp })}
${each ? `<p class="ve-card-each">${money(catalog, each)} per ${esc(singular(product.bundle.unit))}</p>` : ""}
${product.placeholder ? PLACEHOLDER : ""}
${actions}
</div>
</article>`;
}

const PLACEHOLDER = `<p class="ve-placeholder">Placeholder price, to be confirmed</p>`;
const singular = (unit) => String(unit || "item").replace(/(ies)$/, "y").replace(/([^s])s$/, "$1");

/** Grid of product cards. Options: { category, products, limit, columns, headingLevel, reveal, className, cardStyle, emptyText } */
export function renderProductGrid(catalog, opts = {}) {
  let list = opts.products || visibleProducts(catalog, opts.category);
  if (opts.featured) list = list.filter((p) => p.featured);
  if (opts.limit) list = list.slice(0, opts.limit);
  if (!list.length) return `<p class="ve-empty-note">${esc(opts.emptyText || "New products are coming soon.")}</p>`;
  const cols = opts.columns ? ` style="--ve-columns:${Number(opts.columns)}"` : "";
  return `<ul class="ve-grid${opts.className ? ` ${esc(opts.className)}` : ""}"${cols}${opts.gridAttrs ? attrs(opts.gridAttrs) : ""}>${list
    .map((p, i) => `<li style="--ve-i:${i}">${renderProductCard(catalog, p, { ...opts, loading: i < 3 && opts.eager ? "eager" : "lazy" })}</li>`)
    .join("")}</ul>`;
}

/** Category tabs: All + each visible category with products. */
export function renderCategoryNav(catalog, active = "") {
  const cats = catalog.categories.filter((c) => c.visible !== false && visibleProducts(catalog, c.slug).length);
  if (cats.length < 2) return "";
  const item = (href, label, on) => `<li><a href="${esc(href)}"${on ? ' aria-current="page"' : ""}>${esc(label)}</a></li>`;
  return `<nav class="ve-tabs" aria-label="Shop categories"><ul>${item(catalog.shop.basePath, catalog.shop.allLabel, !active)}${cats
    .map((c) => item(categoryUrl(catalog, c), c.name, c.slug === active))
    .join("")}</ul></nav>`;
}

/** Whole shop index: category tabs + one section per category. */
export function renderShopIndex(catalog, opts = {}) {
  const cats = catalog.categories.filter((c) => c.visible !== false && visibleProducts(catalog, c.slug).length);
  const loose = visibleProducts(catalog).filter((p) => !p.category || !cats.some((c) => c.slug === p.category));
  const sections = cats
    .map(
      (c) => `<section class="ve-section" aria-labelledby="ve-cat-${esc(c.slug)}">
<div class="ve-section-head"><div>${c.eyebrow ? `<p class="ve-eyebrow">${esc(c.eyebrow)}</p>` : ""}<h2 id="ve-cat-${esc(c.slug)}">${esc(c.name)}</h2>${c.description ? `<p class="ve-section-lede">${esc(c.description)}</p>` : ""}</div><a class="ve-text-link" href="${esc(categoryUrl(catalog, c))}">See all ${esc(c.name.toLowerCase())}</a></div>
${renderProductGrid(catalog, { ...opts, category: c.slug, headingLevel: 3 })}
</section>`,
    )
    .join("");
  const rest = loose.length ? `<section class="ve-section">${renderProductGrid(catalog, { ...opts, products: loose })}</section>` : "";
  return `${opts.tabs === false ? "" : renderCategoryNav(catalog, "")}${sections}${rest}`;
}

export function renderCategoryPage(catalog, slug, opts = {}) {
  const c = findCategory(catalog, slug);
  if (!c) return "";
  return `${opts.tabs === false ? "" : renderCategoryNav(catalog, slug)}${c.note ? `<p class="ve-category-note">${esc(c.note)}</p>` : ""}${renderProductGrid(catalog, { ...opts, category: slug, headingLevel: 2 })}`;
}

export function renderStepper(label, value = 1) {
  return `<div class="ve-stepper" role="group" aria-label="${esc(label)}" data-ve-stepper><button type="button" data-ve-step="-1" aria-label="Decrease quantity"${value <= 1 ? " disabled" : ""}>−</button><output aria-live="polite" data-ve-qty>${esc(value)}</output><button type="button" data-ve-step="1" aria-label="Increase quantity"${value >= MAX_QUANTITY ? " disabled" : ""}>+</button></div>`;
}

export function renderOptions(catalog, product, selection = defaultSelection(product), prefix = "opt") {
  return (product.options || [])
    .map(
      (o, i) => `<fieldset class="ve-options"><legend>${esc(o.name)}</legend><div class="ve-option-list">${o.values
        .map(
          (v) =>
            `<label class="ve-option"><input type="radio" name="${esc(`${prefix}-${product.slug}-${i}`)}" data-ve-option="${esc(o.name)}" value="${esc(v.label)}"${selection[o.name] === v.label ? " checked" : ""}><span>${esc(v.label)}${
              v.priceDelta ? ` <small>${v.priceDelta > 0 ? "+" : "−"}${money(catalog, Math.abs(v.priceDelta))}</small>` : ""
            }</span></label>`,
        )
        .join("")}</div></fieldset>`,
    )
    .join("");
}

/** Product detail page body (buy box, gallery, details, related). */
export function renderProductPage(catalog, slug, opts = {}) {
  const product = catalog.products.find((p) => p.slug === slug);
  if (!product) return "";
  const cat = findCategory(catalog, product.category);
  const mode = productCheckout(catalog, product);
  const pos = productPos(catalog, product);
  const each = perUnit(product);
  const images = product.images?.length ? product.images : [null];
  const gallery = `<div class="ve-gallery">${renderVisual(catalog, product, { className: "ve-visual--hero", loading: "eager", image: images[0] })}${
    images.length > 1
      ? `<ul class="ve-thumbs">${images
          .map((im, i) => `<li><button type="button" data-ve-thumb="${i}" aria-label="Show photo ${i + 1}"${i === 0 ? ' aria-current="true"' : ""} data-src="${esc(im.src)}" data-alt="${esc(im.alt)}"><img src="${esc(im.src)}" alt="" loading="lazy"></button></li>`)
          .join("")}</ul>`
      : ""
  }</div>`;
  const crumbs = `<nav class="ve-crumbs" aria-label="Breadcrumb"><ol><li><a href="${esc(catalog.shop.basePath)}">${esc(catalog.shop.title)}</a></li>${
    cat ? `<li><a href="${esc(categoryUrl(catalog, cat))}">${esc(cat.name)}</a></li>` : ""
  }<li><span aria-current="page">${esc(product.name)}</span></li></ol></nav>`;
  const related = visibleProducts(catalog, product.category).filter((p) => p.slug !== product.slug).slice(0, 3);
  const faqs = [
    ...(opts.faqs || []),
    { q: "Is this a real purchase?", a: "No. This is an educational Virtual Enterprise store. No real payment is taken and nothing ships." },
  ];
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description || product.tagline,
    brand: { "@type": "Brand", name: catalog.company.name },
    ...(product.images?.[0] && catalog.company.url ? { image: new URL(product.images[0].src, catalog.company.url).href } : {}),
    offers: { "@type": "Offer", price: product.price.toFixed(2), priceCurrency: catalog.company.currency },
  };
  const noCart = !cartEnabled(catalog);
  const buy = buyLinkFor(catalog, product);
  const buyBox = noCart
    ? `<div class="ve-buybox" data-ve-submit>
<div class="ve-buy-actions"><a class="ve-button ve-button--wide" href="${esc(buy.href)}" data-ve-buy="${esc(product.slug)}"${buy.pos ? ` data-ve-pos="${esc(product.slug)}" target="_blank" rel="noreferrer"` : ""}>Buy now ${buy.pos ? ICONS.external : ICONS.arrow}</a></div>
<p class="ve-note">${esc(catalog.checkout.note)}</p>
</div>`
    : `<form class="ve-buybox" data-ve-product-form="${esc(product.slug)}" novalidate>
${renderOptions(catalog, product)}
<div class="ve-field"><span class="ve-label" id="ve-qty-${esc(product.slug)}">Quantity</span>${renderStepper(`${product.name} quantity`)}</div>
<div class="ve-buy-actions" data-ve-submit>
${mode !== "demo" && pos ? `<a class="ve-button ve-button--wide" href="${esc(pos)}" data-ve-pos="${esc(product.slug)}">Buy now in POS ${ICONS.arrow}</a>` : ""}
<button type="submit" class="ve-button ve-button--wide${mode !== "demo" && pos ? " ve-button--ghost" : ""}">${ICONS.bag}<span data-ve-label>Add to cart</span></button>
</div>
<p class="ve-status" role="status" aria-live="polite" data-ve-status></p>
<p class="ve-note">${esc(catalog.checkout.note)}</p>
</form>`;
  return `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>
<div class="ve-product" data-ve-product="${esc(product.slug)}" data-ve-card-style="${esc(opts.cardStyle || catalog.theme?.card || "rounded")}">
${opts.crumbs === false ? "" : crumbs}
<div class="ve-detail">
${gallery}
<div class="ve-buycol">
<header>
${product.badge ? `<p class="ve-badge ve-badge--inline">${esc(product.badge)}</p>` : ""}
<h1 class="ve-title">${esc(product.name)}</h1>
${product.tagline ? `<p class="ve-tagline">${esc(product.tagline)}</p>` : ""}
${renderPrice(catalog, product, { size: "ve-price--lg", unit: unitPrice(product, defaultSelection(product)) })}
${product.bundle ? `<p class="ve-card-meta"><strong>${esc(product.bundle.count)}</strong> ${esc(product.bundle.unit)}${each ? ` · ${money(catalog, each)} per ${esc(singular(product.bundle.unit))}` : ""}</p>` : ""}
${product.placeholder ? PLACEHOLDER : ""}
</header>
${product.description ? `<div class="ve-description">${product.description.split(/\n{2,}/).map((para) => `<p>${esc(para)}</p>`).join("")}</div>` : ""}
${buyBox}
${product.features?.length ? `<section class="ve-features" aria-labelledby="ve-features-title"><h2 id="ve-features-title" class="ve-subhead">Highlights</h2><ul>${product.features.map((f) => `<li>${ICONS.check}<span>${esc(f)}</span></li>`).join("")}</ul></section>` : ""}
<section class="ve-faq" aria-label="Questions">${faqs.map((f) => `<details><summary>${esc(f.q)}${ICONS.plus}</summary><p>${esc(f.a)}</p></details>`).join("")}</section>
${catalog.contact.email ? `<p class="ve-note">Questions? <a href="mailto:${esc(catalog.contact.email)}">${esc(catalog.contact.email)}</a></p>` : ""}
</div>
</div>
${related.length ? `<section class="ve-related" aria-labelledby="ve-related-title"><h2 id="ve-related-title" class="ve-subhead">${cat ? `More ${esc(cat.name.toLowerCase())}` : "You may also like"}</h2>${renderProductGrid(catalog, { products: related, headingLevel: 3, reveal: opts.reveal, cardStyle: opts.cardStyle })}</section>` : ""}
${noCart ? "" : `<div class="ve-stickybar" data-ve-stickybar aria-hidden="true" inert><div><strong>${esc(product.name)}</strong><span data-ve-price>${money(catalog, product.price)}</span></div><button type="button" class="ve-button" data-ve-sticky-add="${esc(product.slug)}">Add to cart</button></div>`}
</div>`;
}

/** Header cart button. The runtime fills in the count. */
export function renderCartButton(catalog, { label = "Cart", className = "" } = {}) {
  if (!cartEnabled(catalog)) return "";
  return `<ve-cart-button><a class="ve-cart-button${className ? ` ${esc(className)}` : ""}" href="${esc(catalog.shop.cartPath)}" aria-label="${esc(label)}, 0 items" data-ve-cart-link>${ICONS.bag}<span class="ve-cart-label">${esc(label)}</span><span class="ve-cart-count" data-ve-count hidden>0</span></a></ve-cart-button>`;
}

// ---------- cart + checkout (rendered in the browser from localStorage lines) ----------
const linePrice = (catalog, i) => `<span class="ve-line-total">${money(catalog, i.lineTotal)}</span>`;
const optionText = (i) => Object.entries(i.options || {}).map(([k, v]) => `${esc(k)}: ${esc(v)}`).join(" · ");

export function renderCartView(catalog, lines) {
  const totals = cartTotals(lines, catalog);
  if (!totals.items.length) {
    return `<div class="ve-empty"><p>Your cart is empty.</p><a class="ve-button" href="${esc(catalog.shop.basePath)}">Browse the ${esc(catalog.shop.title.toLowerCase())} ${ICONS.arrow}</a></div>`;
  }
  return `<div class="ve-cart-layout">
<ul class="ve-lines">${totals.items
    .map(
      (i) => `<li class="ve-line" data-ve-line="${esc(i.id)}">
${renderVisual(catalog, i.product, { className: "ve-visual--thumb" })}
<div class="ve-line-info"><h2 class="ve-line-title"><a href="${esc(productUrl(catalog, i.product))}">${esc(i.product.name)}</a></h2>${
        optionText(i) ? `<p class="ve-muted">${optionText(i)}</p>` : ""
      }<p class="ve-muted">${money(catalog, i.unitPrice)} each</p></div>
<div class="ve-line-controls">${renderStepper(`${i.product.name} quantity`, i.quantity)}${linePrice(catalog, i)}<button type="button" class="ve-remove" data-ve-remove="${esc(i.id)}">Remove<span class="ve-sr"> ${esc(i.product.name)}</span></button></div>
</li>`,
    )
    .join("")}</ul>
<aside class="ve-summary" aria-labelledby="ve-cart-summary">
<h2 id="ve-cart-summary" class="ve-subhead">Summary</h2>
<dl class="ve-totals"><div><dt>Subtotal</dt><dd>${money(catalog, totals.subtotal)}</dd></div>${totals.savings ? `<div class="ve-savings"><dt>You save</dt><dd>${money(catalog, totals.savings)}</dd></div>` : ""}</dl>
<a class="ve-button ve-button--wide" href="${esc(catalog.shop.checkoutPath)}">Checkout ${ICONS.arrow}</a>
<a class="ve-text-link" href="${esc(catalog.shop.basePath)}">Continue shopping</a>
<p class="ve-note">${esc(catalog.checkout.note)}</p>
</aside>
</div>`;
}

const field = (id, label, extra = "", hint = "") =>
  `<div class="ve-field"><label class="ve-label" for="ve-${id}">${esc(label)}</label><input class="ve-input" id="ve-${id}" name="${id}" ${extra}${hint ? ` aria-describedby="ve-${id}-hint"` : ""}>${hint ? `<p class="ve-hint" id="ve-${id}-hint">${esc(hint)}</p>` : ""}<p class="ve-error" id="ve-${id}-error" hidden></p></div>`;

export function renderOrderSummary(catalog, totals, { editLink = true } = {}) {
  return `<aside class="ve-summary" aria-labelledby="ve-order-summary"><h2 id="ve-order-summary" class="ve-subhead">Order summary</h2>
<ul class="ve-summary-lines">${totals.items.map((i) => `<li><span>${esc(i.quantity)} × ${esc(i.product.name)}${optionText(i) ? `<small>${optionText(i)}</small>` : ""}</span>${linePrice(catalog, i)}</li>`).join("")}</ul>
<p class="ve-total-row"><span>Total</span><span>${money(catalog, totals.total)}</span></p>
<p class="ve-hint">No tax or shipping is charged in this educational store.</p>
${editLink ? `<a class="ve-text-link" href="${esc(catalog.shop.cartPath)}">Edit cart</a>` : ""}
</aside>`;
}

export function renderPosPanel(catalog, totals) {
  const url = posUrlFor(catalog, totals.items);
  return `<section class="ve-pos" aria-labelledby="ve-pos-title">
<h2 id="ve-pos-title" class="ve-subhead">Pay at the VE Trade Show POS</h2>
<p>${esc(catalog.company.name)} takes payment through the Virtual Enterprise Trade Show point of sale. Open it, then add these items to the new sale:</p>
<ol class="ve-pos-steps">${totals.items.map((i) => `<li><strong>${esc(i.quantity)} × ${esc(i.product.name)}</strong>${optionText(i) ? ` <span class="ve-muted">(${optionText(i)})</span>` : ""} · ${money(catalog, i.lineTotal)}</li>`).join("")}</ol>
<a class="ve-button ve-button--wide" href="${esc(url)}" data-ve-pos-checkout>${esc(catalog.checkout.posLabel)} ${ICONS.external}</a>
<p class="ve-hint">VE International may ask you to sign in to your firm account first.</p>
</section>`;
}

export function renderCheckoutView(catalog, lines) {
  const totals = cartTotals(lines, catalog);
  if (!totals.items.length) {
    return `<div class="ve-empty"><p>Your cart is empty. Add something, then come back to check out.</p><a class="ve-button" href="${esc(catalog.shop.basePath)}">Browse the ${esc(catalog.shop.title.toLowerCase())} ${ICONS.arrow}</a></div>`;
  }
  const mode = checkoutModeFor(catalog, totals.items);
  const pos = mode === "pos" || mode === "both" ? renderPosPanel(catalog, totals) : "";
  const demo =
    mode === "demo" || mode === "both"
      ? `<form class="ve-form" data-ve-checkout-form novalidate>
${mode === "both" ? `<p class="ve-or"><span>or place a demo order</span></p>` : ""}
<fieldset class="ve-group"><legend>Contact</legend>${field("name", "Full name", 'autocomplete="name"')}${field("email", "Email", 'type="email" inputmode="email" autocomplete="email" spellcheck="false"')}</fieldset>
<fieldset class="ve-group"><legend>Shipping address</legend>${field("address", "Street address", 'autocomplete="shipping street-address"')}<div class="ve-row">${field("city", "City", 'autocomplete="shipping address-level2"')}${field("region", "State", 'autocomplete="shipping address-level1"')}${field("postal", "ZIP code", 'autocomplete="shipping postal-code" inputmode="numeric"')}</div></fieldset>
<fieldset class="ve-group"><legend>Payment (demo only)</legend><p class="ve-hint">Educational demo. Do not enter a real card. Nothing is stored or sent.</p>${field("card", "Card number", 'inputmode="numeric" autocomplete="off" placeholder="4242 4242 4242 4242" spellcheck="false"')}<div class="ve-row ve-row--2">${field("expiry", "Expiry (MM / YY)", 'inputmode="numeric" autocomplete="off" placeholder="MM / YY" maxlength="7"')}${field("cvc", "CVC", 'inputmode="numeric" autocomplete="off" maxlength="4"')}</div></fieldset>
<div class="ve-submit-row"><button type="submit" class="ve-button">Place demo order</button><p class="ve-note">${esc(catalog.checkout.note)}</p></div>
</form>`
      : "";
  return `<div class="ve-checkout-layout"><div class="ve-checkout-main">${pos}${demo}</div>${renderOrderSummary(catalog, totals)}</div>`;
}

export function renderConfirmation(catalog, order) {
  return `<section class="ve-confirm" aria-labelledby="ve-confirm-title">
<p class="ve-eyebrow">Thank you${order.name ? `, ${esc(order.name.split(" ")[0])}` : ""}</p>
<h2 id="ve-confirm-title" tabindex="-1">Demo order placed</h2>
<p class="ve-order-number">Order number <strong>${esc(order.number)}</strong></p>
<p>This is a Virtual Enterprise educational store. No real payment was taken and nothing will ship.</p>
<ul class="ve-summary-lines">${order.items.map((i) => `<li><span>${esc(i.quantity)} × ${esc(i.name)}${i.options ? `<small>${esc(i.options)}</small>` : ""}</span><span>${money(catalog, i.total)}</span></li>`).join("")}</ul>
<p class="ve-total-row"><span>Total</span><span>${money(catalog, order.total)}</span></p>
<a class="ve-button" href="${esc(catalog.shop.basePath)}">Continue shopping ${ICONS.arrow}</a>
</section>`;
}

export function renderCartShell(catalog) {
  return `<ve-cart class="ve-cart-host"><div class="ve-cart-placeholder" aria-hidden="true"></div><noscript><p>The cart needs JavaScript. <a href="${esc(catalog.shop.basePath)}">Back to the shop</a></p></noscript></ve-cart>`;
}
export function renderCheckoutShell(catalog) {
  return `<ve-checkout class="ve-cart-host"><div class="ve-cart-placeholder" aria-hidden="true"></div><noscript><p>Checkout needs JavaScript.${catalog.checkout.posUrl ? ` You can also <a href="${esc(catalog.checkout.posUrl)}">pay in the VE Trade Show POS</a>.` : ""}</p></noscript></ve-checkout>`;
}

/** JSON data island the browser runtime reads. Put once per page (the Astro <VeHead> does this). */
export const renderDataScript = (pub) =>
  `<script type="application/json" data-ve-catalog>${JSON.stringify(pub).replace(/</g, "\\u003c")}</script>`;
