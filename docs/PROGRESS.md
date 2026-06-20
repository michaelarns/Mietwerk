# Mietwerk — PROGRESS

> Projekt-Gedächtnis. Pro Phase: Was gebaut wurde, Annahmen, offene Punkte.

## Phasenüberblick

| Phase | Inhalt | Status |
|---|---|---|
| 0 | Fundament: Plan, Architektur, Scaffold, Datenmodell, Auth & Multi-Tenancy, CI, Seed | ✅ abgeschlossen (Review-Gate) |
| 1 | Stammdaten: `properties`, `tenants-leases` (Kern-CRUD) | offen |
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

### Vorschlag Phase 1 (Stammdaten)

1. Slice `properties`: CRUD für `Property` + `Unit` (Service + tRPC + Formulare
   mit react-hook-form/Zod), Org-Wechsel-UI (setzt `x-organization-id`).
2. Slice `tenants-leases`: CRUD für `Tenant`, `Lease`, `LeaseTenant`
   (mehrere Mieter pro Mietverhältnis), Kaution.
3. Authentifizierte App-Shell (Navigation, Org-Switcher), geschützte Routen.
4. Unit-Tests für Soft-Delete-Verhalten; Integrationstest gegen
   Cross-Tenant-Zugriff (härtet den Chokepoint ab).
