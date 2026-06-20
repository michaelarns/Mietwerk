# Mietwerk — PROGRESS

> Projekt-Gedächtnis. Pro Phase: Was gebaut wurde, Annahmen, offene Punkte.

## Phasenüberblick

| Phase | Inhalt | Status |
|---|---|---|
| 0 | Fundament: Plan, Architektur, Scaffold, Datenmodell, Auth & Multi-Tenancy, CI, Seed | ✅ abgeschlossen (Review-Gate) |
| 1 | Stammdaten: `properties`, `tenants-leases` (Kern-CRUD) | ✅ abgeschlossen (Review-Gate) |
| 2 | Geldfluss: `rent-payments` inkl. Mahnwesen | ✅ abgeschlossen (Review-Gate offen) |
| 3 | Buchhaltung: `costs-accounting` + `tax-afa`, Anlage-V-Export | ✅ Backend + Rechenlogik + UI + E2E (Review-Gate offen) |
| 4 | Abrechnung: `operating-cost-statement` Engine + PDF (Herzstück) | 🚧 gebaut, Review-Gate / rechtliche Freigabe offen (ADR 0010) |
| 5 | Auswertung: `dashboard-analytics` | offen |
| 6 | KI: `ai-assistant` | offen |
| 7 | Erweiterung: `maintenance` + `tenant-portal` | offen |
| 8 | Go-to-Market: Stripe-Abo, Polish, Test-Härtung, Deployment | offen |

## Branch-Workflow

`main` ist die **eindeutige Integrations-Spitze** (Stand: Phase 0 bis 4 —
Phase 3 Backend + UI + E2E sowie Phase 4 konsolidiert). Jede Phase brancht von
`main`; nach dem Review-Gate wird der Phasen-Branch in `main` integriert (kein
Force, kein History-Rewrite); die nächste Phase startet wieder von `main`.
Details: [ADR 0008](decisions/0008-branch-workflow.md).

---

## Phase 0 — Fundament ✅

### Gebaut

- **Scaffold:** `create-t3-app` 7.40.0 (Next 15, React 19, TS strict, tRPC 11,
  Prisma 6, Auth.js v5, Tailwind 4). Projektname `mietwerk`.
- **Dokumentation:** `docs/SPEC.md`, `docs/ARCHITECTURE.md`, ADRs 0001–0004,
  Root-`CLAUDE.md`, Slice-`CLAUDE.md`-Vorlage + `auth-org`-Slice-`CLAUDE.md`.
- **Datenmodell:** vollständiges `prisma/schema.prisma` mit allen Kern-Entitäten,
  `organizationId` auf jeder fachlichen Entität, Soft-Delete (`deletedAt`),
  Geld als Integer-Cent, Enums (Rollen, Pläne, Umlageschlüssel, AfA-Methoden,
  Mahnstufen …), `AuditLog`.
- **Multi-Tenancy:** zentraler Chokepoint `orgProcedure` + `orgWriteProcedure`
  in `src/server/api/trpc.ts`; Resolver `resolveActiveOrganization` in
  `src/server/auth/tenancy.ts`. Erster Slice `auth-org` demonstriert das Muster.
- **Auth:** Auth.js v5, DB-Sessions, GitHub-OAuth + E-Mail-Magic-Link
  (Nodemailer → Mailpit lokal). ENV Zod-validiert (`src/env.js`).
- **UI-Basis:** shadcn/ui (new-york) Theme in Tailwind 4 + Button/Input/Label;
  schlanke Mietwerk-Landingpage.
- **Helfer:** `src/lib/money.ts` (Cent-Arithmetik inkl. verlustfreier
  `distributeCents`) mit Unit-Tests; `src/lib/date.ts` (UTC ↔ Europe/Berlin).
- **Infra:** `docker-compose.yml` (PostgreSQL 16 + Mailpit). Seed mit
  **anonymisierten** Daten: 2 Mandanten, je 1 Objekt, 2 Einheiten, 2
  Mietverhältnisse, Sollstellungen, Belege, AfA-Plan.
- **Tests/CI:** Vitest (Unit) + Playwright (E2E-Smoke); GitHub-Actions-Workflow
  (`quality`: Lint→Typecheck→Unit→Build; `e2e`: Playwright gegen PostgreSQL).

