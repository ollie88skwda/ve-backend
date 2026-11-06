// Hosted editor handlers: auth, CSRF, rate limit, validation, undo, upload sniffing, public catalog, user CLI, live helpers.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHostedEditor, memoryStorage, hashPassword, verifyPassword, sniffImage, uiFile, UI_FILES } from "../hosted/index.js";
import { fetchLiveCatalog, liveContent, mergeLiveProducts } from "../src/live.js";
import { getContent } from "../src/core.js";

const seed = JSON.parse(readFileSync(new URL("../templates/ve.catalog.json", import.meta.url), "utf8"));
const ORIGIN = "https://shop.example";
const SECRET = "s".repeat(40);
let users, env, editor, storage, cookie = "";

const req = (method, path, { body, headers = {}, raw, origin = ORIGIN, ip = "1.2.3.4" } = {}) =>
  new Request(`${ORIGIN}${path}`, {
    method,
    headers: { host: "shop.example", "x-real-ip": ip, "x-requested-with": "ve-editor", ...(origin ? { origin } : {}), ...(cookie ? { cookie } : {}), ...(body && !raw ? { "content-type": "application/json" } : {}), ...headers },
    body: raw ?? (body ? JSON.stringify(body) : undefined),
  });
const admin = (...a) => editor.admin(req(...a));
const login = async (user = "alex", password = "correct horse battery", extra = {}) => admin("POST", "/api/admin/login", { body: { username: user, password }, ...extra });

before(async () => {
  users = { alex: await hashPassword("correct horse battery"), bob: await hashPassword("another long password") };
  env = { VE_ADMIN_USERS: JSON.stringify(users), VE_SESSION_SECRET: SECRET };
  storage = memoryStorage();
  editor = createHostedEditor({ storage, seed, env: () => env });
  const r = await login();
  assert.equal(r.status, 200);
  cookie = r.headers.get("set-cookie").split(";")[0];
});

test("session cookie is HttpOnly, Secure, SameSite=Strict and host-bound", async () => {
  const r = await login("bob", "another long password");
  const c = r.headers.get("set-cookie");
  assert.match(c, /^__Host-ve_editor=/);
  assert.match(c, /HttpOnly/);
  assert.match(c, /Secure/);
  assert.match(c, /SameSite=Strict/);
  assert.match(c, /Path=\//);
  assert.doesNotMatch(c, /Domain=/);
});

test("responses carry security headers and never leak hashes or secrets", async () => {
  const r = await admin("GET", "/api/admin/catalog");
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("x-frame-options"), "DENY");
  assert.match(r.headers.get("content-security-policy"), /frame-ancestors 'none'/);
  assert.equal(r.headers.get("cache-control"), "no-store");
  const text = await r.text();
  assert.ok(!text.includes("pbkdf2"));
  assert.ok(!text.includes(SECRET));
});

test("API is locked without a session; unknown user and wrong password both fail the same way", async () => {
  cookie = "";
  assert.equal((await admin("GET", "/api/admin/catalog")).status, 401);
  const a = await login("alex", "wrong password!!", { ip: "9.9.9.1" });
  const b = await login("nobody", "wrong password!!", { ip: "9.9.9.2" });
  assert.equal(a.status, 401);
  assert.equal(b.status, 401);
  assert.deepEqual(await a.json(), await b.json());
  const ok = await login();
  cookie = ok.headers.get("set-cookie").split(";")[0];
  assert.equal((await admin("GET", "/api/admin/session")).status, 200);
  assert.equal((await (await admin("GET", "/api/admin/session")).json()).signedIn, true);
});

test("CSRF: writes need same-origin Origin plus the X-Requested-With header", async () => {
  const noOrigin = await admin("POST", "/api/admin/undo", { origin: null });
  const evil = await admin("POST", "/api/admin/undo", { origin: "https://evil.example" });
  const noHeader = await admin("POST", "/api/admin/undo", { headers: { "x-requested-with": "" } });
  const crossSite = await admin("POST", "/api/admin/undo", { headers: { "sec-fetch-site": "cross-site" } });
  for (const r of [noOrigin, evil, noHeader, crossSite]) assert.equal(r.status, 403);
});

