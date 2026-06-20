# CLAUDE.md — Slice `tax-afa`

## Zweck

AfA-Verwaltung je Objekt: linear / degressiv / Restnutzungsdauer, Satz-Herleitung
aus der Fertigstellung, Bemessungsgrundlage = Gebäudeanteil + anteilige
Anschaffungsnebenkosten. Plus § 35a-Hinweis. Steuerliche Regeln: ADR 0009.

## Hauptentitäten (Prisma)

- `DepreciationSchedule` — Plan-Parameter (`method`, `baseCents`, `ratePercent`,
  `startYear`, `startMonth`, `usefulLifeYears`, `note`).
- `DepreciationScheduleEntry` — vorhanden für spätere Einzeljahr-Overrides;
  **aktuell werden die Jahresbeträge aus den Parametern berechnet** (eine Quelle
  der Wahrheit), nicht redundant gespeichert.

## Dateien

- `afa-rules.ts` — **rein**: `computeDepreciationSchedule` (linear/degressiv 5 %
  mit Restwert-Wechsel/RND, monatsgenaue 1.-Jahres-Proration, Cent-exakt),
  `deriveLinearRate` (2,5/2/3 % nach Fertigstellung), `checkDegressiveEligibility`
  (Förderzeitraum). Direkt testbar.
- `paragraph35a-rules.ts` — **rein**: Hinweis (keine Berechnung).
- `afa.service.ts` — Data Access; org-gescoped; `getAfaEntriesForProperty`
  (von `costs-accounting`/Anlage V konsumiert), `suggest*`, Audit.
- `tax-afa.router.ts` (`taxAfa`), `labels.ts` (Methoden-Labels).
- `ui/` — `create-schedule-dialog` (Plan anlegen mit Vorschlag-Prefill),
  `delete-schedule-button`. Seiten: `app/(app)/tax` + `app/(app)/tax/[propertyId]`.

## Lokale Konventionen

- Reads über `orgProcedure`, Mutationen über `orgWriteProcedure`.
- Geld in Cent; Sätze als Konstanten mit Quellenkommentar. Bemessungsgrundlage
  **nur Gebäudeanteil** (+ Nebenkosten), nie Grund und Boden.
- AfA-Pläne sind kein personenbezogener Datensatz → Hard-Delete + `AuditLog`.

## Fachlich kritische Logik (Testpflicht)

`afa-rules`: jede Methode korrekt, Summe = Bemessungsgrundlage (Cent),
Satz-Herleitung, Degressiv-Eignung — Unit-Tests; Cross-Tenant über die Services.

## Rechtlich (markiert, ADR 0009)

§ 7 Abs. 4 (linear), Abs. 5a (degressiv 5 %, **nicht 6 %**; Baubeginn
1.10.2023–30.9.2029), Abs. 4 S. 2 (kürzere ND; BMF-Schreiben 22.2.2023
**aufgehoben** 1.12.2025). Alle Werte konfigurierbar, zur Freigabe markiert.