### Verifiziert

- `npm run lint`, `npm run typecheck`, `npm run test` (7 Tests) ✅
- `SKIP_ENV_VALIDATION=1 npm run build` ✅
- `prisma validate` + `prisma db push` gegen PostgreSQL 16 ✅
- `npm run db:seed` ✅; SQL-Check bestätigt isolierte Daten je Mandant.

### Annahmen

- OAuth-Provider = **GitHub** (statt Discord aus dem Scaffold).
- E-Mail-Login über SMTP/Nodemailer; lokal gegen **Mailpit**.
- Aktive Organisation kommt aus Header `x-organization-id`, sonst erste
  Mitgliedschaft (Org-Wechsel-UI folgt in Phase 1).
- PDF = `@react-pdf/renderer` (ADR 0003), Jobs = `pg-boss` (ADR 0004) — beide
  erst in späteren Phasen installiert.

### Offene Punkte / zu verifizieren

- Rechtliche/steuerliche Details (BetrKV-Umlageschlüssel, AfA-Sätze,
  Mahnfristen) sind in den jeweiligen Phasen zu recherchieren — siehe `SPEC.md`.
- Dokumenten-Storage (S3-kompatibel vs. lokal) vor Phase 1 entscheiden.
- `pg-boss`-Worker-Deployment bei serverlosem Hosting klären (ADR 0004).

---

## Phase 1 — Stammdaten ✅

### Gebaut

- **Lokale Laufumgebung:** MinIO in `docker-compose` (S3-kompatibel) + Bucket-
  Init; Dev-Skripte `dev` (App+Worker via `concurrently`), `dev:app`,
  `dev:worker`, `dev:up`; minimaler Worker-Platzhalter (`worker/index.ts`).
- **Storage-Port** (`src/server/storage/`): `put/get/delete/getSignedUrl` mit
  S3- und Local-FS-Adapter, Auswahl über `STORAGE_DRIVER` (ADR 0005).
- **App-Shell:** geschützte Route-Group `(app)` (Redirect zu Login / Onboarding),
  Header mit **Org-Switcher** (Cookie `mw_active_org` → tRPC-Chokepoint),
  Navigation Objekte/Mieter. Onboarding legt erste Organisation an.
- **Slice `properties`:** Property- & Unit-CRUD (Liste/Detail/Anlegen/Bearbeiten/
  Soft-Delete), AfA-Felder (ohne Berechnung).
- **Slice `tenants-leases`:** Tenant-CRUD; Lease-CRUD mit `LeaseTenant` (mehrere
  Mieter); abgeleiteter Status (aktiv/beendet/zukünftig); Überschneidungs- und
  Zeitraum-Regel serverseitig; Tenant-Soft-Delete-Schutz.
- **Slice `documents`:** Upload/Download/Löschen an Property & Unit über den
  Storage-Port (Routen `/api/files/*`), org-geprüft.
- **shadcn/ui** ergänzt (card, table, dialog, dropdown-menu, select, badge,
  sonner, form). Seed erweitert (2 Objekte/Mandant, beendete & Mehr-Mieter-Leases).

### Fachliche Regeln (mit Tests)

- Keine zwei sich überschneidenden Leases je Einheit (`assertNoOverlap`).
- Beginn ≤ Ende (Zod-Refinement + Service-Guard).
- Soft-Delete von Property/Unit blockiert bei aktivem/zukünftigem Lease (ADR 0006).
- Geld als Integer-Cent, Anzeige als Euro (2 Nachkommastellen).

### Verifiziert

- `lint`, `typecheck`, `test` (33 Tests) ✅ — inkl. **Cross-Tenant-
  Integrationstest** (Resolver + org-gescopte Services über alle neuen Slices).
- `build` ✅ · `prisma db push` + erweiterter `db:seed` gegen PostgreSQL 16 ✅.
- E2E: Playwright-Flow (anmelden → Objekt → Einheit → Mieter → Mietverhältnis).

### Annahmen

