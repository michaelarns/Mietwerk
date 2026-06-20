import "server-only";

import { env } from "~/env";
import { FsStorageAdapter } from "./fs.adapter";
import { S3StorageAdapter } from "./s3.adapter";
import { type StoragePort } from "./storage.port";

const createStorage = (): StoragePort => {
  if (env.STORAGE_DRIVER === "s3") {
    return new S3StorageAdapter({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      bucket: env.S3_BUCKET,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
    });
  }
  return new FsStorageAdapter(env.STORAGE_FS_DIR);
};

// Singleton across hot reloads in development.
const globalForStorage = globalThis as unknown as {
  storage: StoragePort | undefined;
};

export const storage: StoragePort = globalForStorage.storage ?? createStorage();

if (env.NODE_ENV !== "production") globalForStorage.storage = storage;

export { buildStorageKey } from "./fs.adapter";
export {
  SignedUrlNotSupportedError,
  type StoragePort,
  type StoredObject,
} from "./storage.port";
