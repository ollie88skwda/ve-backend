import type { Catalog } from "./core";
export interface StorageAdapter {
  kind?: string;
  get(key: string): Promise<any | null>;
  put(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
  putFile(name: string, bytes: Uint8Array, contentType: string): Promise<void>;
  getFile(name: string): Promise<{ body: Uint8Array | ReadableStream; contentType: string } | null>;
}
export function memoryStorage(): StorageAdapter & { json: Map<string, string>; files: Map<string, unknown> };
export function fileStorage(dir: string): StorageAdapter;
export function vercelBlobStorage(options?: { prefix?: string; token?: string }): StorageAdapter;
export interface HostedEditorOptions {
  storage: StorageAdapter;
  seed: Catalog | Record<string, unknown>;
  apiBase?: string;
  mediaBase?: string;
  siteUrl?: string;
  env?: Record<string, string | undefined> | (() => Record<string, string | undefined>);
  usersEnv?: string;
  secretEnv?: string;
  cookie?: string;
  maxUpload?: number;
  publicCache?: string;
  cors?: string;
}
export type Handler = (request: Request) => Promise<Response>;
export function createHostedEditor(options: HostedEditorOptions): { admin: Handler; publicCatalog: Handler; media: Handler; storage: StorageAdapter };
export function hashPassword(password: string, iterations?: number): Promise<string>;
export function verifyPassword(password: string, stored: string | undefined): Promise<boolean>;
export function sniffImage(bytes: Uint8Array): "jpg" | "png" | "webp" | "avif" | null;
export function uiFile(name: string, options?: { base?: string; apiBase?: string }): { body: string; type: string } | null;
export const UI_FILES: string[];
export const SECURITY_HEADERS: Record<string, string>;