- Package Manager bleibt **npm** (Skriptnamen wie gefordert; pnpm auf Wunsch).
- Aktive Organisation via httpOnly-Cookie `mw_active_org` (vom Switcher gesetzt).
- Dokument-Download immer über authentifizierte App-Route (S3 → presigned
  Redirect, FS → Stream). Kein direkter Browser→S3-Upload in Phase 1.

### Offene Punkte / bewusst nicht gebaut

- Mietvertrags-PDF, Selbstauskunft, Kautionsabrechnung/-verzinsung, Zahlungen/
  Mahnwesen, Kosten/Steuer/AfA, pg-boss/Jobs — spätere Phasen.
- Recht/Steuer-Marker in `SPEC.md` bleiben (Phasen 2–4).

### Vorschlag Phase 2 (Geldfluss: `rent-payments`)

1. Sollstellung generieren (monatlich je aktivem Lease), Ist-Abgleich.
2. Import von Kontoumsätzen (CSV/CAMT) mit Zuordnung.
3. Mehrstufiges Mahnwesen (Mahnstufen, Fristen) — Regeln **rechtlich
   verifizieren** vor Implementierung.
4. Worker: erste echte Jobs via pg-boss (Sollstellung, Fristen) — Hosting-
   Entscheidung dann fällig.

---

## Phase 2 — Geldfluss (`rent-payments`) ✅ (Review-Gate offen)

### Gebaut

- **Schema:** `Payment` + `PaymentAllocation` (Ist-Eingänge, Guthaben),
  `BankImport` + `BankTransaction` (Import-Staging, idempotent via `dedupeHash`),
  `DunningPolicy` + `DunningPolicyLevel` (konfigurierbar), `Dunning` erweitert
  (`interestCents`, `channel`, `recipient`, `body`, `@@unique(rentPaymentId,level)`).
- **2.1 Sollstellung:** `charge-rules.ts` (rein, getestet) — **tagesgenaue
  Proration** (actual/actual), Fälligkeit = 3. Werktag; Service idempotent
  (`createMany` + `skipDuplicates`).
- **2.2 Zahlungen:** FIFO-Zuordnung (Teil-/Voll-/Überzahlung → Guthaben),
  Status-Recompute, Zahlungshistorie.
- **2.3 CSV-Import:** Parser (Delimiter/Spalten-Erkennung, dt. Beträge/Daten) +
  Zuordnungsvorschlag (Betrag/Zweck/Name), Vorschau → Bestätigung → Verbuchung;
  idempotent. CAMT.053 bewusst verschoben (nur CSV).
- **2.4 Mahnwesen:** monotone Zustandsmaschine (Erinnerung → 1. → 2. Mahnung),
  konfigurierbare Schwellen/Sätze, Ausgabe als E-Mail/Text an **Mailpit** (kein
  PDF). Ausgleichende Zahlung schließt den Lauf. Jeder Schritt ins `AuditLog`.
- **2.5 pg-boss:** Worker als echter Runner (eigenes Schema `pgboss`), zwei
  Singleton-Queues + Cron (Sollstellung monatlich, Mahnlauf täglich,
  Europe/Berlin), idempotent; manuell über tRPC auslösbar. ADR 0007.
- **2.6 Ansichten:** `/payments` (offene Posten + Überfällig + Aktionen),
  `/payments/import`, `/payments/leases/[id]` (Soll/Ist, Historie, Guthaben,
  Mahnungen). Nav „Zahlungen“.
- **Seed:** je Lease 4 Monate Soll + Zahlungen (bezahlt/teilbezahlt/überfällig)
  + Mahnungen (Erinnerung/1. Mahnung) — über die echten Services.

### Verifiziert

- `lint`, `typecheck`, `test` (**84 Tests**, davon Unit + Integration gegen
  PostgreSQL) ✅; `SKIP_ENV_VALIDATION=1 build` ✅; `db:push` + `db:seed` ✅.
- **Cross-Tenant**: erweitert um die neuen Services **und** die Jobs (A sieht/
  ändert/mahnt B nie).
- Worker-Boot verifiziert: `pgboss`-Schema getrennt vom App-Schema, Cron
  registriert (Europe/Berlin).
