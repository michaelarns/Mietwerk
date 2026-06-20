# CLAUDE.md — Slice `properties`

## Zweck

Liegenschaften (`Property`) und ihre Einheiten (`Unit`) verwalten: Stammdaten,
AfA-relevante Felder (ohne Berechnung), Dokumente/Fotos.

## Hauptentitäten (Prisma)

- `Property` — Liegenschaft (Adresse, Typ, Baujahr, Kauf-/AfA-Felder).
- `Unit` — Einheit unter einer Property (Fläche, Zimmer, Kaltmiete, NK-Voraus.).

## Dateien

- `property.schema.ts` — Zod (Geld als Integer-Cent, Adresse, AfA-Felder).
- `property.service.ts` — Data Access; org-gescoped; Soft-Delete-Regel.
- `property.router.ts` — `list/byId/create/update/softDelete` + Unit-Pendants.
- `labels.ts` — deutsche Enum-Labels (PropertyType).
- `ui/` — Form-Dialoge (Property/Unit), Delete-Buttons.

## Lokale Konventionen

- Reads über `orgProcedure`, Mutationen über `orgWriteProcedure`.
- Service-Funktionen erhalten `organizationId` explizit; alle Queries
  `where: { organizationId }`. Existenzprüfung vor Update/Delete (NOT_FOUND).
- **Soft-Delete-Regel (ADR 0006):** Property/Unit mit **aktivem oder
  zukünftigem** Lease kann nicht gelöscht werden (CONFLICT). Prädikat in
  `tenants-leases/lease-rules.ts`, DB-Query in `property.service.ts` spiegelt es.
- Soft-Delete schreibt `AuditLog` (`property.softDelete` / `unit.softDelete`).
- Geld nur über `~/lib/money` (Euro-Eingabe ↔ Cent). Datum UTC, Render via `~/lib/date`.

## Fachlich kritische Logik (Testpflicht)

- Soft-Delete-Blockade bei aktivem/zukünftigem Lease (Prädikat + Service).

## Offene Punkte

- Dokument-Upload nutzt den Storage-Port (siehe Block E / ADR 0005).
