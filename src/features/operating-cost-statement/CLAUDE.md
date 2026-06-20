# CLAUDE.md — Slice `operating-cost-statement`

## Zweck

Die **Betriebskostenabrechnung**: umlagefähige Kosten (Phase 3) nach Umlage-
schlüssel auf die Mieter verteilen, Vorauszahlungen anrechnen und je Mieter eine
rechtskonforme Abrechnung als PDF erzeugen (Nachzahlung/Guthaben). Rechtliche
Regeln & Annahmen: **ADR 0010**.

## Hauptentitäten (Prisma)

- `OperatingCostStatement` — je Property + Zeitraum (≤ 12 Monate, § 556 Abs. 3),
  `advanceBasis` (SOLL/IST), `heatingConsumptionShareBp`, Status.
- `OperatingCostStatementItem` — Position (Snapshot `totalCents`, `allocationKey`,
  `consumptionSplit` für Heizung/Warmwasser).
- `OperatingCostStatementItemShare` — Anteil je Position je Mieter bzw. Vermieter
  (`leaseId = null` = Leerstand). Summe je Position == `totalCents`.
- `OperatingCostStatementResult` — Ergebnis je Mieter (allocated, advance Soll/Ist,
  balance, Tagesanteil).
- `OperatingCostConsumption` — erfasste Verbrauchswerte je Einheit/Position.
- `LeaseOccupancy` — effektiv-datierte Personenzahl (Personen-Schlüssel).

## Dateien

- `statement-engine.ts` — **reine** Umlage-Engine: Verteilung je Schlüssel
  (Wohnfläche/Einheiten/Personen/Verbrauch) tagesgenau, Leerstand → Vermieter,
  verlustfrei über `distributeCents`. Höchste Testpriorität.
- `heizkosten-rules.ts` — **rein**: HeizkostenV-Split (50–70 % Verbrauch).
- `advance-reconciliation.ts` — **rein**: Vorauszahlung Soll (prorater)/Ist
  (NK-Anteil echter Zahlungen) → Nachzahlung/Guthaben.
- `statement.service.ts` / `queries.service.ts` — Data Access, org-gescoped.
- `pdf/` — `statement-pdf.tsx` (Layout), `build-pdf-data.ts` (reiner Mapper),
  `statement-pdf.service.tsx` (rendern → Storage-Port → `Document` ABRECHNUNG).
- `statement.router.ts` (`operatingCostStatement`), `statement.schema.ts`,
  `labels.ts`, `ui/`.

## Lokale Konventionen & Regeln

- Reads über `orgProcedure`, Mutationen über `orgWriteProcedure` (Chokepoint).
- Geld in Cent; **verlustfreie** Verteilung (`distributeCents`). Datum UTC,
  tagesgenaue Proration wie Phase 2 (`charge-rules`).
- Finalisierte Abrechnung ist **unveränderlich** (Snapshot der Beträge).
- Audit-Log: `statement.create/run/finalize/delete/pdf`.
- PDF über `src/server/pdf` (ADR 0003/0010); Download via `/api/files/[id]`.

## Fachlich kritische Logik (Testpflicht)

`statement-engine` (je Schlüssel, Heizkosten-Split, Leerstand, unterjährig,
Rundung, Summenkonsistenz), `advance-reconciliation`, `build-pdf-data` + Render-
Smoke; Cross-Tenant über die neuen Services/Router.

## Rechtlich (markiert, ADR 0010 — vor Freigabe prüfen)

§ 2 BetrKV (nur Katalog & vereinbart), § 556a BGB (Wohnfläche-Default),
§§ 7/8/12 HeizkostenV (50–70 % Verbrauch, 15 %-Kürzung), § 556 Abs. 3 BGB
(12-Monats-Frist), Leerstand trägt Vermieter (BGH VIII ZR 159/05), formelle
Mindestangaben (BGH/§ 259 BGB). Defaults konfigurierbar; ⚠️-Annahmen in ADR 0010.
