// ve-backend core: pure, dependency-free helpers shared by the Astro components,
// the browser runtime and the sales editor. Works in Node and in the browser.
// Catalog validation is adapted from Hangr's sales editor (scripts/admin/validate.mjs).

export const CHECKOUT_MODES = ["demo", "pos", "both"];
export const CARD_STYLES = ["arch", "rounded", "flat"];
export const BUTTON_STYLES = ["pill", "rounded", "square"];
export const IMAGE_FITS = ["contain", "cover"];
export const MAX_QUANTITY = 10;
/** Field types for editable site content blocks (catalog.content). */
export const CONTENT_TYPES = ["text", "textarea", "link", "image", "toggle"];

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const COLOR = /^(#[0-9a-fA-F]{3,8}|rgb\(.+\)|rgba\(.+\)|hsl\(.+\)|oklch\(.+\)|color-mix\(.+\)|var\(--[a-zA-Z0-9-]+\)|[a-z]+)$/;
const CSS_SAFE = /^[^;{}<>]*$/;

export const slugify = (text) =>
  String(text || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");

const isHttps = (v) => {
  try {
    return new URL(v).protocol === "https:";
  } catch {
    return false;
  }
};
const isSitePath = (v) => /^\/(?!\/)[^\s]*$/.test(v) && !v.includes("..");
const round2 = (n) => Math.round(n * 100) / 100;

/** Default theme. Every key becomes a --ve-* CSS custom property. */
export const DEFAULT_THEME = {
  colors: {
    background: "#ffffff",
    surface: "#f6f6f4",
    text: "#1f2328",
    muted: "#5b6168",
    heading: "#1f2328",
    accent: "#1f2328",
    accentText: "#ffffff",
    accentHover: "#3b4048",
    badge: "#1f2328",
    badgeText: "#ffffff",
    sale: "#a12620",
    border: "#d9dcdf",
    focus: "#1f2328",
  },
  fonts: {
    display: "Georgia, serif",
    body: "system-ui, sans-serif",
    accent: "Georgia, serif",
  },
  fontFaces: [],
  radius: "16px",
  card: "rounded",
  imageFit: "cover",
  imageScale: 1,
  button: "pill",
  tints: { default: "#f1efe9" },
  motion: true,
};

export const DEFAULT_CATALOG = {
  version: 1,
  company: { name: "My VE Company", tagline: "", currency: "USD", locale: "en-US", url: "" },
  shop: { title: "Shop", intro: "", basePath: "/shop/", cartPath: "/cart/", checkoutPath: "/checkout/", allLabel: "All products" },
  announcement: { enabled: false, text: "", linkLabel: "", link: "" },
  contact: { email: "", phone: "", location: "", hours: "", instagram: "" },
  checkout: { mode: "demo", posUrl: "", orderPrefix: "VE", posLabel: "Pay in VE Trade Show POS", note: "Educational Virtual Enterprise store. No real payment is taken and nothing ships." },
  theme: DEFAULT_THEME,
  content: [],
  categories: [],
  products: [],
};

function uniqueId(base, taken, fallback) {
  let id = base || fallback;
  let n = 2;
  while (taken.has(id)) id = `${base || fallback}-${n++}`;
  taken.add(id);
  return id;
}

/**
 * Validate and normalize a catalog. Returns { value } or { errors } where errors maps
 * a field path such as "products.0.price" to a plain-language message for the editor.
 */
export function validateCatalog(input) {
  const errors = {};
  const err = (key, message) => {
    if (!errors[key]) errors[key] = message;
  };
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { errors: { _: "The catalog should be a JSON object." } };
  }
  const text = (value, key, { label, max, required = false }) => {
    if (value === undefined || value === null) value = "";
    if (typeof value === "number") value = String(value);
    if (typeof value !== "string") {
      err(key, `${label} should be text.`);
      return "";
    }
    const v = value.replace(/\r\n/g, "\n").trim();
    if (required && !v) err(key, `${label} can't be empty.`);
    if (v.length > max) err(key, `${label} is too long (${v.length} of ${max} characters).`);
    return v;
  };
  const link = (value, key, label, allowPath = true) => {
    const v = text(value, key, { label, max: 500 });
    if (v && !errors[key] && !(isHttps(v) || (allowPath && isSitePath(v)))) {
      err(key, allowPath ? `${label} should start with https:// (or / for a page on this site).` : `${label} should start with https://`);
    }
    return v;
  };
  const image = (value, key, label) => {
    const v = text(value, key, { label, max: 500 });
    if (v && !errors[key] && !(isHttps(v) || isSitePath(v))) err(key, `${label} should be a site path like /uploads/photo.webp or an https:// link.`);
    return v;
  };
  const money = (value, key, label, { required = true, allowNegative = false } = {}) => {
    if ((value === undefined || value === null || value === "") && !required) return null;
    if (typeof value === "string" && value.trim() !== "") value = Number(value.replace(/[$,\s]/g, ""));
    if (typeof value !== "number" || !Number.isFinite(value)) {
      err(key, `Enter ${label.toLowerCase()}, like 39 or 39.99.`);
      return 0;
    }
    if (!allowNegative && value < 0) err(key, `${label} can't be below 0.`);
    if (Math.abs(value) > 1000000) err(key, `${label} looks too high. Please check it.`);
    if (Math.abs(value * 100 - Math.round(value * 100)) > 1e-6) err(key, `${label}: use at most 2 decimals, like 39.99.`);
    return round2(value);
  };
  const oneOf = (value, list, fallback, key, label) => {
    if (value === undefined || value === null || value === "") return fallback;
    if (!list.includes(value)) {
      err(key, `${label} should be one of: ${list.join(", ")}.`);
      return fallback;
    }
    return value;
  };

  const out = {};
  out.version = 1;

  const co = input.company || {};
  out.company = {
    name: text(co.name, "company.name", { label: "Company name", max: 80, required: true }),
    tagline: text(co.tagline, "company.tagline", { label: "Tagline", max: 140 }),
    currency: text(co.currency || "USD", "company.currency", { label: "Currency", max: 3 }).toUpperCase(),
    locale: text(co.locale || "en-US", "company.locale", { label: "Locale", max: 20 }),
    url: link(co.url, "company.url", "Website", false),
  };
  if (!/^[A-Z]{3}$/.test(out.company.currency)) err("company.currency", "Currency should be a 3-letter code like USD.");

  const sh = input.shop || {};
  const pathField = (v, key, label, fallback) => {
    const p = text(v || fallback, key, { label, max: 80 });
    if (!/^\/([a-z0-9-]+\/)*$/.test(p)) err(key, `${label} should look like /shop/ (start and end with /).`);
    return p;
  };
  out.shop = {
    title: text(sh.title || "Shop", "shop.title", { label: "Shop title", max: 60 }),
    intro: text(sh.intro, "shop.intro", { label: "Shop intro", max: 300 }),
    basePath: pathField(sh.basePath, "shop.basePath", "Shop path", "/shop/"),
    cartPath: pathField(sh.cartPath, "shop.cartPath", "Cart path", "/cart/"),
    checkoutPath: pathField(sh.checkoutPath, "shop.checkoutPath", "Checkout path", "/checkout/"),
    allLabel: text(sh.allLabel || "All products", "shop.allLabel", { label: "All products label", max: 40 }),
  };

  const a = input.announcement || {};
  out.announcement = {
    enabled: a.enabled === true,
    text: text(a.text, "announcement.text", { label: "Announcement text", max: 140, required: a.enabled === true }),
    linkLabel: text(a.linkLabel, "announcement.linkLabel", { label: "Link label", max: 30 }),
    link: link(a.link, "announcement.link", "Link"),
  };
  if (out.announcement.linkLabel && !out.announcement.link) err("announcement.link", "Add a link, or clear the link label.");

  const c = input.contact || {};
  out.contact = {
    email: text(c.email, "contact.email", { label: "Email", max: 120 }),
    phone: text(c.phone, "contact.phone", { label: "Phone", max: 30 }),
    location: text(c.location, "contact.location", { label: "Location", max: 120 }),
    hours: text(c.hours, "contact.hours", { label: "Hours", max: 80 }),
    instagram: link(c.instagram, "contact.instagram", "Instagram link", false),
  };
  if (out.contact.email && !errors["contact.email"] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.contact.email)) {
    err("contact.email", "That doesn't look like an email address (for example name@example.com).");
  }

  const ck = input.checkout || {};
  out.checkout = {
    mode: oneOf(ck.mode, CHECKOUT_MODES, "demo", "checkout.mode", "Checkout mode"),
    posUrl: link(ck.posUrl, "checkout.posUrl", "POS link", false),
    orderPrefix: text(ck.orderPrefix || "VE", "checkout.orderPrefix", { label: "Order prefix", max: 6 }).toUpperCase(),
    posLabel: text(ck.posLabel || "Pay in VE Trade Show POS", "checkout.posLabel", { label: "POS button label", max: 40 }),
    note: text(ck.note ?? DEFAULT_CATALOG.checkout.note, "checkout.note", { label: "Checkout note", max: 240 }),
  };
  if (out.checkout.mode !== "demo" && !out.checkout.posUrl) err("checkout.posUrl", "POS checkout needs your VE Trade Show POS new-sale link (https://portal.veinternational.org/...).");
  if (!/^[A-Z0-9]{1,6}$/.test(out.checkout.orderPrefix)) err("checkout.orderPrefix", "Order prefix: letters and numbers only, up to 6.");

  out.theme = validateTheme(input.theme || {}, err);
  out.content = validateContent(input.content, { errors, err, text, link, image });

  const catsIn = Array.isArray(input.categories) ? input.categories : null;
  out.categories = [];
  if (!catsIn) err("categories", "Categories should be a list.");
  else {
    if (catsIn.length > 20) err("categories", "You can have up to 20 categories.");
    const taken = new Set(catsIn.map((x) => (x && KEBAB.test(x.slug || "") ? x.slug : "")).filter(Boolean));
    const seen = new Set();
    catsIn.slice(0, 20).forEach((x, i) => {
      const k = `categories.${i}`;
      x = x || {};
      const name = text(x.name, `${k}.name`, { label: "Category name", max: 40, required: true });
      let slug = typeof x.slug === "string" ? x.slug : "";
      if (slug && (!KEBAB.test(slug) || seen.has(slug))) {
        err(`${k}.slug`, "This web address is used twice or has spaces/capitals. Use lowercase words joined by dashes.");
        slug = "";
      }
      if (!slug) slug = uniqueId(slugify(name), taken, "category");
      seen.add(slug);
      out.categories.push({
        slug,
        name,
        eyebrow: text(x.eyebrow, `${k}.eyebrow`, { label: "Eyebrow", max: 60 }),
        title: text(x.title, `${k}.title`, { label: "Heading", max: 80 }),
        description: text(x.description, `${k}.description`, { label: "Description", max: 400 }),
        note: text(x.note, `${k}.note`, { label: "Note", max: 240 }),
        image: image(x.image, `${k}.image`, "Image"),
        tint: text(x.tint, `${k}.tint`, { label: "Tint", max: 30 }),
        visible: x.visible !== false,
      });
    });
  }
  const catSlugs = new Set(out.categories.map((x) => x.slug));

  const productsIn = Array.isArray(input.products) ? input.products : null;
  out.products = [];
  if (!productsIn) err("products", "Products should be a list.");
  else {
    if (productsIn.length > 200) err("products", "You can have up to 200 products.");
    const taken = new Set([...catSlugs, ...productsIn.map((p) => (p && KEBAB.test(p.slug || "") ? p.slug : "")).filter(Boolean)]);
    const seen = new Set();
    productsIn.slice(0, 200).forEach((p, i) => {
      const k = `products.${i}`;
      p = p || {};
      const name = text(p.name, `${k}.name`, { label: "Product name", max: 80, required: true });
      let slug = typeof p.slug === "string" ? p.slug : "";
      if (slug && (!KEBAB.test(slug) || seen.has(slug) || catSlugs.has(slug))) {
        err(`${k}.slug`, catSlugs.has(slug) ? "This web address is already used by a category. Pick another." : "This web address is used twice or has spaces/capitals. Use lowercase words joined by dashes.");
        slug = "";
      }
      if (!slug) slug = uniqueId(slugify(name), taken, "product");
      seen.add(slug);
      const category = text(p.category, `${k}.category`, { label: "Category", max: 60 });
      if (category && !catSlugs.has(category)) err(`${k}.category`, "Pick one of your categories.");
      const price = money(p.price, `${k}.price`, "Price");
      const compareAt = money(p.compareAt, `${k}.compareAt`, "Compare-at price", { required: false });
      if (compareAt !== null && compareAt <= price && compareAt !== 0) err(`${k}.compareAt`, "The compare-at price should be higher than the price (it shows as crossed out).");

      const images = [];
      const imgsIn = p.images === undefined ? [] : p.images;
      if (!Array.isArray(imgsIn)) err(`${k}.images`, "Images should be a list.");
      else {
        if (imgsIn.length > 8) err(`${k}.images`, "Up to 8 photos per product.");
        imgsIn.slice(0, 8).forEach((im, j) => {
          const obj = typeof im === "string" ? { src: im } : im || {};
          const src = image(obj.src, `${k}.images`, `Photo ${j + 1}`);
          const alt = text(obj.alt, `${k}.images`, { label: `Photo ${j + 1} description`, max: 160 });
          if (src) images.push({ src, alt });
        });
      }

      const features = [];
      if (p.features !== undefined && !Array.isArray(p.features)) err(`${k}.features`, "Features should be a list.");
      else
        (p.features || []).slice(0, 12).forEach((f) => {
          const v = text(f, `${k}.features`, { label: "A feature", max: 120 });
          if (v) features.push(v);
        });

      const options = [];
      if (p.options !== undefined && !Array.isArray(p.options)) err(`${k}.options`, "Options should be a list.");
      else
        (p.options || []).slice(0, 4).forEach((o, j) => {
          o = o || {};
          const oname = text(o.name, `${k}.options.${j}.name`, { label: "Option name", max: 30, required: true });
          const values = [];
          const vals = Array.isArray(o.values) ? o.values : [];
          if (!vals.length) err(`${k}.options.${j}.values`, `Add at least one choice for “${oname || "this option"}”.`);
          const seenVals = new Set();
          vals.slice(0, 20).forEach((v) => {
            const obj = typeof v === "string" ? { label: v } : v || {};
            const label = text(obj.label, `${k}.options.${j}.values`, { label: "Choice", max: 40, required: true });
            if (seenVals.has(label)) err(`${k}.options.${j}.values`, `“${label}” is listed twice.`);
            seenVals.add(label);
            const priceDelta = money(obj.priceDelta ?? 0, `${k}.options.${j}.values`, "Price change", { allowNegative: true });
            if (label) values.push({ label, priceDelta });
          });
          options.push({ name: oname, values });
        });

      let bundle = null;
      if (p.bundle && (p.bundle.count || p.bundle.unit)) {
        const count = Number(p.bundle.count);
        if (!Number.isInteger(count) || count < 1 || count > 1000) err(`${k}.bundle.count`, "Bundle size should be a whole number like 7.");
        bundle = { count: Number.isInteger(count) && count > 0 ? count : 1, unit: text(p.bundle.unit || "item", `${k}.bundle.unit`, { label: "Bundle unit", max: 30 }) };
      }

      const prod = {
        slug,
        name,
        category,
        price,
        compareAt,
        badge: text(p.badge, `${k}.badge`, { label: "Badge", max: 24 }),
        offer: text(p.offer, `${k}.offer`, { label: "Offer", max: 30 }),
        tagline: text(p.tagline, `${k}.tagline`, { label: "Tagline", max: 140 }),
        description: text(p.description, `${k}.description`, { label: "Description", max: 1200 }),
        images,
        tint: text(p.tint, `${k}.tint`, { label: "Tint", max: 30 }),
        features,
        options,
        bundle,
        checkout: oneOf(p.checkout, ["", ...CHECKOUT_MODES], "", `${k}.checkout`, "Checkout"),
        posUrl: link(p.posUrl, `${k}.posUrl`, "POS link", false),
        featured: p.featured === true,
        visible: p.visible !== false,
        placeholder: p.placeholder === true,
      };
      if (prod.compareAt === null) delete prod.compareAt;
      if (!prod.bundle) delete prod.bundle;
      out.products.push(prod);
    });
  }
  return Object.keys(errors).length ? { errors } : { value: out };
}

