# CLAUDE.md — Slice `documents`

## Zweck

Dokumente und Fotos an Entitäten anhängen (Phase 1: Property & Unit). Die Binär-
daten liegen hinter dem Storage-Port (ADR 0005); dieser Slice verwaltet nur die
`Document`-Metadaten.

## Dateien

- `document.service.ts` — org-gescopte Metadaten (list/create/getForDownload/
  softDelete) + Ownership-Checks für Parent (Property/Unit).
- `document.router.ts` — `listForProperty/listForUnit` (read), `softDelete` (write).
- `ui/documents-card.tsx` — Upload/Liste/Download/Löschen (client).
- `ui/unit-documents-button.tsx` — Dialog mit DocumentsCard für eine Unit.

## Upload/Download (außerhalb tRPC)

- Upload: `POST /api/files/upload` (multipart). Auth + Mandant über
  `requireOrgFromRequest` (write), spiegelt den `orgProcedure`-Chokepoint.
  Prüft Parent-Ownership, legt Objekt über den Storage-Port ab, erzeugt `Document`.
- Download: `GET /api/files/[id]`. Prüft Mandant über die `Document`-Zeile;
  S3 → Redirect auf presigned URL, FS → Stream.

## Lokale Konventionen

- Kein direkter Browser→S3-Upload (Phase 1). Storage-Key ist mandantenpräfixiert.
- Soft-Delete der `Document`-Zeile (Blob bleibt; spätere Bereinigung möglich).
  Sensible Löschung → `AuditLog`.
- Max. 15 MB pro Datei (Route).
