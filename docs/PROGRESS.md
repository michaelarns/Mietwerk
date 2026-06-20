# Mietwerk — PROGRESS

> Projekt-Gedächtnis. Pro Phase: Was gebaut wurde, Annahmen, offene Punkte.

## Phasenüberblick

| Phase | Inhalt | Status |
|---|---|---|
| 0 | Fundament: Plan, Architektur, Scaffold, Datenmodell, Auth & Multi-Tenancy, CI, Seed | ✅ abgeschlossen (Review-Gate) |
| 1 | Stammdaten: `properties`, `tenants-leases` (Kern-CRUD) | ✅ abgeschlossen (Review-Gate) |
| 2 | Geldfluss: `rent-payments` inkl. Mahnwesen | offen |
| 3 | Buchhaltung: `costs-accounting` + `tax-afa`, Anlage-V-Export | offen |
| 4 | Abrechnung: `operating-cost-statement` Engine + PDF (Herzstück) | offen |
| 5 | Auswertung: `dashboard-analytics` | offen |
| 6 | KI: `ai-assistant` | offen |
| 7 | Erweiterung: `maintenance` + `tenant-portal` | offen |
| 8 | Go-to-Market: Stripe-Abo, Polish, Test-Härtung, Deployment | offen |

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
