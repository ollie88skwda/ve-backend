// The editor UI files, rewritten so they work when mounted under a path (e.g. /admin/) and talk to a hosted API.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LIB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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
  const b = base.replace(/\/$/, "");
  let body = fs.readFileSync(path.join(LIB, entry[0]), "utf8");
  if (name === "index.html") {
    body = body.replace('<meta name="robots"', `<meta name="ve-api-base" content="${apiBase}">\n<meta name="robots"`);
  }
  body = body.replace(/(["'])\/(ve|editor)\//g, `$1${b}/$2/`);
  return { body, type: entry[1] };
}