- E2E-Spec (Soll → Teilzahlung → überfällig → Mahnlauf/Erinnerung) geschrieben;
  läuft in CI. **Hinweis:** im Sandbox-Container sind Docker-Registry und
  Playwright-Browser-Download gesperrt → lokal kein Mailpit/Browser; daher hier
  per Build + Tests + DB-Checks verifiziert.

### Annahmen — **rechtlich, zur Freigabe markiert**

- **Proration:** tagesgenau (actual/actual) — bestätigt.
- **Mahnstufen:** 3 Stufen (Erinnerung → 1. → 2. Mahnung), `FINAL` reserviert —
  bestätigt. Anzahl ist geschäftliche Konvention, kein Gesetz.
- **Verzug:** tritt bei der Miete mit Fälligkeit ein (§ 286 Abs. 2 Nr. 1
  i.V.m. § 556b Abs. 1 BGB), ohne separate Mahnung. Fälligkeit = 3. Werktag
  (Samstag kein Werktag, Feiertage nicht berücksichtigt — Vereinfachung).
- **Verzugszinsen:** Basiszinssatz (§ 247 BGB, **variabel**) + 5 PP für
  Verbraucher (§ 288 Abs. 1 BGB), taggenau actual/365. **Standardmäßig AUS**;
  `baseRatePercent` muss vor Aktivierung gepflegt werden.
- **Mahngebühren:** nur als tatsächlicher Verzugsschaden ansetzbar (§§ 280, 286
  BGB), **keine** freie Pauschale; die den Verzug begründende erste Mahnung ist
  regelmäßig nicht erstattungsfähig. **Standardmäßig AUS**, je Stufe konfigurierbar.
- Schwellen/Sätze liegen in `DunningPolicy` (org-weit) und sind nach Prüfung
  anpassbar.

### Bewusst nicht gebaut (spätere Phasen)

- PDF-Mahnschreiben (Phase 4), CAMT.053 (späteres Inkrement), Verzugszinsen-
  Compounding, Kündigung wegen Zahlungsverzug, SEPA/Payment-Provider, FinTS/HBCI.
- Allgemeiner Fristenmonitor & Benachrichtigungssystem (Phase 7) — pg-boss dient
  hier nur Sollstellung & Mahnwesen.

### Offene Punkte / vor Freigabe

- Rechtliche Annahmen oben **prüfen/freigeben** (insb. Verzugszinssatz-Defaults,
  Werktags-/Feiertagslogik der Fälligkeit).
- pg-boss-Worker-Deployment bei serverlosem Hosting (ADR 0004/0007) bleibt offen.

---

## Phase 3 — Buchhaltung (`costs-accounting` + `tax-afa`) ✅ (Review-Gate offen)

Steuerliche Regeln, Quellen und freigegebene Defaults: **ADR 0009**.

### Gebaut (Backend + Rechenlogik, getestet) ✅

- **Schema** (additiv): `Transaction` um `paidDate`, `netAmountCents`,
  `allocationKey`, `expenseType` (+ § 82b-Verteilung) erweitert; `Property` um
  `completionDate`, `constructionStartDate`, `acquisitionCostCents`;
  `DepreciationSchedule` um `startMonth`, `usefulLifeYears`, `note`.
- **Reine Logik (66 Unit-Tests grün):** `afa-rules` (linear/degressiv 5 % mit
  Restwert-Wechsel/RND, Satz-Herleitung, monatsgenaue Proration, Cent-exakt),
  `category-rules` (umlagefähig/Umlageschlüssel/Anlage-V + regelbasierter
  Vorschlag), `anschaffungsnah-rules` (15 %-Schwelle netto, 3-Jahres-Fenster),
  `erhaltung-82b-rules` (2–5-Jahres-Verteilung), `anlage-v` (Kassenbasis,
  Vorzeichen/Überschuss).
- **Services/Router/Export:** Beleg-CRUD (Soft-Delete, Audit), Beleg-Upload an
  `Transaction` (Storage-Port), AfA-Plan-CRUD + Vorschlag, Anlage-V-Aufstellung,
  anschaffungsnah-Status, CSV-Export. Router `cost` + `taxAfa` registriert.
