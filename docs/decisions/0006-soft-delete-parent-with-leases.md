# ADR 0006 — Soft-Delete von Property/Unit mit bestehenden Mietverhältnissen

- **Status:** akzeptiert
- **Datum:** 2026-06 (Phase 1)

## Kontext

Properties und Units werden per Soft-Delete (`deletedAt`) entfernt. Ein
unkoordiniertes Löschen darf bestehende Mietverhältnisse (`Lease`) nicht
stillschweigend verwaisen lassen — sonst gäbe es Leases, deren Einheit/Objekt
„weg“ ist, was Abrechnung und Auswertung verfälscht.

## Entscheidung

Soft-Delete einer **Property** oder **Unit** wird **blockiert**, solange ein
**aktives oder zukünftiges** Mietverhältnis daran hängt (Fehler `CONFLICT` mit
klarer Meldung). „Aktiv oder zukünftig“ = `Lease` mit `deletedAt = null` und
(`endDate = null` **oder** `endDate >= heute`). **Beendete** Leases (endDate in
der Vergangenheit) blockieren nicht.

Analog gilt: ein **Tenant** kann nicht soft-deleted werden, wenn er **alleiniger**
Mieter eines aktiven/zukünftigen Lease ist.

Das Prädikat lebt framework-frei in `tenants-leases/lease-rules.ts`
(`leaseBlocksParentDeletion`) und ist unit-getestet; die Services
(`property.service.ts`, `tenants-leases.service.ts`) setzen es per DB-Query um
(gleiche Semantik) und sind durch den Cross-Tenant-Integrationstest gedeckt.

## Alternativen

- **Kaskadierendes Soft-Delete** (Objekt löschen ⇒ Leases mitlöschen):
  abgelehnt — zu fehleranfällig, verschleiert laufende Verträge.
- **Hard-Delete mit DB-Constraint:** widerspricht der DSGVO-/Soft-Delete-Linie.
- **Stilles Verwaisen zulassen:** abgelehnt — verfälscht spätere Abrechnung.

## Konsequenzen

- Nutzer müssen ein aktives/zukünftiges Mietverhältnis erst beenden (Enddatum
  setzen) oder löschen, bevor sie Einheit/Objekt entfernen können.
- Beendete Verträge bleiben als Historie erhalten und blockieren nicht.
- Soft-Delete schreibt einen `AuditLog`-Eintrag.