/**
 * Editable site content: blocks of named fields (hero slogan, banner text, button labels…) that
 * agents declare in the catalog and admins edit in the sales editor. Pages read them with getContent().
 */
const CONTENT_ID = /^[a-z][a-zA-Z0-9_-]{0,39}$/;
function validateContent(input, { errors, err, text, link, image }) {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) {
    err("content", "Site content should be a list of blocks.");
    return [];
  }
  if (input.length > 40) err("content", "You can have up to 40 content blocks.");
  const out = [];
  const seenBlocks = new Set();
  input.slice(0, 40).forEach((b, i) => {
    const k = `content.${i}`;
    b = b && typeof b === "object" ? b : {};
    const id = typeof b.id === "string" ? b.id.trim() : "";
    if (!CONTENT_ID.test(id)) err(`${k}.id`, "Block id should be a short name like hero or holidayBanner (letters, numbers, - or _).");
    else if (seenBlocks.has(id)) err(`${k}.id`, `Block id “${id}” is used twice.`);
    seenBlocks.add(id);
    const block = {
      id,
      label: text(b.label || id, `${k}.label`, { label: "Block name", max: 60 }),
      help: text(b.help, `${k}.help`, { label: "Block help", max: 240 }),
      fields: [],
    };
    if (!Array.isArray(b.fields) || !b.fields.length) err(`${k}.fields`, "Add at least one field to this block.");
    const seenFields = new Set();
    (Array.isArray(b.fields) ? b.fields : []).slice(0, 40).forEach((f, j) => {
      const fk = `${k}.fields.${j}`;
      f = f && typeof f === "object" ? f : {};
      const fid = typeof f.id === "string" ? f.id.trim() : "";
      if (!CONTENT_ID.test(fid)) err(`${fk}.id`, "Field id should be a short name like title or buttonLabel.");
      else if (seenFields.has(fid)) err(`${fk}.id`, `Field id “${fid}” is used twice in this block.`);
      seenFields.add(fid);
      const type = CONTENT_TYPES.includes(f.type) ? f.type : f.type === undefined ? "text" : (err(`${fk}.type`, `Field type should be one of: ${CONTENT_TYPES.join(", ")}.`), "text");
      const label = text(f.label || fid, `${fk}.label`, { label: "Field name", max: 60 });
      const max = Math.min(Math.max(Number(f.max) || (type === "textarea" ? 1000 : 140), 1), 5000);
      const field = { id: fid, label, type, help: text(f.help, `${fk}.help`, { label: "Field help", max: 240 }), required: f.required === true };
      if (type === "text" || type === "textarea") {
        field.max = max;
        field.value = text(f.value, `${fk}.value`, { label, max, required: field.required });
        if (type === "text" && field.value.includes("\n")) err(`${fk}.value`, `${label} should be one line.`);
      } else if (type === "link") {
        const raw = typeof f.value === "string" ? f.value.trim() : f.value;
        const inPage = typeof raw === "string" && /^#[A-Za-z][\w-]{0,80}$/.test(raw);
        const mail = typeof raw === "string" && /^mailto:[^\s@<>"]+@[^\s@<>"]+$/.test(raw) && raw.length <= 200;
        field.value = inPage || mail ? raw : link(f.value, `${fk}.value`, label);
        if (!inPage && !mail && errors[`${fk}.value`]) errors[`${fk}.value`] = `${label} should be a page on this site like /shop/, a section like #bundles, a mailto: address, or an https:// link.`;
        if (field.required && !field.value) err(`${fk}.value`, `${label} can't be empty.`);
      } else if (type === "image") {
        field.value = image(f.value, `${fk}.value`, label);
        field.alt = text(f.alt, `${fk}.alt`, { label: `${label} description`, max: 160 });
        if (field.required && !field.value) err(`${fk}.value`, `${label} can't be empty.`);
      } else {
        field.value = f.value === true;
      }
      block.fields.push(field);
    });
    out.push(block);
  });
  return out;
}

