// Hosted editor auth: WebCrypto only (runs on Vercel Node/Edge, Cloudflare Workers, Deno, Bun).
// Users: JSON {"username": "pbkdf2-sha256$<iterations>$<salt b64url>$<hash b64url>"} in an env var.
// Sessions: HMAC-signed cookie (HttpOnly, Secure, SameSite=Strict) with a password fingerprint, so removing an account
// or changing its password signs it out. Revoked session ids and failed-login counters live in the storage adapter.
const enc = new TextEncoder();
export const SESSION_SECONDS = 12 * 60 * 60;
export const PBKDF2_ITERATIONS = 210000;
const MIN_ITERATIONS = 10000;
const MAX_ITERATIONS = 1000000;
const MAX_FAILS_USER = 5;
const MAX_FAILS_IP = 20;
const WINDOW_SECONDS = 15 * 60;

export const b64u = (buf) => {
  let s = "";
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
export const fromB64 = (s) => {
  const norm = String(s).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(norm + "===".slice((norm.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};
export const sha256Hex = async (text) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(String(text))))].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey("raw", enc.encode(String(password)), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256));
}
function equalBytes(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Create a stored hash for a password (used by `ve-backend hosted-user`). */
export async function hashPassword(password, iterations = PBKDF2_ITERATIONS) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2-sha256$${iterations}$${b64u(salt)}$${b64u(await pbkdf2(password, salt, iterations))}`;
}

const dummyHash = (iterations) => `pbkdf2-sha256$${iterations}$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;
/** Iteration count to use for the dummy check: the highest count among the configured users' hashes (default if none parse). */
export function dummyIterations(users) {
  let best = 0;
  for (const stored of Object.values(users || {})) {
    const n = Number(String(stored).split("$")[1]);
    if (Number.isInteger(n) && n >= MIN_ITERATIONS && n <= MAX_ITERATIONS && n > best) best = n;
  }
  return best || PBKDF2_ITERATIONS;
}
/**
 * Constant-time check. Pass `undefined` for an unknown user: a dummy hash is computed so timing doesn't reveal usernames.
 * `iterations` sets that dummy's cost; pass dummyIterations(users) so it matches the real hashes.
 */
export async function verifyPassword(password, stored, iterations = PBKDF2_ITERATIONS) {
  const parts = String(stored || dummyHash(iterations)).split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2-sha256") return false;
  const count = Number(parts[1]);
  if (!Number.isInteger(count) || count < MIN_ITERATIONS || count > MAX_ITERATIONS) return false;
  let salt, want;
  try {
    salt = fromB64(parts[2]);
    want = fromB64(parts[3]);
  } catch {
    return false;
  }
  const got = await pbkdf2(password, salt, count);
  return equalBytes(got, want) && Boolean(stored);
}

export function parseUsers(raw) {
  if (!raw) return null;
  try {
    const users = JSON.parse(raw);
    return users && typeof users === "object" && !Array.isArray(users) && Object.keys(users).length ? users : null;
  } catch {
    return null;
  }
}
export const normalizeUser = (u) => (typeof u === "string" ? u.trim().toLowerCase() : "");

const hmacKey = (secret) => crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
const fingerprint = async (stored) => b64u(await crypto.subtle.digest("SHA-256", enc.encode(stored))).slice(0, 16);

export async function createSessionCookie(cfg, user, stored) {
  const sid = b64u(crypto.getRandomValues(new Uint8Array(18)));
  const payload = b64u(enc.encode(JSON.stringify({ u: user, sid, exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS, pv: await fingerprint(stored) })));
  const sig = b64u(await crypto.subtle.sign("HMAC", await hmacKey(cfg.secret), enc.encode(payload)));
  return `${cfg.cookie}=${payload}.${sig}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}`;
}
export const clearCookie = (cfg) => `${cfg.cookie}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;

function readCookie(request, name) {
  for (const part of (request.headers.get("cookie") || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return "";
}

/** { user, sid, exp } for a valid, unexpired, unrevoked session whose account still has the same password, else null. */
export async function getSession(request, cfg, kv) {
  const raw = readCookie(request, cfg.cookie);
  const dot = raw.indexOf(".");
  if (dot < 1 || !cfg.secret) return null;
  const payload = raw.slice(0, dot);
  let sig;
  try {
    sig = fromB64(raw.slice(dot + 1));
  } catch {
    return null;
  }
  if (!(await crypto.subtle.verify("HMAC", await hmacKey(cfg.secret), sig, enc.encode(payload)))) return null;
  let data;
  try {
    data = JSON.parse(new TextDecoder().decode(fromB64(payload)));
  } catch {
    return null;
  }
  if (!data || typeof data.exp !== "number" || data.exp < Date.now() / 1000) return null;
  const stored = Object.prototype.hasOwnProperty.call(cfg.users, data.u) ? cfg.users[data.u] : undefined;
  if (!stored || data.pv !== (await fingerprint(stored))) return null;
  const revoked = await kv.get(`session-revoked-${await sha256Hex(data.sid)}`);
  if (revoked && revoked.until > Date.now()) return null;
  return { user: data.u, sid: data.sid, exp: data.exp };
}
export async function revokeSession(kv, session) {
  await kv.put(`session-revoked-${await sha256Hex(session.sid)}`, { until: session.exp * 1000 });
}

// Failed-login limits for 15 minutes: 5 per (account + network address) and 20 per network address, so one stranger can't
// lock a real account out for everyone. Each limit is ONE fixed Blob key holding { count, until }; an expired key is
// reused or deleted, and names that aren't real accounts share a single "-" key per address, so failures can't create
// unbounded new keys. Storage writes are last-writer-wins, so this is a strong brake, not an exact counter.
// `user` should be a configured account name, or "" for an unknown one.
const rlKeys = async (ip, user) => [[`rl-ua-${await sha256Hex(`${ip}\n${user || "-"}`)}`, MAX_FAILS_USER], [`rl-ip-${await sha256Hex(ip)}`, MAX_FAILS_IP]];
export async function rateLimited(kv, ip, user) {
  for (const [key, max] of await rlKeys(ip, user)) {
    const v = await kv.get(key);
    if (v && v.until <= Date.now()) await kv.del(key);
    else if (v && v.count >= max) return Math.ceil((v.until - Date.now()) / 1000);
  }
  return 0;
}
export async function recordFailure(kv, ip, user) {
  for (const [key, max] of await rlKeys(ip, user)) {
    const v = (await kv.get(key)) || { count: 0, until: 0 };
    const fresh = v.until > Date.now();
    const next = { count: fresh ? v.count + 1 : 1, until: fresh ? v.until : Date.now() + WINDOW_SECONDS * 1000 };
    if (next.count >= max) next.until = Date.now() + WINDOW_SECONDS * 1000;
    await kv.put(key, next);
  }
}
export async function clearFailures(kv, ip, user) {
  const [first] = await rlKeys(ip, user);
  await kv.del(first[0]);
}

/** CSRF guard for writes: Origin must be this site, plus a custom header (forces a CORS preflight cross-site). */
export function sameOriginWrite(request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || new URL(request.url).host;
  let o;
  try {
    o = new URL(origin);
  } catch {
    return false;
  }
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  if (o.host !== host || (o.protocol !== "https:" && !(local && o.protocol === "http:"))) return false;
  if (request.headers.get("x-requested-with") !== "ve-editor") return false;
  const site = request.headers.get("sec-fetch-site");
  return !site || site === "same-origin";
}

/** Client address as set by the host's edge (Vercel overwrites client-supplied values). */
export function clientIp(request) {
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  const fwd = request.headers.get("x-forwarded-for");
  return fwd ? fwd.split(",")[0].trim() : "unknown";
}