- **Cross-Tenant:** Integrationstest um die neuen Services erweitert.
- **Seed:** Kosten quer über Kategorien (inkl. § 82b-Verteilung,
  Finanzierungszinsen), Kassendaten, AfA-Pläne, **anschaffungsnaher Fall** (EFH).

### Annahmen — **steuerlich, zur Freigabe markiert** (Details: ADR 0009)

- **AfA-Satz** aus Fertigstellung hergeleitet (2,5 / 2 / 3 %), editierbar; LINEAR
  Default. **Degressiv 5 %** (nicht 6 %), Baubeginn 1.10.2023–30.9.2029.
- **Restnutzungsdauer:** nur Hinweis; BMF-Schreiben 22.2.2023 **aufgehoben**
  (1.12.2025) → geringere Hürden.
- **Bemessungsgrundlage** = Gebäudeanteil + anteilige Anschaffungsnebenkosten.
- **15 %-Regel:** kumuliert netto im 3-Jahres-Fenster, Status UNTER/NAHE/
  ÜBERSCHRITTEN; welche Belege zählen, entscheidet der Nutzer.
- **§ 11 Kassenbasis** ohne automatische 10-Tage-Regel (nur Hinweis).
- **§ 35a:** bei Vermietung i.d.R. Werbungskosten → nur Hinweis.

### Gebaut (UI 3.7 + E2E) ✅

- **3.7 Kosten-UI (`/costs`):** gefilterte Kostenliste (Objekt/Jahr/Kategorie über
  URL-Query, server-seitig geladen), Beleg-Erfassungs-Dialog mit regelbasiertem
  **Kategorie-Vorschlag**, §-82b-Verteilungsfeldern und optionalem **Beleg-Upload
  über den Storage-Port** (`/api/files/upload`, `transactionId`). **15-%-Warnung**
  (anschaffungsnahe HK) als Banner je gewähltem Objekt. Belegjournal-CSV-Export.
- **3.7 Steuer/AfA-UI (`/tax`, `/tax/[propertyId]`):** Objektauswahl; je Objekt
  AfA-Pläne mit berechneten Jahresbeträgen, **Plan anlegen** (Vorschlag-Prefill:
  Satz/Basis aus Stammdaten, Degressiv-Eignungshinweis) und **löschen**;
  **Anlage-V-Vorschau** mit Veranlagungsjahr-Auswahl (Einnahmen − Werbungskosten −
  AfA, Kassenbasis-Hinweis) und **CSV-Download** für den Steuerberater.
- **Navigation:** `app-nav.tsx` um „Kosten" und „Steuer & AfA" ergänzt.
- **Muster wiederverwendet:** Server-Components/tRPC fürs Lesen (kein
  `useEffect`-Fetching; Kategorie-Vorschlag über `utils.*.fetch`), shadcn/ui
  Tabellen/Dialoge/Selects/Toasts, Geld in Cent ↔ €-Anzeige, Datum Europe/Berlin,
  `orgProcedure` respektiert, `label`↔`input` für a11y/Testbarkeit verknüpft.

### Verifiziert (UI)

- `lint`, `typecheck`, `test` (**135 Tests**) ✅; `SKIP_ENV_VALIDATION=1 build` ✅
  (neue Routen `/costs`, `/tax`, `/tax/[propertyId]` kompilieren).
- **E2E-Spec** `e2e/costs-tax-flow.spec.ts` (Beleg erfassen + Kategorisierung →
  AfA-Plan anlegen → Anlage-V-Vorschau prüft Erhaltungsaufwand, AfA und Summe
  Werbungskosten). **Hinweis:** Playwright-Browser-Download im Sandbox-Container
  gesperrt → die Spec läuft in CI; lokal über Build + Suite + Typecheck verifiziert.

### Offen

- Review-Gate (steuerliche Annahmen-Freigabe, ADR 0009) weiterhin offen. Phase 3
  ist mit dieser Konsolidierung (Backend + UI + E2E) in `main` integriert.

---

## Phase 4 — Betriebskostenabrechnung 🚧 (Review-Gate offen)

> Branch `claude/keen-faraday-fokhd5`, auf dem Phase-3-Backend aufgesetzt. Mit
> der Konsolidierung steht Phase 4 — zusammen mit der vollständigen Phase 3
> (Backend + UI + E2E) — in `main` (siehe Branch-Workflow).

