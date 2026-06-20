# CLAUDE.md — Slice `tenants-leases`

## Zweck

Mieter (`Tenant`) und Mietverhältnisse (`Lease`) verwalten, inkl. Verknüpfung
einer Einheit mit einem oder mehreren Mietern (`LeaseTenant`).

## Hauptentitäten (Prisma)

- `Tenant` — Mieter (personenbezogen → Soft-Delete).
- `Lease` — Mietverhältnis (Unit + Konditionen + Zeitraum + Kaution).
- `LeaseTenant` — m:n zwischen Lease und Tenant.

## Dateien

- `lease-rules.ts` — **reine** fachliche Regeln (Status, Überschneidung,
  Zeitraum-Validierung). Frei von Prisma/IO → direkt unit-testbar.
- `tenants-leases.schema.ts` — Zod-Schemas (Geld als Cent, Zeitraum-Refinement).
- `tenants-leases.service.ts` — Data Access; org-gescoped; setzt die Regeln durch.
- `tenants-leases.router.ts` — `tenantRouter` + `leaseRouter`.
- `labels.ts` — deutsche Enum-/Status-Labels.
- `ui/` — Form-Dialoge (Tenant/Lease), Delete-Buttons.

## Lokale Konventionen & Regeln

- Reads über `orgProcedure`, Mutationen über `orgWriteProcedure`.
- **Status wird abgeleitet** (`leaseStatus`), nie als Feld gespeichert.
- **Keine Überschneidung:** eine Unit darf nie zwei sich überschneidende
  Leases haben — serverseitig in `assertNoOverlap` (nutzt `leasePeriodsOverlap`).
- **Beginn ≤ Ende** (falls Ende gesetzt) — Zod-Refinement + Service-Guard.
- Tenant-Soft-Delete blockiert, wenn er alleiniger Mieter eines aktiven/
  zukünftigen Lease ist (kein Verwaisen). Sensible Löschungen → `AuditLog`.
- Geld nur über `~/lib/money`; Datum UTC, Render via `~/lib/date`.

## Fachlich kritische Logik (Testpflicht)

- `lease-rules.ts`: `leaseStatus`, `leasePeriodsOverlap`, `isValidLeasePeriod`,
  `leaseBlocksParentDeletion`.
