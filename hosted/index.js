// ve-backend hosted editor: the sales editor as Web-standard (Request) => Response handlers.
// Works anywhere with Request/Response/WebCrypto: Vercel Functions, Cloudflare Workers, Deno, Bun, Node 18+.
// Security matches the local editor and Hangr's hosted editor: PBKDF2 users, HMAC sessions, CSRF, rate limit, upload sniffing.
// See docs/hosted.md.
import { publicCatalog, slugify, validateCatalog } from "../src/core.js";
import { clearCookie, dummyIterations, clearFailures, clientIp, createSessionCookie, getSession, normalizeUser, parseUsers, rateLimited, recordFailure, revokeSession, sameOriginWrite, verifyPassword } from "./auth.js";

export { fileStorage, memoryStorage, vercelBlobStorage } from "./storage.js";
export { hashPassword, verifyPassword } from "./auth.js";
export { uiFile, UI_FILES } from "./ui.js";

const HISTORY_KEEP = 30;
const MAX_JSON = 2 * 1024 * 1024;
const MAX_UPLOAD = 4 * 1024 * 1024; // Vercel Functions reject request bodies over 4.5 MB
const EXT_TYPE = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", avif: "image/avif" };

export const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "X-Robots-Tag": "noindex, nofollow",
  "Strict-Transport-Security": "max-age=31536000",
  "Content-Security-Policy": "default-src 'self'; img-src 'self' https: data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};

export function sniffImage(b) {
  if (b.length > 12 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.length > 12 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v)) return "png";
  const ascii = (from, to) => String.fromCharCode(...b.subarray(from, to));
  if (b.length > 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  if (b.length > 12 && ascii(4, 12) === "ftypavif") return "avif";
  return null;
}

const jsonResponse = (status, data, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { ...SECURITY_HEADERS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers } });

function fail(code, message) {
  return Object.assign(new Error(`${code}: ${message}`), { code });
}

/**
 * Create the hosted editor.
 * options:
 *   storage        adapter (vercelBlobStorage(), fileStorage(), memoryStorage())   required
 *   seed           catalog object used until the first save (your bundled ve.catalog.json)   required
 *   apiBase        where the editor API is mounted (default "/api/admin")
 *   mediaBase      public photo route (default "/api/media"); upload paths are `${mediaBase}/<file>`
 *   siteUrl        link shown in the editor ("View site")
 *   env            object or () => object with settings (default process.env)
 *   usersEnv       env var holding the users JSON (default VE_ADMIN_USERS)
 *   secretEnv      env var holding the session secret, 32+ chars (default VE_SESSION_SECRET)
 *   cookie         session cookie name (default "__Host-ve_editor")
 *   maxUpload      bytes (default 4 MB)
 *   publicCache    Cache-Control for the public catalog (default "public, max-age=0, s-maxage=5, stale-while-revalidate=30": the CDN reuses it for 5 s, browsers always revalidate)
 *   cors           Access-Control-Allow-Origin for the PUBLIC catalog (default "*"; "" disables)
 * Returns { admin, publicCatalog, media }, each (Request) => Promise<Response>.
 */
