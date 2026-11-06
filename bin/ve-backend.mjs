#!/usr/bin/env node
// ve-backend CLI: `ve-backend editor`, `ve-backend init`, `ve-backend validate`.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateCatalog } from "../src/core.js";
import { createEditorServer, readPasscode, PASSCODE_ENV, PASSCODE_FILE } from "../editor/server.mjs";

const LIB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HELP = `ve-backend: storefront + sales editor for Virtual Enterprise companies

Usage:
  ve-backend init [--astro|--html] [--force]   Add a catalog, passcode file and shop pages to this site
  ve-backend editor [--port 4410] [--host 127.0.0.1] [--catalog <file>] [--public <dir>] [--site-url <url>]
                                               Start the passcode-protected sales editor
  ve-backend validate [--catalog <file>]       Check the catalog and list problems

Settings can also live in package.json under "ve-backend": { "catalog", "publicDir", "siteUrl", "port" }.
Passcode: ${PASSCODE_ENV} in the environment or in ${PASSCODE_FILE} (gitignored, never printed).`;

function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=");
      if (v !== undefined) out[k] = v;
      else if (argv[i + 1] && !argv[i + 1].startsWith("--")) out[k] = argv[++i];
      else out[k] = true;
    } else out._.push(a);
  }
  return out;
}
function siteSettings(root) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    return { pkg, settings: pkg["ve-backend"] || {} };
  } catch {
    return { pkg: null, settings: {} };
  }
}
function findCatalog(root, explicit, settings) {
  if (explicit) return path.resolve(root, explicit);
  if (settings.catalog) return path.resolve(root, settings.catalog);
  for (const c of ["src/data/ve.catalog.json", "ve.catalog.json", "src/content/ve.catalog.json"]) if (fs.existsSync(path.join(root, c))) return path.join(root, c);
  return path.join(root, "src/data/ve.catalog.json");
}
const fail = (code, message, next) => {
  console.error(`[ve-backend] ${code}: ${message}${next ? `\n  Next step: ${next}` : ""}`);
  process.exit(1);
};

const opts = args(process.argv.slice(2));
const cmd = opts._[0];
const root = path.resolve(opts.root || process.cwd());
const { pkg, settings } = siteSettings(root);

if (!cmd || cmd === "help" || opts.help) {
  console.log(HELP);
  process.exit(0);
}

if (cmd === "validate") {
  const file = findCatalog(root, opts.catalog, settings);
  if (!fs.existsSync(file)) fail("VE_CATALOG_FILE_MISSING", `${file} not found.`, "run `npx ve-backend init`.");
  const result = validateCatalog(JSON.parse(fs.readFileSync(file, "utf8")));
  if (result.errors) {
    console.error(`${path.relative(root, file)} has ${Object.keys(result.errors).length} problem(s):`);
    for (const [k, v] of Object.entries(result.errors)) console.error(`  ${k}: ${v}`);
    process.exit(1);
  }
  const placeholders = result.value.products.filter((p) => p.placeholder);
  console.log(`${path.relative(root, file)} is valid: ${result.value.products.length} products, ${result.value.categories.length} categories, checkout "${result.value.checkout.mode}".`);
  if (placeholders.length) console.log(`Placeholder prices to confirm: ${placeholders.map((p) => p.name).join(", ")}`);
  process.exit(0);
}

if (cmd === "editor") {
  const passcode = readPasscode(root);
  if (!passcode) fail("VE_EDITOR_NO_PASSCODE", `no passcode found.`, `add ${PASSCODE_ENV}=<passcode> to ${path.join(root, PASSCODE_FILE)} (or run \`npx ve-backend init\`, which creates one).`);
  let editor;
  try {
    editor = createEditorServer({
      root,
      catalog: findCatalog(root, opts.catalog, settings),
      publicDir: opts.public || settings.publicDir || "public",
      uploadsDir: opts.uploads || settings.uploadsDir,
      siteUrl: opts["site-url"] || process.env.VE_SITE_URL || settings.siteUrl || "",
      passcode,
    });
  } catch (e) {
    fail(e.code || "VE_EDITOR_START_FAILED", e.message);
  }
  const port = Number(opts.port || process.env.PORT || settings.port || 4410);
  const host = opts.host || "127.0.0.1";
  try {
    await editor.listen(port, host);
  } catch (e) {
    fail("VE_EDITOR_LISTEN_FAILED", `could not listen on ${host}:${port} (${e.code || e.message}).`, e.code === "EADDRINUSE" ? `pick another port with --port, or stop the process using ${port}.` : "");
  }
  console.log(`[ve-editor] Sales editor for ${path.relative(root, editor.catalogPath)} at http://${host}:${port}/ (passcode from ${process.env[PASSCODE_ENV] ? PASSCODE_ENV : PASSCODE_FILE})`);
  const stop = () => editor.close().then(() => process.exit(0));
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
} else if (cmd === "init") {
  const astro = opts.html ? false : opts.astro || Boolean(pkg?.dependencies?.astro || pkg?.devDependencies?.astro);
  const created = [];
  const skipped = [];
  const write = (rel, content, mode) => {
    const file = path.join(root, rel);
    if (fs.existsSync(file) && !opts.force) return skipped.push(rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, mode ? { mode } : undefined);
    created.push(rel);
  };
  const catalogRel = settings.catalog || "src/data/ve.catalog.json";
  write(catalogRel, fs.readFileSync(path.join(LIB, "templates", "ve.catalog.json"), "utf8"));
  if (!readPasscode(root, {})) {
    const pass = crypto.randomBytes(9).toString("base64url");
    write(PASSCODE_FILE, `# ve-backend sales editor passcode. Keep this file out of git.\n${PASSCODE_ENV}=${pass}\n`, 0o600);
  }
  const gi = path.join(root, ".gitignore");
  const giText = fs.existsSync(gi) ? fs.readFileSync(gi, "utf8") : "";
  const want = [PASSCODE_FILE, ".ve-backend/"].filter((l) => !giText.split(/\r?\n/).includes(l));
  if (want.length) {
    fs.writeFileSync(gi, `${giText}${giText && !giText.endsWith("\n") ? "\n" : ""}\n# ve-backend (editor passcode and save history)\n${want.join("\n")}\n`);
    created.push(".gitignore (updated)");
  }
  if (astro) {
    const dir = path.join(LIB, "templates", "astro");
    for (const f of fs.readdirSync(dir, { recursive: true })) {
      const src = path.join(dir, f);
      if (fs.statSync(src).isDirectory()) continue;
      write(path.join("src", "pages", f), fs.readFileSync(src, "utf8").replaceAll("__CATALOG__", path.relative(path.join(root, "src/pages", path.dirname(f)), path.join(root, catalogRel)).split(path.sep).join("/")));
    }
  } else {
    write("shop.html", fs.readFileSync(path.join(LIB, "examples", "plain-html", "index.html"), "utf8"));
  }
  if (pkg && !pkg.scripts?.editor) {
    pkg.scripts = { ...(pkg.scripts || {}), editor: "ve-backend editor" };
    fs.writeFileSync(path.join(root, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
    created.push('package.json (added "editor" script)');
  }
  console.log(`ve-backend init (${astro ? "Astro" : "plain HTML"})`);
  for (const c of created) console.log(`  created ${c}`);
  for (const s of skipped) console.log(`  kept existing ${s} (use --force to overwrite)`);
  console.log(`\nNext: edit ${catalogRel}, then run \`npm run editor\`. The editor passcode is in ${PASSCODE_FILE}.`);
} else {
  console.error(HELP);
  process.exit(1);
}
