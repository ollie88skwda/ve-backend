// Storage adapters for the hosted editor. An adapter is:
//   get(key)  -> parsed JSON | null           put(key, value)  -> void (overwrites)           del(key) -> void
//   putFile(name, bytes: Uint8Array, contentType) -> void        getFile(name) -> { body, contentType } | null
// Keys are short strings like "catalog-current". Writes are last-writer-wins; fine for a small sales team.

/** In-memory adapter (tests, local experiments). */
export function memoryStorage() {
  const json = new Map();
  const files = new Map();
  return {
    kind: "memory",
    json,
    files,
    async get(key) {
      return json.has(key) ? JSON.parse(json.get(key)) : null;
    },
    async put(key, value) {
      json.set(key, JSON.stringify(value));
    },
    async del(key) {
      json.delete(key);
    },
    async putFile(name, bytes, contentType) {
      files.set(name, { bytes: new Uint8Array(bytes), contentType });
    },
    async getFile(name) {
      const f = files.get(name);
      return f ? { body: f.bytes, contentType: f.contentType } : null;
    },
  };
}

/** Folder adapter (single-server hosting, tests). JSON in <dir>/<key>.json, photos in <dir>/media/. */
export function fileStorage(dir) {
  const safe = (s) => String(s).replace(/[^a-zA-Z0-9._-]/g, "_");
  const load = async () => ({ fs: await import("node:fs/promises"), path: await import("node:path") });
  return {
    kind: "file",
    async get(key) {
      const { fs, path } = await load();
      try {
        return JSON.parse(await fs.readFile(path.join(dir, `${safe(key)}.json`), "utf8"));
      } catch {
        return null;
      }
    },
    async put(key, value) {
      const { fs, path } = await load();
      await fs.mkdir(dir, { recursive: true });
      const file = path.join(dir, `${safe(key)}.json`);
      await fs.writeFile(`${file}.tmp`, JSON.stringify(value));
      await fs.rename(`${file}.tmp`, file);
    },
    async del(key) {
      const { fs, path } = await load();
      await fs.rm(path.join(dir, `${safe(key)}.json`), { force: true });
    },
    async putFile(name, bytes, contentType) {
      const { fs, path } = await load();
      await fs.mkdir(path.join(dir, "media"), { recursive: true });
      await fs.writeFile(path.join(dir, "media", safe(name)), bytes);
      await fs.writeFile(path.join(dir, "media", `${safe(name)}.type`), contentType);
    },
    async getFile(name) {
      const { fs, path } = await load();
      try {
        const body = new Uint8Array(await fs.readFile(path.join(dir, "media", safe(name))));
        const contentType = (await fs.readFile(path.join(dir, "media", `${safe(name)}.type`), "utf8")).trim();
        return { body, contentType };
      } catch {
        return null;
      }
    },
  };
}

/**
 * Vercel Blob adapter (private store). Needs `npm i @vercel/blob` and BLOB_READ_WRITE_TOKEN (set when the store is linked
 * to the project). `prefix` namespaces everything, e.g. "mysite/ve/"; the editor never touches other prefixes.
 */
export function vercelBlobStorage({ prefix = "ve/", token } = {}) {
  const pre = prefix.endsWith("/") ? prefix : `${prefix}/`;
  const clean = (s) => String(s).replace(/[^a-zA-Z0-9._/-]/g, "_");
  const opts = token ? { token } : {};
  let mod;
  const blob = async () => {
    try {
      return (mod ??= await import("@vercel/blob"));
    } catch (cause) {
      throw Object.assign(new Error("VE_HOSTED_NO_BLOB_PACKAGE: install @vercel/blob in the site (npm i @vercel/blob).", { cause }), { code: "VE_HOSTED_NO_BLOB_PACKAGE" });
    }
  };
  const read = async (path) => {
    const { get } = await blob();
    const res = await get(path, { access: "private", useCache: false, ...opts });
    return res && res.statusCode === 200 ? res : null;
  };
  return {
    kind: "vercel-blob",
    prefix: pre,
    async get(key) {
      const res = await read(`${pre}${clean(key)}.json`);
      if (!res) return null;
      try {
        return JSON.parse(await new Response(res.stream).text());
      } catch {
        return null;
      }
    },
    async put(key, value) {
      const { put } = await blob();
      await put(`${pre}${clean(key)}.json`, JSON.stringify(value), { access: "private", allowOverwrite: true, contentType: "application/json", cacheControlMaxAge: 60, ...opts });
    },
    async del(key) {
      const { del } = await blob();
      try {
        await del(`${pre}${clean(key)}.json`, opts);
      } catch {
        /* already gone */
      }
    },
    async putFile(name, bytes, contentType) {
      const { put } = await blob();
      await put(`${pre}media/${clean(name)}`, Buffer.from(bytes), { access: "private", contentType, addRandomSuffix: false, allowOverwrite: false, ...opts });
    },
    async getFile(name) {
      const res = await read(`${pre}media/${clean(name)}`);
      return res ? { body: res.stream, contentType: res.blob?.contentType || res.headers?.get?.("content-type") || "application/octet-stream" } : null;
    },
  };
}
