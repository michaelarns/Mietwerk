# CLAUDE.md — Slice `rent-payments`

## Zweck

Geldfluss: Sollstellung (monatliche Mietforderung), Zahlungserfassung &
-abgleich (inkl. CSV-Kontoumsatz-Import) und mehrstufiges, konfigurierbares
Mahnwesen. Automatisiert über pg-boss-Jobs (ADR 0007).

## Hauptentitäten (Prisma)

- `RentPayment` — Soll je Lease/Periode (`@@unique([leaseId, year, month])`).
- `Payment` + `PaymentAllocation` — Ist-Eingang und seine Zuordnung; nicht
  zugeordneter Rest = **Guthaben** (berechnet, nicht gespeichert).
- `BankImport` + `BankTransaction` — Staging des Kontoumsatz-Imports
  (`dedupeHash` macht den Import idempotent).
- `DunningPolicy` + `DunningPolicyLevel` — konfigurierbare Schwellen/Sätze.
- `Dunning` — erzeugtes Mahnschreiben (`@@unique([rentPaymentId, level])`).

## Dateien

- `charge-rules.ts` — **reine** Sollstellungs-Logik: tagesgenaue Proration,
  Fälligkeit (3. Werktag), Status-/Überfälligkeits-Ableitung. Direkt testbar.
- `allocation-rules.ts` — **reine** FIFO-Zuordnung (Teil-/Voll-/Überzahlung).
- `csv-parser.ts` / `matching.ts` — **reines** CSV-Parsing & Zuordnungsvorschlag.
- `dunning-rules.ts` — **reine** Mahn-Zustandsmaschine, Verzugszinsen, Schreiben.
- `*.service.ts` — Data Access, org-gescoped: `charge`, `payment`, `bank-import`,
  `dunning`, `queries`. Setzen die reinen Regeln durch.
- `jobs.ts` — pg-boss-Jobs (cross-org Loop über die org-gescopten Services).
- `rent-payments.router.ts` — ein Slice-Router (`rentPayment`).
- `labels.ts` — deutsche Labels + `displayStatus` (Überfällig abgeleitet).
- `ui/` — Dialoge/Buttons (Sollstellung, Zahlung, Mahnlauf, Import).

## Lokale Konventionen & Regeln

- Reads über `orgProcedure`, Mutationen über `orgWriteProcedure`.
- **Status wird abgeleitet:** `RentPayment.status` speichert nur den
  Zahlfortschritt (OPEN/PARTIAL/PAID/WAIVED). **Überfällig** ist zeitabhängig und
  wird berechnet (`isOverdue`, Toleranz aus der `DunningPolicy`), nie gespeichert.
- Geld in Cent; Proration mit einer Cent-Rundung. Datum UTC, Render via `~/lib/date`.
- **Idempotenz** überall: Sollstellung (unique + skipDuplicates), Import
  (dedupeHash), Mahnlauf (unique level + monotone Stufe). Jobs sind Singleton.
- pg-boss läuft nur im Worker; manuelle Auslösung über org-gescopte Mutationen.

## Rechtlich (markiert, vor Aktivierung prüfen)

- Verzug der Miete tritt mit Fälligkeit ein (§ 286 II Nr. 1 i.V.m. § 556b BGB) —
  ohne separate Mahnung. Mahnstufen sind geschäftliche Konvention.
- Verzugszinsen: Basiszinssatz (§ 247, variabel) + 5 PP (§ 288 I, Verbraucher).
  Standardmäßig **AUS**, taggenau (actual/365, Annahme).
- Mahngebühren nur als tatsächlicher Verzugsschaden (§§ 280/286), keine Pauschale.
  Standardmäßig **AUS**. Alles konfigurierbar in `DunningPolicy`.

## Fachlich kritische Logik (Testpflicht)

`charge-rules`, `allocation-rules`, `dunning-rules`, `csv-parser`, `matching`
(Unit) + Integrationstests für Sollstellung-Idempotenz, Zahlungszuordnung,
Mahn-Zustandsmaschine, Job-Idempotenz und **Cross-Tenant** (Router & Jobs).
