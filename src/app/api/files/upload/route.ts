import { NextResponse } from "next/server";

import { DocumentType } from "../../../../../generated/prisma";
import {
  assertPropertyOwned,
  assertUnitOwned,
  createDocument,
} from "~/features/documents/document.service";
import { db } from "~/server/db";
import { OrgAccessError, requireOrgFromRequest } from "~/server/auth/request-org";
import { buildStorageKey, storage } from "~/server/storage";

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB

function inferType(mime: string): DocumentType {
  if (mime.startsWith("image/")) return DocumentType.FOTO;
  if (mime === "application/pdf") return DocumentType.BELEG;
  return DocumentType.SONSTIGES;
}

/** Upload a document/photo and attach it to a Property or Unit. */
export async function POST(req: Request) {
  try {
    const ctx = await requireOrgFromRequest(req, { write: true });

    const form = await req.formData();
    const file = form.get("file");
    const propertyId = form.get("propertyId");
    const unitId = form.get("unitId");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Keine Datei." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Datei zu groß (max 15 MB)." }, {
        status: 413,
      });
    }
    if (typeof propertyId !== "string" && typeof unitId !== "string") {
      return NextResponse.json(
        { error: "propertyId oder unitId erforderlich." },
        { status: 400 },
      );
    }

    // Verify parent ownership within the active organization.
    if (typeof propertyId === "string") {
      await assertPropertyOwned(db, ctx.organizationId, propertyId);
    }
    if (typeof unitId === "string") {
      await assertUnitOwned(db, ctx.organizationId, unitId);
    }

    const mime = file.type || "application/octet-stream";
    const key = buildStorageKey(ctx.organizationId, file.name);
    const buffer = Buffer.from(await file.arrayBuffer());
    await storage.put(key, buffer, mime);

    const doc = await createDocument(db, ctx.organizationId, {
      type: inferType(mime),
      fileName: file.name,
      fileKey: key,
      mimeType: mime,
      sizeBytes: file.size,
      propertyId: typeof propertyId === "string" ? propertyId : undefined,
      unitId: typeof unitId === "string" ? unitId : undefined,
    });

    return NextResponse.json({ id: doc.id }, { status: 201 });
  } catch (err) {
    if (err instanceof OrgAccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload fehlgeschlagen." },
      { status: 400 },
    );
  }
}
