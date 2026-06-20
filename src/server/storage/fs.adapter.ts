import "server-only";

import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  SignedUrlNotSupportedError,
  type StoragePort,
  type StoredObject,
} from "./storage.port";

/**
 * Local filesystem storage adapter. Used in CI and locked-down environments
 * where no S3 service is reachable. Files are written under `baseDir`; the
 * content type is persisted in a sidecar `.meta` file. Downloads are served via
 * the authenticated file route (this adapter does not mint signed URLs).
 */
export class FsStorageAdapter implements StoragePort {
  constructor(private readonly baseDir: string) {}

  /** Resolve a storage key to an absolute path, guarding against traversal. */
  private resolve(key: string): string {
    const base = path.resolve(this.baseDir);
    // Hash any path-ish key segment is overkill; instead normalize and verify
    // the result stays within baseDir.
    const target = path.resolve(base, key);
    if (target !== base && !target.startsWith(base + path.sep)) {
      throw new Error(`Invalid storage key: ${key}`);
    }
    return target;
  }

  async put(key: string, body: Buffer, contentType?: string): Promise<void> {
    const target = this.resolve(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, body);
    await writeFile(
      `${target}.meta`,
      JSON.stringify({ contentType: contentType ?? null }),
      "utf8",
    );
  }

  async get(key: string): Promise<StoredObject> {
    const target = this.resolve(key);
    const body = await readFile(target);
    let contentType: string | undefined;
    try {
      const meta = JSON.parse(await readFile(`${target}.meta`, "utf8")) as {
        contentType: string | null;
      };
      contentType = meta.contentType ?? undefined;
    } catch {
      contentType = undefined;
    }
    return { body, contentType };
  }

  async delete(key: string): Promise<void> {
    const target = this.resolve(key);
    await rm(target, { force: true });
    await rm(`${target}.meta`, { force: true });
  }

  getSignedUrl(): Promise<string> {
    return Promise.reject(new SignedUrlNotSupportedError());
  }
}

/** Stable, collision-resistant storage key for an uploaded file. */
export function buildStorageKey(
  organizationId: string,
  fileName: string,
): string {
  const random = createHash("sha256")
    .update(`${organizationId}:${fileName}:${Date.now()}:${Math.random()}`)
    .digest("hex")
    .slice(0, 16);
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${organizationId}/${random}-${safeName}`;
}