test("rate limit: 5 failures lock the account, even with the right password", async () => {
  const saved = cookie;
  cookie = "";
  for (let i = 0; i < 5; i++) assert.equal((await login("bob", "wrong password!!", { ip: `8.8.8.${i}` })).status, 401);
  const locked = await login("bob", "another long password", { ip: "8.8.8.99" });
  assert.equal(locked.status, 429);
  assert.ok(Number(locked.headers.get("retry-after")) > 0);
  cookie = saved;
});

test("per-address limit blocks password spraying across usernames", async () => {
  const saved = cookie;
  cookie = "";
  let last;
  for (let i = 0; i < 21; i++) last = await login(`spray${i}`, "wrong password!!", { ip: "7.7.7.7" });
  assert.equal(last.status, 429);
  cookie = saved;
});

test("catalog GET/PUT round trip; invalid catalogs are rejected with field errors and nothing is saved", async () => {
  const { catalog } = await (await admin("GET", "/api/admin/catalog")).json();
  const bad = structuredClone(catalog);
  bad.products[0].price = "free";
  const r = await admin("PUT", "/api/admin/catalog", { body: bad });
  assert.equal(r.status, 422);
  const body = await r.json();
  assert.ok(Object.keys(body.errors).some((k) => k.includes("price")));
  assert.equal((await (await admin("GET", "/api/admin/catalog")).json()).catalog.products[0].price, catalog.products[0].price);
  assert.equal((await admin("PUT", "/api/admin/catalog", { raw: "{not json" })).status, 400);
  assert.equal((await admin("POST", "/api/admin/validate", { body: bad })).status, 200);
  assert.ok((await (await admin("POST", "/api/admin/validate", { body: bad })).json()).errors);
});

test("save, history count, undo restore exact previous catalog", async () => {
  const first = await (await admin("GET", "/api/admin/catalog")).json();
  const edited = structuredClone(first.catalog);
  edited.products[0].price = 77.5;
  const saved = await admin("PUT", "/api/admin/catalog", { body: edited });
  assert.equal(saved.status, 200);
  const sp = await saved.json();
  assert.equal(sp.catalog.products[0].price, 77.5);
  assert.equal(sp.undoCount, 1);
  assert.equal(sp.savedBy, "alex");
  const un = await (await admin("POST", "/api/admin/undo")).json();
  assert.equal(un.catalog.products[0].price, first.catalog.products[0].price);
  assert.equal(un.undoCount, 0);
  assert.equal((await admin("POST", "/api/admin/undo")).status, 409);
});

test("upload accepts real images only and the public media route serves them", async () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1]);
  const ok = await admin("POST", "/api/admin/upload?slug=Rose%20Soap", { raw: png, headers: { "content-type": "image/png" } });
  assert.equal(ok.status, 200);
  const { path } = await ok.json();
  assert.match(path, /^\/api\/media\/rose-soap-[0-9a-f]{8}\.png$/);
  cookie = "";
  const media = await editor.media(new Request(`${ORIGIN}${path}`));
  assert.equal(media.status, 200);
  assert.equal(media.headers.get("content-type"), "image/png");
  assert.equal(media.headers.get("x-content-type-options"), "nosniff");
  assert.equal((await editor.media(new Request(`${ORIGIN}/api/media/..%2Fcatalog-current.json`))).status, 404);
  assert.equal((await editor.media(new Request(`${ORIGIN}/api/media/missing-00000000.png`))).status, 404);
  const ck = await login();
  cookie = ck.headers.get("set-cookie").split(";")[0];
  const svg = await admin("POST", "/api/admin/upload", { raw: new TextEncoder().encode("<svg onload=alert(1)></svg> padding padding"), headers: { "content-type": "image/png" } });
  assert.equal(svg.status, 415);
  assert.equal((await admin("POST", "/api/admin/upload", { raw: new Uint8Array(4 * 1024 * 1024 + 1).fill(0xff) })).status, 413);
  assert.equal(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0])), "jpg");
});

