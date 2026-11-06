// ve-backend sales editor: a small local server (node:http only, no dependencies).
// Adapted from Hangr's sales editor (scripts/admin-server.mjs). Edits the site's catalog JSON with
// history/undo, uploads photos into the site's public folder and serves a live-preview editor UI.
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { slugify, validateCatalog } from "../src/core.js";

const LIB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const UI_DIR = path.join(LIB, "editor", "public");
const SRC_DIR = path.join(LIB, "src");
const HISTORY_KEEP = 30;
const MAX_UPLOAD = 8 * 1024 * 1024;
const SESSION_MS = 12 * 60 * 60 * 1000;
const MAX_FAILS = 5;
const BLOCK_MS = 5 * 60 * 1000;
export const PASSCODE_ENV = "VE_EDITOR_PASSCODE";
export const PASSCODE_FILE = ".env.ve-backend.local";

/** Passcode from the environment, else from .env.ve-backend.local in the site root. Never logged. */
export function readPasscode(root, env = process.env) {
  if (env[PASSCODE_ENV]) return env[PASSCODE_ENV];
  try {
    const text = fs.readFileSync(path.join(root, PASSCODE_FILE), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(new RegExp(`^\\s*${PASSCODE_ENV}\\s*=\\s*(.*?)\\s*$`));
      if (m) return m[1].replace(/^(["'])(.*)\1$/, "$2");
    }
  } catch {
    /* missing file handled by caller */
  }
  return "";
}

/**
 * Personal admin accounts shared by every ve-backend editor for this OS user.
 * Stored as scrypt hashes in ~/.config/ve-backend/admins.json (override with VE_ADMINS_FILE). Never logged.
 */
export const ADMINS_ENV = "VE_ADMINS_FILE";
export const adminsFile = (env = process.env) => env[ADMINS_ENV] || path.join(os.homedir(), ".config", "ve-backend", "admins.json");

export function readAdmins(env = process.env) {
  try {
    const data = JSON.parse(fs.readFileSync(adminsFile(env), "utf8"));
    return data && typeof data.admins === "object" ? data.admins : {};
  } catch {
    return {};
  }
}

const SCRYPT = { N: 16384, r: 8, p: 1 };
export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, 32, SCRYPT);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}
export function verifyPassword(password, stored) {
  const [kind, salt, hash] = String(stored || "").split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const want = Buffer.from(hash, "base64url");
  const got = crypto.scryptSync(String(password), Buffer.from(salt, "base64url"), want.length, SCRYPT);
  return crypto.timingSafeEqual(got, want);
}

/** Add or replace an admin account. Username is case-insensitive. */
export function setAdmin(username, password, env = process.env) {
  const name = String(username || "").trim().toLowerCase();
  if (!/^[a-z0-9._-]{2,40}$/.test(name)) throw Object.assign(new Error("VE_ADMIN_BAD_USERNAME: use 2-40 letters, numbers, dots, dashes or underscores."), { code: "VE_ADMIN_BAD_USERNAME" });
  if (String(password || "").length < 10) throw Object.assign(new Error("VE_ADMIN_WEAK_PASSWORD: use at least 10 characters."), { code: "VE_ADMIN_WEAK_PASSWORD" });
  const file = adminsFile(env);
  const admins = readAdmins(env);
  admins[name] = { hash: hashPassword(password), updated: new Date().toISOString() };
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, `${JSON.stringify({ admins }, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(file, 0o600);
  return { username: name, file };
}

export function removeAdmin(username, env = process.env) {
  const name = String(username || "").trim().toLowerCase();
  const admins = readAdmins(env);
  if (!admins[name]) return false;
  delete admins[name];
  fs.writeFileSync(adminsFile(env), `${JSON.stringify({ admins }, null, 2)}\n`, { mode: 0o600 });
  return true;
}

const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".woff2": "font/woff2", ".woff": "font/woff", ".otf": "font/otf", ".ttf": "font/ttf",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".avif": "image/avif", ".ico": "image/x-icon",
};
const SECURITY = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "default-src 'self'; img-src 'self' https: data: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; script-src 'self'; frame-ancestors 'none'",
};

/**
 * Create the editor server. options: { root, catalog, publicDir, uploadsDir, siteUrl, passcode }
 * Returns { server, listen(port, host) }.
 */
export function createEditorServer(options) {
  const root = path.resolve(options.root || process.cwd());
  const CATALOG = path.resolve(root, options.catalog || "src/data/ve.catalog.json");
  const PUBLIC = path.resolve(root, options.publicDir || "public");
  const UPLOADS = path.resolve(root, options.uploadsDir || path.join(PUBLIC, "uploads"));
  const UPLOAD_URL = `/${path.relative(PUBLIC, UPLOADS).split(path.sep).join("/")}/`;
  const HISTORY = path.resolve(root, ".ve-backend", "history");
  const SITE_URL = options.siteUrl || "";
  const PASSCODE = options.passcode;
  const ENV = options.env || process.env;
  if (!PASSCODE && !Object.keys(readAdmins(ENV)).length) {
    const e = new Error(`VE_EDITOR_NO_PASSCODE: set ${PASSCODE_ENV} in the environment or in ${path.join(root, PASSCODE_FILE)} (keep that file out of git).`);
    e.code = "VE_EDITOR_NO_PASSCODE";
    throw e;
  }
  if (!fs.existsSync(CATALOG)) {
    const e = new Error(`VE_EDITOR_NO_CATALOG: ${CATALOG} not found. Run "npx ve-backend init" first or pass --catalog <file>.`);
    e.code = "VE_EDITOR_NO_CATALOG";
    throw e;
  }
  const sha = (v) => crypto.createHash("sha256").update(String(v)).digest();
  const passcodeOk = (attempt) => Boolean(PASSCODE) && crypto.timingSafeEqual(sha(attempt), sha(PASSCODE));
  // Admin accounts are re-read on each sign-in so `ve-backend admin set` takes effect without a restart.
  const adminOk = (username, password) => {
    const record = readAdmins(ENV)[String(username).trim().toLowerCase()];
    // Hash a dummy when the user is unknown so timing doesn't reveal which usernames exist.
    return verifyPassword(password, record?.hash || "scrypt$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA") && Boolean(record);
  };

  const sessions = new Map();
  const failures = new Map();
  const newSession = () => {
    const token = crypto.randomBytes(32).toString("base64url");
    sessions.set(token, Date.now() + SESSION_MS);
    return token;
  };
  const cookieToken = (req) => /(?:^|;\s*)ve_editor=([^;]+)/.exec(req.headers.cookie || "")?.[1] || "";
  const authed = (req) => {
    const t = cookieToken(req);
    const exp = t && sessions.get(t);
    if (!exp) return false;
    if (exp < Date.now()) {
      sessions.delete(t);
      return false;
    }
    return true;
  };
  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [t, e] of sessions) if (e < now) sessions.delete(t);
    for (const [ip, f] of failures) if (f.blockedUntil < now && f.count === 0) failures.delete(ip);
  }, 60_000);
  sweeper.unref();

  const send = (res, status, body, headers = {}) => {
    res.writeHead(status, { ...SECURITY, "Cache-Control": "no-store", ...headers });
    res.end(body);
  };
  const sendJson = (res, status, data, headers = {}) => send(res, status, JSON.stringify(data), { "Content-Type": "application/json; charset=utf-8", ...headers });
  async function readBody(req, limit) {
    const chunks = [];
    let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > limit) {
        const e = new Error("too large");
        e.code = "TOO_LARGE";
        throw e;
      }
      chunks.push(c);
    }
    return Buffer.concat(chunks);
  }
  async function serveFile(res, file, headers = {}) {
    try {
      const data = await fsp.readFile(file);
      send(res, 200, data, { "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream", ...headers });
    } catch {
      send(res, 404, "Not found", { "Content-Type": "text/plain" });
    }
  }
  const inside = (dir, file) => {
    const rel = path.relative(dir, file);
    return rel && !rel.startsWith("..") && !path.isAbsolute(rel);
  };

  // ---------- catalog storage with history (one writer, atomic replace) ----------
  let chain = Promise.resolve();
  const serial = (fn) => {
    const next = chain.then(fn, fn);
    chain = next.catch(() => {});
    return next;
  };
  const readCatalog = async () => JSON.parse(await fsp.readFile(CATALOG, "utf8"));
  const listHistory = async () => {
    try {
      return (await fsp.readdir(HISTORY)).filter((f) => /^catalog-.*\.json$/.test(f)).sort();
    } catch {
      return [];
    }
  };
  const atomicWrite = async (file, data) => {
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    await fsp.writeFile(tmp, data);
    await fsp.rename(tmp, file);
  };
  const serialize = (c) => `${JSON.stringify(c, null, 2)}\n`;
  const saveCatalog = (value) =>
    serial(async () => {
      await fsp.mkdir(HISTORY, { recursive: true });
      const current = await fsp.readFile(CATALOG, "utf8");
      const next = serialize(value);
      if (current !== next) {
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        await atomicWrite(path.join(HISTORY, `catalog-${stamp}-${crypto.randomBytes(2).toString("hex")}.json`), current);
        const files = await listHistory();
        for (const old of files.slice(0, Math.max(0, files.length - HISTORY_KEEP))) await fsp.rm(path.join(HISTORY, old), { force: true });
        await atomicWrite(CATALOG, next);
      }
    });
  const undoCatalog = () =>
    serial(async () => {
      const files = await listHistory();
      if (!files.length) return false;
      const last = files[files.length - 1];
      const text = await fsp.readFile(path.join(HISTORY, last), "utf8");
      JSON.parse(text);
      await atomicWrite(CATALOG, text);
      await fsp.rm(path.join(HISTORY, last), { force: true });
      return true;
    });
  const payload = async () => {
    const history = await listHistory();
    return { catalog: await readCatalog(), undoCount: history.length, lastSaved: history.length ? history[history.length - 1].slice(8, 27) : null, siteUrl: SITE_URL, uploadBase: UPLOAD_URL };
  };

  const sniffImage = (b) => {
    if (b.length > 12 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
    if (b.length > 12 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
    if (b.length > 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
    if (b.length > 12 && b.subarray(4, 12).toString("latin1") === "ftypavif") return "avif";
    return null;
  };

  async function api(req, res, url) {
    const ip = req.socket.remoteAddress || "unknown";
    if (url.pathname === "/api/login" && req.method === "POST") {
      const f = failures.get(ip) || { count: 0, blockedUntil: 0 };
      if (f.blockedUntil > Date.now()) return sendJson(res, 429, { error: "Too many tries. Please wait a few minutes and try again." });
      let body;
      try {
        body = JSON.parse((await readBody(req, 4096)).toString("utf8"));
      } catch {
        return sendJson(res, 400, { error: "Please enter your password or the team passcode." });
      }
      const username = typeof body.username === "string" ? body.username.trim() : "";
      const secret = typeof body.password === "string" ? body.password : typeof body.passcode === "string" ? body.passcode : "";
      const ok = secret && (username ? adminOk(username, secret) : passcodeOk(secret));
      if (ok) {
        failures.delete(ip);
        return sendJson(res, 200, { ok: true }, { "Set-Cookie": `ve_editor=${newSession()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}` });
      }
      f.count += 1;
      if (f.count >= MAX_FAILS) {
        f.blockedUntil = Date.now() + BLOCK_MS;
        f.count = 0;
      }
      failures.set(ip, f);
      await new Promise((r) => setTimeout(r, 400));
      return sendJson(res, 401, { error: username ? "That username and password didn't match. Please try again." : "That passcode didn't work. Please try again." });
    }
    if (url.pathname === "/api/session" && req.method === "GET") return sendJson(res, 200, { signedIn: authed(req) });
    if (url.pathname === "/api/logout" && req.method === "POST") {
      sessions.delete(cookieToken(req));
      return sendJson(res, 200, { ok: true }, { "Set-Cookie": "ve_editor=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0" });
    }
    if (!authed(req)) return sendJson(res, 401, { error: "Please sign in again.", signedOut: true });
    if (req.method !== "GET" && req.headers["x-requested-with"] !== "ve-editor") return sendJson(res, 403, { error: "Request blocked." });

    if (url.pathname === "/api/catalog" && req.method === "GET") return sendJson(res, 200, await payload());
    if (url.pathname === "/api/catalog" && req.method === "PUT") {
      let body;
      try {
        body = JSON.parse((await readBody(req, 2 * 1024 * 1024)).toString("utf8"));
      } catch {
        return sendJson(res, 400, { error: "Something went wrong reading your changes. Please try again." });
      }
      const result = validateCatalog(body);
      if (result.errors) return sendJson(res, 422, { error: "Some details need a quick fix. Look for the red notes.", errors: result.errors });
      await saveCatalog(result.value);
      return sendJson(res, 200, await payload());
    }
    if (url.pathname === "/api/validate" && req.method === "POST") {
      let body;
      try {
        body = JSON.parse((await readBody(req, 2 * 1024 * 1024)).toString("utf8"));
      } catch {
        return sendJson(res, 400, { error: "Invalid JSON." });
      }
      const result = validateCatalog(body);
      return sendJson(res, 200, result.errors ? { errors: result.errors } : { ok: true });
    }
    if (url.pathname === "/api/undo" && req.method === "POST") {
      if (!(await undoCatalog())) return sendJson(res, 409, { error: "There's nothing to undo yet." });
      return sendJson(res, 200, await payload());
    }
    if (url.pathname === "/api/upload" && req.method === "POST") {
      let buf;
      try {
        buf = await readBody(req, MAX_UPLOAD);
      } catch (e) {
        if (e.code === "TOO_LARGE") {
          req.resume();
          return sendJson(res, 413, { error: "That photo is over 8 MB. Please choose a smaller one." });
        }
        throw e;
      }
      const ext = sniffImage(buf);
      if (!ext) return sendJson(res, 415, { error: "Please choose a JPG, PNG, WebP or AVIF photo." });
      const name = `${slugify(url.searchParams.get("slug") || "") || "photo"}-${crypto.randomBytes(4).toString("hex")}.${ext}`;
      await fsp.mkdir(UPLOADS, { recursive: true });
      await atomicWrite(path.join(UPLOADS, name), buf);
      return sendJson(res, 200, { path: `${UPLOAD_URL}${name}` });
    }
    return sendJson(res, 404, { error: "Not found." });
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      if (url.pathname.startsWith("/api/")) return await api(req, res, url);
      if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Method not allowed");
      const p = decodeURIComponent(url.pathname);
      if (p === "/" || p === "/index.html") return serveFile(res, path.join(UI_DIR, "index.html"));
      if (/^\/editor\/[a-z0-9-]+\.(js|css|svg)$/.test(p)) return serveFile(res, path.join(UI_DIR, p.slice(8)));
      if (/^\/ve\/[a-z0-9-]+\.(js|css)$/.test(p)) return serveFile(res, path.join(SRC_DIR, p.slice(4)));
      // Site's public folder (read-only) so previews show real images and fonts.
      const file = path.resolve(PUBLIC, `.${p}`);
      if (inside(PUBLIC, file) && MIME[path.extname(file).toLowerCase()] && !path.basename(file).startsWith(".")) return serveFile(res, file, { "Cache-Control": "no-cache" });
      send(res, 404, "Not found", { "Content-Type": "text/plain" });
    } catch (error) {
      console.error(`[ve-editor] VE_EDITOR_REQUEST_FAILED ${req.method} ${req.url?.split("?")[0]}: ${error?.message || error}`);
      if (!res.headersSent) sendJson(res, 500, { error: "Something went wrong on our side. Please try again." });
      else res.end();
    }
  });
  return {
    server,
    catalogPath: CATALOG,
    listen: (port, host = "127.0.0.1") =>
      new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => resolve(server.address()));
      }),
    close: () => new Promise((r) => server.close(() => r())),
  };
}