export function createHostedEditor(options = {}) {
  const { storage, seed } = options;
  if (!storage || typeof storage.get !== "function") throw fail("VE_HOSTED_NO_STORAGE", "pass storage: vercelBlobStorage({ prefix }) (or fileStorage/memoryStorage).");
  if (!seed || typeof seed !== "object") throw fail("VE_HOSTED_NO_SEED", "pass seed: your ve.catalog.json object, used until the first save.");
  const apiBase = (options.apiBase || "/api/admin").replace(/\/$/, "");
  const mediaBase = (options.mediaBase || "/api/media").replace(/\/$/, "");
  const maxUpload = options.maxUpload || MAX_UPLOAD;
  const usersEnv = options.usersEnv || "VE_ADMIN_USERS";
  const secretEnv = options.secretEnv || "VE_SESSION_SECRET";
  const cookie = options.cookie || "__Host-ve_editor";
  const publicCache = options.publicCache || "public, max-age=0, s-maxage=5, stale-while-revalidate=30";
  const cors = options.cors === undefined ? "*" : options.cors;
  const getEnv = () => (typeof options.env === "function" ? options.env() : options.env || globalThis.process?.env || {});

  const log = (code, operation, detail, next) => console.error(JSON.stringify({ code, operation, detail, next }));

  /** Settings problems are explained to the site owner in the log; the browser gets a generic message and the code. */
  function config() {
    const env = getEnv();
    const secret = env[secretEnv] || "";
    if (secret.length < 32) return { problem: ["VE_HOSTED_NO_SESSION_SECRET", `${secretEnv} is missing or shorter than 32 characters`, `Set ${secretEnv} to a random 32+ character value (docs/hosted.md, "Environment variables").`] };
    const users = parseUsers(env[usersEnv]);
    if (!users) return { problem: ["VE_HOSTED_NO_USERS", `${usersEnv} is missing or not a JSON object of username -> hash`, `Run \`npx ve-backend hosted-user add <name>\` and set ${usersEnv} to its output.`] };
    return { cfg: { secret, users, cookie } };
  }
  const configFailure = (problem) => {
    log(problem[0], "hosted-editor-config", problem[1], problem[2]);
    return jsonResponse(500, { error: "The editor isn't set up yet. Ask the site owner to finish setup.", code: problem[0] });
  };

  // ---------- catalog storage with history ----------
  const CURRENT = "catalog-current";
  // Content blocks/fields that the site's seed gained after the first save (new editable sections shipped in a deploy)
  // are added to the stored catalog on read, so they show up in the editor and the live overlay without losing saved values.
  const withSeedContent = (catalog) => {
    if (!Array.isArray(seed.content) || !seed.content.length) return catalog;
    const stored = Array.isArray(catalog.content) ? catalog.content : [];
    let changed = !Array.isArray(catalog.content);
    const content = stored.map((b) => {
      const sb = b && seed.content.find((x) => x.id === b.id);
      const missing = sb && Array.isArray(b.fields) ? sb.fields.filter((f) => !b.fields.some((x) => x.id === f.id)) : [];
      if (!missing.length) return b;
      changed = true;
      return { ...b, fields: [...b.fields, ...structuredClone(missing)] };
    });
    for (const sb of seed.content) if (!stored.some((b) => b && b.id === sb.id)) { content.push(structuredClone(sb)); changed = true; }
    return changed ? { ...catalog, content } : catalog;
  };
  const readCurrent = async () => {
    const doc = await storage.get(CURRENT);
    if (doc && doc.catalog && typeof doc.catalog === "object") return { history: [], ...doc, catalog: withSeedContent(doc.catalog) };
    return { catalog: seed, version: 0, savedAt: null, savedBy: null, history: [] };
  };
  const payload = (doc) => ({
    catalog: doc.catalog,
    undoCount: doc.history.length,
    lastSaved: doc.savedAt,
    savedBy: doc.savedBy,
    version: doc.version,
    siteUrl: options.siteUrl || "",
    uploadBase: `${mediaBase}/`,
    maxUpload,
  });
  let chain = Promise.resolve();
  const serial = (fn) => {
    const next = chain.then(fn, fn);
    chain = next.catch(() => {});
    return next;
  };
  const STALE_MESSAGE = "Someone else saved changes. Reload to see them before saving.";
  const save = (value, user, expected) =>
    serial(async () => {
      const current = await readCurrent();
      if (expected !== undefined && expected !== String(current.version || 0)) return { conflict: true };
      if (JSON.stringify(current.catalog) === JSON.stringify(value)) return current;
      const key = `catalog-v-${String(current.version || 0).padStart(6, "0")}-${crypto.randomUUID().slice(0, 8)}`;
      const { history, ...prev } = current;
      await storage.put(key, prev);
      const nextHistory = [...history, key];
      const dropped = nextHistory.splice(0, Math.max(0, nextHistory.length - HISTORY_KEEP));
      const next = { catalog: value, version: (current.version || 0) + 1, savedAt: new Date().toISOString(), savedBy: user, history: nextHistory };
      await storage.put(CURRENT, next);
      await Promise.all(dropped.map((k) => storage.del(k)));
      return next;
    });
  const undo = (user) =>
    serial(async () => {
      const current = await readCurrent();
      const history = [...current.history];
      let prev = null;
      let key;
      while (!prev && history.length) {
        key = history.pop();
        prev = await storage.get(key);
      }
      if (!prev || !prev.catalog) return null;
      const next = { catalog: prev.catalog, version: (current.version || 0) + 1, savedAt: new Date().toISOString(), savedBy: `${user} (undo)`, history };
      await storage.put(CURRENT, next);
      await storage.del(key);
      return next;
    });

  async function readJson(request, limit) {
    const text = await request.text();
    if (text.length > limit) throw Object.assign(new Error("too large"), { code: "TOO_LARGE" });
    return JSON.parse(text);
  }

  // ---------- admin API (everything under apiBase) ----------
  async function admin(request) {
    const url = new URL(request.url);
    if (!(url.pathname === apiBase || url.pathname.startsWith(`${apiBase}/`))) return jsonResponse(404, { error: "Not found." });
    const route = url.pathname.slice(apiBase.length) || "/";
    const method = request.method.toUpperCase();
    try {
      const c = config();
      if (c.problem) return configFailure(c.problem);
      const { cfg } = c;
      if (method !== "GET" && method !== "HEAD" && !sameOriginWrite(request)) return jsonResponse(403, { error: "Request blocked.", code: "VE_HOSTED_CSRF" });

      if (route === "/login" && method === "POST") {
        const ip = clientIp(request);
        let body;
        try {
          body = await readJson(request, 4096);
        } catch {
          return jsonResponse(400, { error: "Please enter your username and password." });
        }
        const user = normalizeUser(body?.username);
        const password = typeof body?.password === "string" ? body.password : "";
        if (!user || !password || password.length > 512) return jsonResponse(400, { error: "Please enter your username and password." });
        const known = Object.prototype.hasOwnProperty.call(cfg.users, user) ? user : "";
        const wait = await rateLimited(storage, ip, known);
        if (wait) return jsonResponse(429, { error: "Too many tries. Please wait a few minutes and try again.", code: "VE_HOSTED_RATE_LIMITED", retryAfter: wait }, { "Retry-After": String(wait) });
        const stored = known ? cfg.users[user] : undefined;
        if (await verifyPassword(password, stored, dummyIterations(cfg.users))) {
          await clearFailures(storage, ip, known);
          return jsonResponse(200, { ok: true, user }, { "Set-Cookie": await createSessionCookie(cfg, user, stored) });
        }
        await recordFailure(storage, ip, known);
        return jsonResponse(401, { error: "That username and password didn't match. Please try again.", code: "VE_HOSTED_BAD_LOGIN" });
      }

      const session = await getSession(request, cfg, storage);
      if (route === "/session" && method === "GET") return jsonResponse(200, { signedIn: Boolean(session), user: session?.user || null });
      if (route === "/logout" && method === "POST") {
        if (session) await revokeSession(storage, session);
        return jsonResponse(200, { ok: true }, { "Set-Cookie": clearCookie(cfg) });
      }
      if (!session) return jsonResponse(401, { error: "Please sign in again.", signedOut: true });

      if (route === "/catalog" && method === "GET") return jsonResponse(200, payload(await readCurrent()));
      if (route === "/catalog" && method === "PUT") {
        let body;
        try {
          body = await readJson(request, MAX_JSON);
        } catch {
          return jsonResponse(400, { error: "Something went wrong reading your changes. Please try again." });
        }
        const result = validateCatalog(body);
        if (result.errors) return jsonResponse(422, { error: "Some details need a quick fix. Look for the red notes.", errors: result.errors, code: "VE_CATALOG_INVALID" });
        // Optimistic concurrency: the editor sends the version it loaded as ?version= (or If-Match). Absent = old client, no check.
        const sent = url.searchParams.get("version") ?? request.headers.get("if-match");
        const saved = await save(result.value, session.user, sent === null ? undefined : String(sent).replace(/^"|"$/g, ""));
        if (saved.conflict) return jsonResponse(409, { error: STALE_MESSAGE, code: "VE_HOSTED_STALE", stale: true });
        return jsonResponse(200, payload(saved));
      }
      if (route === "/validate" && method === "POST") {
        let body;
        try {
          body = await readJson(request, MAX_JSON);
        } catch {
          return jsonResponse(400, { error: "Invalid JSON." });
        }
        const result = validateCatalog(body);
        return jsonResponse(200, result.errors ? { errors: result.errors } : { ok: true });
      }
      if (route === "/undo" && method === "POST") {
        const next = await undo(session.user);
        return next ? jsonResponse(200, payload(next)) : jsonResponse(409, { error: "There's nothing to undo yet." });
      }
      if (route === "/upload" && method === "POST") {
        if (Number(request.headers.get("content-length") || 0) > maxUpload) return jsonResponse(413, { error: `That photo is over ${Math.round(maxUpload / 1048576)} MB. Please choose a smaller one.` });
        const buf = new Uint8Array(await request.arrayBuffer());
        if (buf.length > maxUpload) return jsonResponse(413, { error: `That photo is over ${Math.round(maxUpload / 1048576)} MB. Please choose a smaller one.` });
        const ext = sniffImage(buf);
        if (!ext) return jsonResponse(415, { error: "Please choose a JPG, PNG, WebP or AVIF photo." });
        const rand = [...crypto.getRandomValues(new Uint8Array(4))].map((b) => b.toString(16).padStart(2, "0")).join("");
        const name = `${slugify(url.searchParams.get("slug") || "").slice(0, 40) || "photo"}-${rand}.${ext}`;
        await storage.putFile(name, buf, EXT_TYPE[ext]);
        return jsonResponse(200, { path: `${mediaBase}/${name}` });
      }
      return jsonResponse(404, { error: "Not found." });
    } catch (error) {
      log("VE_HOSTED_HANDLER_FAILED", `${method} ${route}`, String(error?.message || error), "Check the storage adapter (Blob token/store) and retry; reads are safe to retry.");
      return jsonResponse(500, { error: "Something went wrong on our side. Please try again.", code: "VE_HOSTED_HANDLER_FAILED" });
    }
  }

  // ---------- public routes (no login) ----------
  async function publicCatalogRoute(request) {
    try {
      const doc = await readCurrent();
      const result = validateCatalog(doc.catalog);
      if (result.errors) {
        log("VE_HOSTED_STORED_INVALID", "GET public catalog", Object.keys(result.errors).slice(0, 5).join(", "), "Open the editor, fix the listed fields and save.");
        return jsonResponse(503, { error: "Catalog unavailable.", code: "VE_HOSTED_STORED_INVALID" });
      }
      const etag = `"ve-${doc.version}-${doc.savedAt || "seed"}"`;
      const headers = { "Cache-Control": publicCache, ETag: etag, ...(cors ? { "Access-Control-Allow-Origin": cors } : {}), "X-Content-Type-Options": "nosniff" };
      if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
      return new Response(JSON.stringify({ catalog: publicCatalog(result.value), version: doc.version, savedAt: doc.savedAt }), { status: 200, headers: { ...headers, "Content-Type": "application/json; charset=utf-8" } });
    } catch (error) {
      log("VE_HOSTED_HANDLER_FAILED", "GET public catalog", String(error?.message || error), "Check the storage adapter and retry.");
      return jsonResponse(500, { error: "Catalog unavailable.", code: "VE_HOSTED_HANDLER_FAILED" });
    }
  }
  async function media(request) {
    let name;
    try {
      name = decodeURIComponent(new URL(request.url).pathname.split("/").pop() || "");
    } catch {
      return new Response("Bad request", { status: 400 });
    }
    const m = /^[a-z0-9][a-z0-9-]{0,60}\.(jpg|png|webp|avif)$/.exec(name);
    if (!m) return new Response("Not found", { status: 404 });
    try {
      const file = await storage.getFile(name);
      if (!file) return new Response("Not found", { status: 404 });
      return new Response(file.body, { headers: { "Content-Type": EXT_TYPE[m[1]], "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" } });
    } catch (error) {
      log("VE_HOSTED_MEDIA_FAILED", "GET media", String(error?.message || error), "Check the storage adapter; the photo may not exist in this store/prefix.");
      return new Response("Not found", { status: 404 });
    }
  }

  return { admin, publicCatalog: publicCatalogRoute, media, storage };
}