/**
 * Read one content block as { fieldId: value }. Image fields also give `<id>Alt`.
 * Pass fallbacks so the page still renders if the block is missing:
 *   const hero = getContent(catalog, "hero", { title: "Always in bloom" });
 */
export function getContent(catalog, blockId, fallback = {}) {
  const block = (catalog?.content || []).find((b) => b.id === blockId);
  const out = { ...fallback };
  for (const f of block?.fields || []) {
    if (f.type === "toggle" || f.value !== "") out[f.id] = f.value;
    if (f.type === "image" && f.alt) out[`${f.id}Alt`] = f.alt;
  }
  return out;
}

function validateTheme(t, err) {
  const d = DEFAULT_THEME;
  const colors = {};
  for (const key of Object.keys(d.colors)) {
    const v = t.colors?.[key];
    if (v === undefined || v === "") colors[key] = d.colors[key];
    else if (typeof v !== "string" || !COLOR.test(v.trim()) || !CSS_SAFE.test(v)) {
      err(`theme.colors.${key}`, "Use a color like #BF5E73.");
      colors[key] = d.colors[key];
    } else colors[key] = v.trim();
  }
  const fonts = {};
  for (const key of Object.keys(d.fonts)) {
    const v = t.fonts?.[key];
    if (!v) fonts[key] = d.fonts[key];
    else if (typeof v !== "string" || !CSS_SAFE.test(v) || v.length > 200) {
      err(`theme.fonts.${key}`, "Font should be a CSS font list like \"Higuen\", Georgia, serif.");
      fonts[key] = d.fonts[key];
    } else fonts[key] = v.trim();
  }
  const fontFaces = [];
  (Array.isArray(t.fontFaces) ? t.fontFaces : []).slice(0, 12).forEach((f, i) => {
    if (!f || typeof f.family !== "string" || typeof f.src !== "string" || !CSS_SAFE.test(f.family + f.src) || /["'()]/.test(f.src)) {
      err(`theme.fontFaces.${i}`, "Each font file needs a family name and a /path/to/font.woff2.");
      return;
    }
    fontFaces.push({ family: f.family.trim(), src: f.src.trim(), weight: String(f.weight || "400"), style: f.style === "italic" ? "italic" : "normal" });
  });
  const tints = {};
  const tintIn = t.tints && typeof t.tints === "object" ? t.tints : d.tints;
  for (const [name, v] of Object.entries(tintIn).slice(0, 12)) {
    if (!KEBAB.test(name)) {
      err("theme.tints", `Tint name “${name}” should be lowercase letters/dashes.`);
      continue;
    }
    if (typeof v !== "string" || !COLOR.test(v.trim()) || !CSS_SAFE.test(v)) {
      err(`theme.tints.${name}`, "Use a color like #FAF39B.");
      continue;
    }
    tints[name] = v.trim();
  }
  const radius = typeof t.radius === "string" && /^\d+(\.\d+)?(px|rem|em)$/.test(t.radius) ? t.radius : d.radius;
  if (t.radius && radius !== t.radius) err("theme.radius", "Corner radius should look like 16px.");
  const scale = Number(t.imageScale ?? d.imageScale);
  return {
    colors,
    fonts,
    fontFaces,
    radius,
    card: CARD_STYLES.includes(t.card) ? t.card : d.card,
    imageFit: IMAGE_FITS.includes(t.imageFit) ? t.imageFit : d.imageFit,
    imageScale: Number.isFinite(scale) && scale >= 0.4 && scale <= 1 ? scale : d.imageScale,
    button: BUTTON_STYLES.includes(t.button) ? t.button : d.button,
    tints: Object.keys(tints).length ? tints : { ...d.tints },
    motion: t.motion !== false,
  };
}

/** Like validateCatalog but throws a readable error. Use at build time. */
export function loadCatalog(input) {
  const result = validateCatalog(input);
  if (result.errors) {
    const lines = Object.entries(result.errors).map(([k, v]) => `  ${k}: ${v}`);
    const e = new Error(`VE_CATALOG_INVALID: the catalog has ${lines.length} problem(s). Fix them in the editor (npx ve-backend editor) or the JSON file:\n${lines.join("\n")}`);
    e.code = "VE_CATALOG_INVALID";
    e.errors = result.errors;
    throw e;
  }
  return result.value;
}

// ---------- lookups and paths ----------
export const visibleProducts = (catalog, category) =>
  catalog.products.filter((p) => p.visible && (!category || p.category === category));
export const findProduct = (catalog, slug) => catalog.products.find((p) => p.slug === slug) || null;
export const findCategory = (catalog, slug) => catalog.categories.find((c) => c.slug === slug) || null;
export const productUrl = (catalog, product) => `${catalog.shop.basePath}${product.slug}/`;
export const categoryUrl = (catalog, category) => `${catalog.shop.basePath}${category.slug}/`;

/**
 * Every static shop page the catalog needs. Astro: return this from getStaticPaths()
 * in src/pages/shop/[slug].astro (the /shop/ index, /cart/ and /checkout/ are fixed pages).
 */
export function getShopPaths(catalog) {
  const cats = catalog.categories.filter((c) => c.visible !== false).map((category) => ({ params: { slug: category.slug }, props: { kind: "category", slug: category.slug } }));
  const prods = visibleProducts(catalog).map((product) => ({ params: { slug: product.slug }, props: { kind: "product", slug: product.slug } }));
  return [...cats, ...prods];
}

// ---------- money and pricing ----------
export function formatMoney(catalog, value) {
  const { currency = "USD", locale = "en-US" } = catalog?.company || {};
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(value);
  } catch {
    return `$${Number(value).toFixed(2)}`;
  }
}

