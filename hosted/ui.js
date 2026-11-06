// The editor UI files, rewritten so they work when mounted under a path (e.g. /admin/) and talk to a hosted API.
// node:fs is loaded lazily (and failure tolerated) so importing ve-backend/hosted works on runtimes without Node built-ins
// (e.g. Cloudflare Workers without nodejs_compat). Only uiFile() needs the file system, and it throws a clear error there.
const [fs, path, url] = await Promise.all([import("node:fs"), import("node:path"), import("node:url")]).then((m) => m.map((x) => x.default || x), () => [null, null, null]);
const LIB = path ? path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..") : "";
const SOURCES = {
  "index.html": ["editor/public/index.html", "text/html; charset=utf-8"],
  "editor/app.js": ["editor/public/app.js", "text/javascript; charset=utf-8"],
  "editor/app.css": ["editor/public/app.css", "text/css; charset=utf-8"],
  "ve/core.js": ["src/core.js", "text/javascript; charset=utf-8"],
  "ve/render.js": ["src/render.js", "text/javascript; charset=utf-8"],
  "ve/styles.css": ["src/styles.css", "text/css; charset=utf-8"],
};
export const UI_FILES = Object.keys(SOURCES);

/**
 * Read one UI file. base = where the UI is mounted ("/admin"), apiBase = where the editor API lives ("/api/admin").
 * Returns { body: string, type } or null for an unknown name.
 */
export function uiFile(name, { base = "/admin", apiBase = "/api/admin" } = {}) {
  const entry = SOURCES[name];
  if (!entry) return null;
  if (!fs) throw Object.assign(new Error("VE_HOSTED_NO_FS: uiFile() reads the editor files from disk; run it in a build step on Node, not on an edge runtime."), { code: "VE_HOSTED_NO_FS" });
  const b = base.replace(/\/$/, "");
  let body = fs.readFileSync(path.join(LIB, entry[0]), "utf8");
  if (name === "index.html") {
    body = body.replace('<meta name="robots"', `<meta name="ve-api-base" content="${apiBase}">\n<meta name="robots"`);
  }
  body = body.replace(/(["'])\/(ve|editor)\//g, `$1${b}/$2/`);
  return { body, type: entry[1] };
}
