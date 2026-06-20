import "server-only";

import { type PrismaClient } from "../../../../generated/prisma";
import { writeAuditLog } from "~/server/audit";
import { renderPdfToBuffer } from "~/server/pdf/render";
import { storage } from "~/server/storage";

import { getLeaseStatement } from "../queries.service";
import { buildStatementPdfData } from "./build-pdf-data";
import { StatementPdf } from "./statement-pdf";

function safeName(s: string): string {
  return s.replace(/[^\p{L}\p{N}._-]+/gu, "_").slice(0, 80);
}

/**
 * 4.4 Erzeugt das Betriebskostenabrechnungs-PDF eines Mieters, legt es über den
 * Storage-Port ab und verknüpft es als `Document` (Typ ABRECHNUNG) mit dem
 * Mietverhältnis. Download dann über `/api/files/[id]` (mandantengeprüft).
 */
export async function generateStatementPdf(
  db: PrismaClient,
  organizationId: string,
  statementId: string,
  leaseId: string,
  meta: { userId: string },
): Promise<{ documentId: string; fileName: string }> {
  const detail = await getLeaseStatement(db, organizationId, statementId, leaseId);
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { name: true },
  });

  const data = buildStatementPdfData(
    { statement: detail.statement, result: detail.result },
    org?.name ?? "Vermieter",
  );
  const buffer = await renderPdfToBuffer(<StatementPdf data={data} />);

  const fileKey = `${organizationId}/statements/${statementId}/${leaseId}.pdf`;
  await storage.put(fileKey, buffer, "application/pdf");

  const fileName = `${safeName(`Betriebskostenabrechnung_${detail.statement.periodYear}_${detail.result.unitLabel}`)}.pdf`;

  // Vorhandenes PDF dieses Mieters für diese Abrechnung ersetzen (idempotent).
  await db.document.deleteMany({
    where: { organizationId, leaseId, type: "ABRECHNUNG", fileKey },
  });
  const doc = await db.document.create({
    data: {
      organizationId,
      type: "ABRECHNUNG",
      fileName,
      fileKey,
      mimeType: "application/pdf",
      sizeBytes: buffer.length,
      leaseId,
      propertyId: detail.statement.property.id,
    },
    select: { id: true },
  });

  await writeAuditLog(db, {
    organizationId,
    userId: meta.userId,
    action: "statement.pdf",
    entityType: "OperatingCostStatement",
    entityId: statementId,
    metadata: { leaseId, documentId: doc.id },
  });

  return { documentId: doc.id, fileName };
}
