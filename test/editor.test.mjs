// Sales editor server: passcode gate, validation, save history and undo.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, mkdir, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createEditorServer, readPasscode } from "../editor/server.mjs";

let root, editor, base, cookie = "";
const call = (method, url, body, headers = {}) =>
  fetch(base + url, { method, headers: { cookie, "X-Requested-With": "ve-editor", ...(body ? { "Content-Type": "application/json" } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });

before(async () => {
  root = await mkdtemp(path.join(tmpdir(), "ve-editor-"));
  await mkdir(path.join(root, "src/data"), { recursive: true });
  await mkdir(path.join(root, "public"), { recursive: true });
  await writeFile(path.join(root, "src/data/ve.catalog.json"), await readFile(new URL("../templates/ve.catalog.json", import.meta.url)));
  await writeFile(path.join(root, ".env.ve-backend.local"), "VE_EDITOR_PASSCODE='open sesame'\n");
  editor = createEditorServer({ root, passcode: readPasscode(root, {}) });
  const addr = await editor.listen(0);
  base = `http://127.0.0.1:${addr.port}`;
});
after(() => editor.close());

test("reads the passcode from .env.ve-backend.local (quotes stripped)", () => {
  assert.equal(readPasscode(root, {}), "open sesame");
  assert.equal(readPasscode(root, { VE_EDITOR_PASSCODE: "env wins" }), "env wins");
});

test("refuses to start without a passcode", () => {
  assert.throws(() => createEditorServer({ root, passcode: "" }), /VE_EDITOR_NO_PASSCODE/);
});

test("API is locked until sign-in; wrong passcode is rejected", async () => {
  assert.equal((await call("GET", "/api/catalog")).status, 401);
  assert.equal((await call("POST", "/api/login", { passcode: "nope" })).status, 401);
  const ok = await call("POST", "/api/login", { passcode: "open sesame" });
  assert.equal(ok.status, 200);
  cookie = ok.headers.get("set-cookie").split(";")[0];
  assert.match(cookie, /^ve_editor=/);
  assert.equal((await call("GET", "/api/catalog")).status, 200);
});

test("writes need the X-Requested-With header", async () => {
  const r = await fetch(base + "/api/undo", { method: "POST", headers: { cookie } });
  assert.equal(r.status, 403);
});

test("invalid saves return field errors and leave the file alone", async () => {
  const { catalog } = await (await call("GET", "/api/catalog")).json();
  catalog.products[0].price = "abc";
  const r = await call("PUT", "/api/catalog", catalog);
  assert.equal(r.status, 422);
  assert.ok((await r.json()).errors["products.0.price"]);
});

test("save writes the catalog and keeps history; undo restores it", async () => {
  const { catalog } = await (await call("GET", "/api/catalog")).json();
  catalog.products[0].price = 31.5;
  const saved = await (await call("PUT", "/api/catalog", catalog)).json();
  assert.equal(saved.undoCount, 1);
  const onDisk = JSON.parse(await readFile(path.join(root, "src/data/ve.catalog.json"), "utf8"));
  assert.equal(onDisk.products[0].price, 31.5);
  assert.equal((await readdir(path.join(root, ".ve-backend/history"))).length, 1);
  const undone = await (await call("POST", "/api/undo")).json();
  assert.equal(undone.catalog.products[0].price, 24.99);
  assert.equal(undone.undoCount, 0);
});

test("uploads accept real images only and land in public/uploads", async () => {
  const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201a5ee8b0b0000000049454e44ae426082", "hex");
  const r = await fetch(base + "/api/upload?slug=rose", { method: "POST", headers: { cookie, "X-Requested-With": "ve-editor" }, body: png });
  const { path: p } = await r.json();
  assert.match(p, /^\/uploads\/rose-[0-9a-f]{8}\.png$/);
  const bad = await fetch(base + "/api/upload", { method: "POST", headers: { cookie, "X-Requested-With": "ve-editor" }, body: "<svg onload=alert(1)>" });
  assert.equal(bad.status, 415);
});

test("serves the editor UI, library modules and the site's public files, but not outside it", async () => {
  assert.match(await (await fetch(base + "/")).text(), /Sales editor/);
  assert.equal((await fetch(base + "/ve/render.js")).status, 200);
  assert.equal((await fetch(base + "/..%2f.env.ve-backend.local")).status, 404);
  assert.equal((await fetch(base + "/../src/data/ve.catalog.json")).status, 404);
});
