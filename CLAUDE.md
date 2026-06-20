# CLAUDE.md — Mietwerk (Root)

Globale Regeln und Architektur für das Projekt **Mietwerk**, ein Vermietungs-
und Verwaltungs-Cockpit für private und semiprofessionelle Vermieter.

> Diese Datei ist bewusst schlank. Details stehen in `docs/` (progressive
> disclosure). Jeder Vertical Slice hat zusätzlich eine eigene kompakte
> `CLAUDE.md` mit lokalen Konventionen.

## Was ist Mietwerk?

SaaS für Vermieter mit 1–50 Einheiten. Kern-Schmerzpunkt und Zahlungsbereitschaft:
die jährliche **Betriebskostenabrechnung** und die steuerliche Erfassung
(Anlage V, AfA, umlagefähige vs. nicht umlagefähige Kosten). Siehe `docs/SPEC.md`.

## Tech-Stack (gepinnt — Details in `docs/ARCHITECTURE.md`)

T3-Stack mit App Router: Next.js 15 (React 19, RSC), TypeScript strict, tRPC 11,
Prisma 6 + PostgreSQL, NextAuth/Auth.js v5, Tailwind 4 + shadcn/ui,
react-hook-form + Zod, Vitest + Playwright.

## Architektur-Prinzipien

1. **Modularer Monolith mit Vertical Slices.** Code nach Fachdomäne, nicht nach
   technischer Schicht. Ein Slice liegt unter `src/features/<slice>/` und
   co-locatet Router, Service, Zod-Schemas, Typen und (sofern slice-spezifisch)
   UI.
2. **Strikte Mandantentrennung.** Jeder Datensatz gehört zu einer
   `organizationId`. Die Trennung wird an **einer** Stelle erzwungen:
   `orgProcedure` in `src/server/api/trpc.ts` (Resolver:
   `src/server/auth/tenancy.ts`). Kein Slice umgeht diese Stelle.
3. **Data Access Layer.** Datenzugriff bündelt sich in Service-Funktionen
   (`*.service.ts`), nicht in Komponenten. Mutationen über tRPC / Server Actions.
4. **Hierarchische CLAUDE.md.** Diese Root-Datei + je Slice eine kompakte
   `CLAUDE.md`. Detail-Dokumente nur bei Bedarf laden.
5. **Dokumentation als Gedächtnis.** Fortschritt in `docs/PROGRESS.md`,
   Entscheidungen als ADRs in `docs/decisions/`.

## Coding-Konventionen (verbindlich)

- **Kein `any`.** Kein `@ts-ignore` ohne kurzen Begründungskommentar.
- **Kein Daten-Fetching über `useEffect`.** Datenfluss über Server Components,
  Server Actions und tRPC.
- **Geld immer als Integer in Cent** (`*Cents`), nie als Float. Helfer in
  `src/lib/money.ts`.
- **Datum in UTC speichern, in `Europe/Berlin` rendern.** Helfer in
  `src/lib/date.ts`.
- **DSGVO by design:** keine echten Personendaten in Seeds, Soft-Delete
  (`deletedAt`) statt Hard-Delete bei personenbezogenen Entitäten, Audit-Log
  (`AuditLog`) für sensible Aktionen.
- **Jede externe Eingabe wird mit Zod validiert** (API-Input, ENV in
  `src/env.js`, Formulare).
- **Conventional Commits**, kleine und häufige Commits.
- **Fachlich kritische Logik** (Betriebskostenabrechnung, AfA, Mahnstufen) wird
  mit Unit-Tests abgedeckt, bevor sie als fertig gilt.
- **Deutsche Fachbegriffe** (Kaltmiete, Nebenkostenvorauszahlung, Umlageschlüssel,
  Werbungskosten) bleiben im Code und in der UI deutsch.

## Verzeichnisstruktur (Kurzform)

```
src/
  app/                 # Next.js App Router (Routen, Layouts)
  components/ui/        # shadcn/ui Basis-Komponenten
  features/<slice>/     # Vertical Slices (router, service, schema, ui, CLAUDE.md)
  lib/                  # geteilte Helfer (money, date, utils)
  server/
    api/                # tRPC root + trpc.ts (Kontext + orgProcedure)
    auth/               # NextAuth-Config + tenancy.ts (Mandanten-Resolver)
    db.ts               # Prisma-Client-Singleton
  env.js                # Zod-validierte ENV
prisma/                 # schema.prisma + seed.ts
docs/                   # SPEC, ARCHITECTURE, PROGRESS, decisions/
```

## Befehle

```bash
npm run dev        # Dev-Server (Turbopack)
npm run check      # Lint + Typecheck
npm run test       # Vitest (Unit)
npm run test:e2e   # Playwright (E2E)
docker compose up -d   # PostgreSQL (5432) + Mailpit (8025)
npm run db:push    # Schema in DB pushen
npm run db:seed    # anonymisierte Demo-Daten
```

## Definition of Done

Eine Aufgabe gilt erst als fertig, wenn `npm run lint`, `npm run typecheck` und
`npm run test` grün sind — und fachlich kritische Logik durch Unit-Tests
abgedeckt ist.

## Arbeitsweise mit Phasen

Entwicklung in Phasen (siehe `docs/PROGRESS.md`). Jede Phase endet mit grünem
Build, grünen Tests und einem Review-Gate. Bei fachlicher Unklarheit (Recht,
Steuer, Abrechnung) **nachfragen statt raten**; Annahmen klar markieren.