/** Default choice per option (first value). */
export const defaultSelection = (product) => Object.fromEntries((product.options || []).map((o) => [o.name, o.values[0]?.label ?? ""]));

/** Normalize a selection: unknown option names dropped, invalid values replaced with the default. */
export function normalizeSelection(product, selection = {}) {
  const out = {};
  for (const o of product.options || []) {
    const wanted = selection[o.name];
    out[o.name] = o.values.some((v) => v.label === wanted) ? wanted : o.values[0]?.label ?? "";
  }
  return out;
}

export function unitPrice(product, selection = {}) {
  let price = product.price;
  const sel = normalizeSelection(product, selection);
  for (const o of product.options || []) {
    const v = o.values.find((x) => x.label === sel[o.name]);
    if (v) price += v.priceDelta || 0;
  }
  return round2(Math.max(0, price));
}

export const perUnit = (product) => (product.bundle && product.bundle.count > 1 ? round2(product.price / product.bundle.count) : null);
export const savingsPercent = (product) =>
  product.compareAt && product.compareAt > product.price ? Math.round((1 - product.price / product.compareAt) * 100) : null;

// ---------- cart math (pure; the runtime stores lines in localStorage) ----------
export const lineId = (slug, selection = {}) => {
  const keys = Object.keys(selection).sort();
  return keys.length ? `${slug}?${keys.map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(selection[k])}`).join("&")}` : slug;
};
const clampQty = (q) => Math.max(0, Math.min(MAX_QUANTITY, Math.round(Number(q) || 0)));

export function addToCart(lines, catalog, slug, quantity = 1, selection = {}) {
  const product = findProduct(catalog, slug);
  if (!product) return lines;
  const sel = normalizeSelection(product, selection);
  const id = lineId(slug, sel);
  const existing = lines.find((l) => l.id === id);
  const qty = clampQty((existing?.quantity || 0) + quantity);
  if (qty === 0) return lines.filter((l) => l.id !== id);
  return existing ? lines.map((l) => (l.id === id ? { ...l, quantity: qty } : l)) : [...lines, { id, slug, options: sel, quantity: qty }];
}
export function setQuantity(lines, id, quantity) {
  const qty = clampQty(quantity);
  return qty === 0 ? lines.filter((l) => l.id !== id) : lines.map((l) => (l.id === id ? { ...l, quantity: qty } : l));
}
export const removeLine = (lines, id) => lines.filter((l) => l.id !== id);

/** Drop lines whose product is gone or hidden; repair quantities and options. */
export function sanitizeLines(raw, catalog) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const l of raw) {
    if (!l || typeof l.slug !== "string") continue;
    const product = findProduct(catalog, l.slug);
    if (!product || !product.visible) continue;
    const qty = clampQty(l.quantity);
    if (!qty) continue;
    const options = normalizeSelection(product, l.options || {});
    const id = lineId(l.slug, options);
    const dup = out.find((x) => x.id === id);
    if (dup) dup.quantity = clampQty(dup.quantity + qty);
    else out.push({ id, slug: l.slug, options, quantity: qty });
  }
  return out;
}

export function cartTotals(lines, catalog) {
  const items = [];
  for (const line of sanitizeLines(lines, catalog)) {
    const product = findProduct(catalog, line.slug);
    const unit = unitPrice(product, line.options);
    const compare = product.compareAt ? round2(product.compareAt + (unit - product.price)) : null;
    items.push({ ...line, product, unitPrice: unit, lineTotal: round2(unit * line.quantity), lineSavings: compare && compare > unit ? round2((compare - unit) * line.quantity) : 0 });
  }
  const subtotal = round2(items.reduce((s, i) => s + i.lineTotal, 0));
  return {
    items,
    count: items.reduce((s, i) => s + i.quantity, 0),
    subtotal,
    savings: round2(items.reduce((s, i) => s + i.lineSavings, 0)),
    total: subtotal,
    hasPlaceholder: items.some((i) => i.product.placeholder),
  };
}

/** Which checkout a cart uses: product overrides win when every item agrees. */
export function checkoutModeFor(catalog, items = []) {
  const modes = new Set(items.map((i) => i.product.checkout).filter(Boolean));
  if (modes.size === 1 && items.every((i) => i.product.checkout)) return [...modes][0];
  return catalog.checkout.mode;
}
export const posUrlFor = (catalog, items = []) => {
  const urls = [...new Set(items.map((i) => i.product.posUrl).filter(Boolean))];
  return urls.length === 1 ? urls[0] : catalog.checkout.posUrl;
};

// ---------- demo checkout (copied from Hangr's CheckoutView validation) ----------
export const CHECKOUT_FIELDS = ["name", "email", "address", "city", "region", "postal", "card", "expiry", "cvc"];

export function validateCheckout(v) {
  const val = Object.fromEntries(CHECKOUT_FIELDS.map((k) => [k, String(v?.[k] ?? "")]));
  const e = {};
  if (!val.name.trim()) e.name = "Enter your full name.";
  if (!val.email.trim()) e.email = "Enter your email address.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.email.trim())) e.email = "Enter an email like name@example.com.";
  if (!val.address.trim()) e.address = "Enter your street address.";
  if (!val.city.trim()) e.city = "Enter your city.";
  if (!val.region.trim()) e.region = "Enter your state.";
  if (!/^\d{5}(-\d{4})?$/.test(val.postal.trim())) e.postal = "Enter a 5-digit ZIP code.";
  const digits = val.card.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) e.card = "Enter a card number with 13 to 19 digits (any number works in this demo).";
  const m = /^(\d{2})\s*\/\s*(\d{2})$/.exec(val.expiry.trim());
  if (!m || Number(m[1]) < 1 || Number(m[1]) > 12) e.expiry = "Enter the expiry as MM / YY.";
  if (!/^\d{3,4}$/.test(val.cvc.trim())) e.cvc = "Enter the 3 or 4 digit security code.";
  return e;
}

const ORDER_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function orderNumber(prefix = "VE", randomBytes) {
  const bytes = randomBytes ? randomBytes(6) : globalThis.crypto.getRandomValues(new Uint8Array(6));
  return `${prefix}-${Array.from(bytes, (b) => ORDER_CHARS[b % ORDER_CHARS.length]).join("")}`;
}

// ---------- theme -> CSS ----------
const kebab = (s) => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

/** CSS text for the theme: @font-face rules plus --ve-* variables on `selector`. */
export function themeCss(theme = DEFAULT_THEME, selector = ":root") {
  const t = theme.colors ? theme : DEFAULT_THEME;
  const faces = (t.fontFaces || [])
    .map((f) => `@font-face{font-family:"${f.family}";src:url("${f.src}") format("${f.src.endsWith(".woff2") ? "woff2" : f.src.endsWith(".woff") ? "woff" : f.src.endsWith(".otf") ? "opentype" : "truetype"}");font-weight:${f.weight};font-style:${f.style};font-display:swap}`)
    .join("");
  const vars = [];
  for (const [k, v] of Object.entries(t.colors)) vars.push(`--ve-${kebab(k)}:${v}`);
  for (const [k, v] of Object.entries(t.fonts)) vars.push(`--ve-font-${kebab(k)}:${v}`);
  for (const [k, v] of Object.entries(t.tints)) vars.push(`--ve-tint-${k}:${v}`);
  vars.push(`--ve-radius:${t.radius}`, `--ve-image-fit:${t.imageFit}`, `--ve-image-scale:${t.imageScale}`);
  vars.push(`--ve-button-radius:${t.button === "pill" ? "999px" : t.button === "rounded" ? "12px" : "2px"}`);
  return `${faces}${selector}{${vars.join(";")}}`;
}

/** Catalog data the browser runtime needs (embedded once per page as JSON). */
export function publicCatalog(catalog) {
  return {
    company: catalog.company,
    shop: catalog.shop,
    checkout: catalog.checkout,
    contact: { email: catalog.contact.email },
    content: catalog.content || [],
    theme: { card: catalog.theme.card, tints: Object.fromEntries(Object.keys(catalog.theme.tints).map((k) => [k, ""])) },
    categories: catalog.categories.map(({ slug, name, visible }) => ({ slug, name, visible })),
    products: catalog.products.filter((p) => p.visible),
  };
}
