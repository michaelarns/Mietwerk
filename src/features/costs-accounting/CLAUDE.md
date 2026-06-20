# CLAUDE.md — Slice `costs-accounting`

## Zweck

Belegerfassung & Kategorisierung, umlagefähig vs. nicht (BetrKV), Abgrenzung
Erhaltungs-/Herstellungsaufwand inkl. anschaffungsnaher HK, und die
**Anlage-V-Aufstellung** je Objekt/Jahr (Einnahmen aus Phase 2 − Werbungskosten
− AfA) plus CSV-Export. Steuerliche Regeln: siehe ADR 0009.

## Hauptentität (Prisma)

- `Transaction` — Beleg/Kostenposition: `category`, `amountCents` (brutto),
  `netAmountCents` (15 %-Test), `paidDate` (Kassenbasis § 11), `isAllocatable` +
  `allocationKey` (BetrKV), `expenseType` + `distributionYears` (§ 82b),
  `isAfaRelevant`, `isLaborCost35a`. Belege hängen über `documents`.

## Dateien

- `category-rules.ts` — **rein**: Kategorie → umlagefähig-Default +
  Umlageschlüssel (BetrKV) + Anlage-V-Zeilengruppe; regelbasierter Vorschlag.
- `anschaffungsnah-rules.ts` — **rein**: 15 %-Schwelle (netto) im 3-Jahres-Fenster.
- `erhaltung-82b-rules.ts` — **rein**: gleichmäßige 2–5-Jahres-Verteilung.
- `anlage-v.ts` — **rein**: Kassenbasis-Aggregation (Einnahmen − WK − AfA).
- `costs.service.ts` / `queries.service.ts` — Data Access, org-gescoped.
- `export.service.ts` — CSV (Anlage V + Belegjournal).
- `costs.router.ts` (`cost`), `labels.ts`, `ui/`.

## Lokale Konventionen

- Reads über `orgProcedure`, Mutationen über `orgWriteProcedure`.
- Geld in Cent (`~/lib/money`); Datum UTC, Render `~/lib/date`. Soft-Delete +
  `AuditLog` (`cost.create`/`cost.softDelete`).
- **Kassenbasis (§ 11):** Aggregation über `Payment.valueDate` (Einnahmen) und
  `Transaction.paidDate` (Ausgaben), nie über Soll-/Rechnungsdatum.
- Aktivierte Aufwendungen (Herstellung/anschaffungsnah) sind **keine** direkten
  Werbungskosten — sie wirken über die AfA (`tax-afa`).

## Fachlich kritische Logik (Testpflicht)

`category-rules`, `anschaffungsnah-rules` (15 %), `erhaltung-82b-rules`,
`anlage-v` (Kassenbasis, Vorzeichen) — Unit-Tests; Cross-Tenant über die Services.

## Rechtlich (markiert, ADR 0009)

umlagefähig/Umlageschlüssel nach BetrKV (⚠️ vor Abrechnung Phase 4 prüfen);
15 %-Regel § 6 Abs. 1 Nr. 1a (netto, Ausnahmen); § 82b nur Privatvermögen/
Wohnzwecke; 10-Tage-Regel (§ 11) **nicht** automatisch — Hinweis.