test("public catalog needs no login, hides private fields, and is cache friendly", async () => {
  const withPrivate = structuredClone((await (await admin("GET", "/api/admin/catalog")).json()).catalog);
  withPrivate.contact.email = "team@example.com";
  withPrivate.theme.tints = { rose: "#ffaaaa" };
  assert.equal((await admin("PUT", "/api/admin/catalog", { body: withPrivate })).status, 200);
  cookie = "";
  const r = await editor.publicCatalog(new Request(`${ORIGIN}/api/catalog`));
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("access-control-allow-origin"), "*");
  assert.match(r.headers.get("cache-control"), /public/);
  const etag = r.headers.get("etag");
  const body = await r.json();
  assert.ok(body.catalog.products.length);
  assert.ok(!("savedBy" in body));
  assert.deepEqual(Object.keys(body.catalog.contact), ["email"]);
  assert.ok(Object.values(body.catalog.theme.tints).every((v) => v === ""));
  assert.equal((await editor.publicCatalog(new Request(`${ORIGIN}/api/catalog`, { headers: { "if-none-match": etag } }))).status, 304);
  const hidden = structuredClone(withPrivate);
  hidden.products[0].visible = false;
  const ck = await login();
  cookie = ck.headers.get("set-cookie").split(";")[0];
  await admin("PUT", "/api/admin/catalog", { body: hidden });
  const after = await (await editor.publicCatalog(new Request(`${ORIGIN}/api/catalog`))).json();
  assert.ok(!after.catalog.products.some((p) => p.slug === hidden.products[0].slug));
});

test("logout revokes the session; password change or removed user signs out", async () => {
  const c = cookie;
  assert.equal((await admin("POST", "/api/admin/logout")).status, 200);
  cookie = c;
  assert.equal((await admin("GET", "/api/admin/catalog")).status, 401);
  const ok = await login();
  cookie = ok.headers.get("set-cookie").split(";")[0];
  assert.equal((await admin("GET", "/api/admin/catalog")).status, 200);
  const prev = env;
  env = { ...env, VE_ADMIN_USERS: JSON.stringify({ alex: await hashPassword("brand new password") }) };
  assert.equal((await admin("GET", "/api/admin/catalog")).status, 401);
  env = { ...env, VE_ADMIN_USERS: JSON.stringify({ bob: users.bob }) };
  assert.equal((await admin("GET", "/api/admin/catalog")).status, 401);
  env = prev;
});

test("missing settings return a stable code and never a stack or secret", async () => {
  const saved = env;
  env = { VE_ADMIN_USERS: saved.VE_ADMIN_USERS, VE_SESSION_SECRET: "short" };
  let r = await admin("GET", "/api/admin/session");
  assert.equal(r.status, 500);
  assert.equal((await r.json()).code, "VE_HOSTED_NO_SESSION_SECRET");
  env = { VE_SESSION_SECRET: SECRET };
  r = await admin("GET", "/api/admin/session");
  assert.equal((await r.json()).code, "VE_HOSTED_NO_USERS");
  env = saved;
  assert.throws(() => createHostedEditor({ seed }), /VE_HOSTED_NO_STORAGE/);
  assert.throws(() => createHostedEditor({ storage }), /VE_HOSTED_NO_SEED/);
});

test("hashes: PBKDF2 format compatible with Hangr's (100000 iterations) verifies", async () => {
  const stored = await hashPassword("legacy password!", 100000);
  assert.match(stored, /^pbkdf2-sha256\$100000\$/);
  assert.equal(await verifyPassword("legacy password!", stored), true);
  assert.equal(await verifyPassword("legacy password?", stored), false);
  assert.equal(await verifyPassword("x", undefined), false);
  assert.equal(await verifyPassword("x", "pbkdf2-sha256$9$AA$AA"), false);
});

