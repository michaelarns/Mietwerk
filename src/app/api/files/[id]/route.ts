import { NextResponse } from "next/server";

import { getDocumentForDownload } from "~/features/documents/document.service";
import { db } from "~/server/db";
import { OrgAccessError, requireOrgFromRequest } from "~/server/auth/request-org";
import { SignedUrlNotSupportedError, storage } from "~/server/storage";

/**
 * Authenticated download. Always verifies the document belongs to the caller's
 * active organization before serving. With S3 it redirects to a presigned URL;
 * with the local-FS adapter it streams the bytes.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireOrgFromRequest(req);
    const { id } = await params;
    const doc = await getDocumentForDownload(db, ctx.organizationId, id);

    try {
      const url = await storage.getSignedUrl(doc.fileKey);
      return NextResponse.redirect(url);
    } catch (e) {
      if (!(e instanceof SignedUrlNotSupportedError)) throw e;
      // Local-FS: stream the file through the app.
      const { body, contentType } = await storage.get(doc.fileKey);
      return new NextResponse(new Uint8Array(body), {
        headers: {
          "Content-Type": contentType ?? doc.mimeType ?? "application/octet-stream",
          "Content-Disposition": `inline; filename="${encodeURIComponent(doc.fileName)}"`,
        },
      });
    }
  } catch (err) {
    if (err instanceof OrgAccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });
  }
}
