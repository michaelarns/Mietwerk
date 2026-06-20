// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildStorageKey, FsStorageAdapter } from "./fs.adapter";
import { SignedUrlNotSupportedError } from "./storage.port";

let dir: string;
let storage: FsStorageAdapter;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "mietwerk-storage-"));
  storage = new FsStorageAdapter(dir);
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("FsStorageAdapter", () => {
  it("round-trips put → get with content type", async () => {
    const key = buildStorageKey("org_1", "beleg.pdf");
    await storage.put(key, Buffer.from("hello"), "application/pdf");
    const got = await storage.get(key);
    expect(got.body.toString()).toBe("hello");
    expect(got.contentType).toBe("application/pdf");
  });

  it("deletes objects", async () => {
    const key = buildStorageKey("org_1", "tmp.txt");
    await storage.put(key, Buffer.from("x"));
    await storage.delete(key);
    await expect(storage.get(key)).rejects.toThrow();
  });

  it("rejects path traversal keys", async () => {
    await expect(
      storage.put("../escape.txt", Buffer.from("x")),
    ).rejects.toThrow(/Invalid storage key/);
  });

  it("does not support signed URLs", async () => {
    await expect(storage.getSignedUrl()).rejects.toBeInstanceOf(
      SignedUrlNotSupportedError,
    );
  });

  it("builds mandant-prefixed, sanitized keys", () => {
    const key = buildStorageKey("org_42", "Mein Beleg #1.pdf");
    expect(key.startsWith("org_42/")).toBe(true);
    expect(key).toMatch(/^org_42\/[0-9a-f]{16}-Mein_Beleg__1\.pdf$/);
  });
});