test("UI files are served with paths rewritten for a mount point and API base", () => {
  for (const name of UI_FILES) assert.ok(uiFile(name));
  const html = uiFile("index.html", { base: "/admin", apiBase: "/api/admin" }).body;
  assert.match(html, /href="\/admin\/ve\/styles\.css"/);
  assert.match(html, /<meta name="ve-api-base" content="\/api\/admin">/);
  assert.match(uiFile("editor/app.js", { base: "/admin" }).body, /from "\/admin\/ve\/core\.js"/);
  assert.equal(uiFile("../package.json"), null);
});

test("hosted-user CLI prints hashes, never the password, and edits the env value", () => {
  const cli = new URL("../bin/ve-backend.mjs", import.meta.url).pathname;
  const run = (args, input, extra = {}) => execFileSync(process.execPath, [cli, ...args], { input, env: { ...process.env, ...extra }, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
  const out = run(["hosted-user", "add", "Casey"], "a very secret password\n", { VE_ADMIN_USERS: "" });
  assert.ok(!out.includes("a very secret password"));
  const value = JSON.parse(out.match(/^VE_ADMIN_USERS=(.*)$/m)[1]);
  assert.match(value.casey, /^pbkdf2-sha256\$/);
  const added = run(["hosted-user", "add", "dana"], "another secret pass\n", { VE_ADMIN_USERS: JSON.stringify(value) });
  const two = JSON.parse(added.match(/^VE_ADMIN_USERS=(.*)$/m)[1]);
  assert.deepEqual(Object.keys(two).sort(), ["casey", "dana"]);
  assert.match(run(["hosted-user", "list"], "", { VE_ADMIN_USERS: JSON.stringify(two) }), /casey\n\s+dana/);
  assert.deepEqual(Object.keys(JSON.parse(run(["hosted-user", "remove", "casey"], "", { VE_ADMIN_USERS: JSON.stringify(two) }).match(/^VE_ADMIN_USERS=(.*)$/m)[1])), ["dana"]);
  assert.throws(() => run(["hosted-user", "add", "eve"], "short\n", { VE_ADMIN_USERS: "" }), /VE_ADMIN_WEAK_PASSWORD/);
});

test("live overlay helpers: fetch, content fallback, product merge", async () => {
  const doc = { catalog: { products: [{ slug: "a", price: 9 }, { slug: "new", price: 1 }], content: [{ id: "hero", fields: [{ id: "title", type: "text", value: "Live title" }] }] } };
  const fetchImpl = async () => new Response(JSON.stringify(doc), { headers: { "content-type": "application/json" } });
  const live = await fetchLiveCatalog("/api/catalog", { fetchImpl });
  assert.equal(liveContent(live, "hero", { title: "Build title", subtitle: "Sub" }).title, "Live title");
  assert.equal(liveContent(live, "hero", { subtitle: "Sub" }).subtitle, "Sub");
  assert.equal(liveContent(null, "hero", { title: "Build title" }).title, "Build title");
  const { products, added } = mergeLiveProducts([{ slug: "a", price: 5, extra: 1 }, { slug: "b", price: 2 }], live);
  assert.equal(products[0].price, 9);
  assert.equal(products[0].extra, 1);
  assert.equal(products[1].price, 2);
  assert.deepEqual(added.map((p) => p.slug), ["new"]);
  assert.equal(await fetchLiveCatalog("/x", { fetchImpl: async () => new Response("nope", { status: 500 }) }), null);
  assert.equal(await fetchLiveCatalog("/x", { fetchImpl: async () => { throw new Error("offline"); } }), null);
  assert.equal(await fetchLiveCatalog("/x", { fetchImpl: async () => new Response("{}", { headers: { "content-type": "application/json" } }) }), null);
  assert.equal(getContent(live, "hero").title, "Live title");
});
