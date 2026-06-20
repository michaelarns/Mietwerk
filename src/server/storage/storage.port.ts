import "server-only";

/**
 * Storage port: the single abstraction every slice uses to persist binary files
 * (documents, photos). Concrete adapters (local filesystem, S3-compatible) live
 * beside this file and are selected by `STORAGE_DRIVER` in the factory
 * (`./index.ts`). No slice talks to a storage backend directly.
 */

export interface StoredObject {
  body: Buffer;
  contentType?: string;
}

export interface StoragePort {
  /** Store an object under `key` (overwrites if it exists). */
  put(key: string, body: Buffer, contentType?: string): Promise<void>;
  /** Read an object. Throws if the key does not exist. */
  get(key: string): Promise<StoredObject>;
  /** Delete an object. No-op if it does not exist. */
  delete(key: string): Promise<void>;
  /**
   * Produce a time-limited URL for direct download. May be unsupported by some
   * adapters (e.g. the local-FS adapter), in which case downloads are served
   * through the application's authenticated file route instead.
   */
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>;
}

/** Thrown by adapters that cannot mint presigned URLs (e.g. local FS). */
export class SignedUrlNotSupportedError extends Error {
  constructor() {
    super("Signed URLs are not supported by this storage adapter.");
    this.name = "SignedUrlNotSupportedError";
  }
}