### Gebaut

- **Schema:** `OperatingCostStatement` je Property + Zeitraum (≤ 12 Monate),
  `advanceBasis` (SOLL/IST), konfigurierbarer Heizkosten-Verbrauchsanteil;
  `…Item` (Snapshot + `consumptionSplit`), `…ItemShare` (Anteil je Position je
  Mieter/Vermieter), `…Result` (Soll/Ist/Saldo, Tagesanteil),
  `OperatingCostConsumption` (Verbrauchswerte je Einheit), `LeaseOccupancy`
  (effektiv-datierte Personenzahl).
- **Umlage-Engine (rein, höchste Testabdeckung):** Verteilung je Schlüssel
  (Wohnfläche, Einheiten, Personen, Verbrauch) tagesgenau; Heizkosten-Split nach
  §§ 7/8 HeizkostenV; **Leerstand trägt der Vermieter** (Divisor bleibt voll,
  BGH VIII ZR 159/05); verlustfrei via `distributeCents`.
- **Vorauszahlungsabgleich:** Soll (tagesgenau prorater) und Ist (NK-Anteil der
  echten Zahlungen) → Nachzahlung/Guthaben.
- **PDF-Infrastruktur (ADR 0003/0010):** `@react-pdf/renderer`, serverseitiges
  `renderPdfToBuffer` + A4-Basis-Layout (`src/server/pdf`); Mieter-PDF mit den
  vier formellen Mindestangaben (BGH/§ 259 BGB) + Abrechnungsfrist (§ 556 III).
  Ablage über Storage-Port, Download via `/api/files/[id]`.
- **Service/Router** (`operatingCostStatement`, org-gescoped) + **Ansichten**:
  Liste, Anlegen (Objekt/Jahr), Verbrauchserfassung, Ergebnisvorschau je Mieter,
  PDF erzeugen/herunterladen, Finalisieren/Löschen; Audit-Log.
- **Seed:** je Mandant eine vollständige Beispielabrechnung 2025 (über den echten
  Service). **ADR 0010** mit recherchierten Rechtsregeln + markierten Annahmen.

### Verifiziert

- `npm run typecheck`, `SKIP_ENV_VALIDATION=1 npm run lint`,
  `SKIP_ENV_VALIDATION=1 npm run build` ✅
- `npm run test`: **132 Unit-Tests grün** (u. a. 22 Engine/Abgleich + 3 PDF),
  6 DB-Integrationsdateien skippen ohne DB (laufen in CI).
- `prisma validate` ✅. ⚠️ **Nicht** gegen eine DB ausgeführt (kein Docker-Daemon
  im Sandbox): `prisma db push`, `npm run db:seed`, die DB-Integrationstests
  (inkl. Cross-Tenant Phase 4) und das Playwright-E2E sind geschrieben, aber
  **in CI/mit DB zu verifizieren**.

### Annahmen (⚠️ zur Freigabe — Details in ADR 0010)

- Vorauszahlung **IST**; NK-Anteil anteilig aus gebündelter Sollmiete.
- Heizkosten-Split **einstellbar** (Korridor 50–70 %), Default **50 % Verbrauch**.
- Personenzahl **zeitraum-genau** (`LeaseOccupancy`); Proration **tagesgenau**.
- Abrechnungszeitraum **Kalenderjahr** (≤ 12 Monate). Schlüssel je Kategorie aus
  Phase-3-Mapping (Beleg-Override > Kategorie-Default > Wohnfläche).
- Kostenzuordnung nach **Buchungs-/Leistungsdatum** im Zeitraum (nicht Kassenbasis).
- `MITEIGENTUMSANTEIL` mangels Stammdaten → Fallback Wohnfläche (Hinweis).

### Offene Punkte

- Phase 3 ist mit dieser Konsolidierung in `main` integriert (Backend + UI + E2E);
  dieser Phase-4-Branch baute auf dem Phase-3-Backend auf.
- Review-Gate: Annahmen freigeben (ADR 0010); DB-gebundene Schritte in CI
  verifizieren.
