# Mietwerk — Architektur

> Stand: Phase 0. Ergänzt durch ADRs in `docs/decisions/`.

## 1. Stack & gepinnte Versionen

Basis: **T3-Stack** (`create-t3-app` 7.40.0) mit App Router. Begründung der
Boilerplate-Wahl: siehe [ADR 0001](decisions/0001-stack-and-boilerplate.md).

| Bereich | Technologie | Version (Hauptversion gepinnt) |
|---|---|---|
| Framework | Next.js (App Router, RSC) | 15.x |
| Sprache | TypeScript (strict) | 5.8.x |
| API | tRPC | 11.x |
| ORM | Prisma + PostgreSQL | 6.x (Client 6.19) / PostgreSQL 16 |
| Auth | NextAuth / Auth.js | 5.0.0-beta.25 |
| Adapter | @auth/prisma-adapter | 2.7.x |
| UI | Tailwind CSS | 4.x |
| UI-Komponenten | shadcn/ui (new-york) | manuell gepflegt |
| Formulare | react-hook-form + @hookform/resolvers | 7.54.x / 3.10.x |
| Validierung | Zod | 3.24.x |
| Data-Fetching (Client) | @tanstack/react-query | 5.69.x |
| Serialisierung | superjson | 2.2.x |
| Unit-Tests | Vitest | 3.x |
| E2E-Tests | Playwright | 1.49.x |
| Runtime | Node.js | 22.x |

Geplant, aber noch nicht installiert (spätere Phasen):

| Bereich | Technologie | Phase | Entscheidung |
|---|---|---|---|
| PDF | @react-pdf/renderer | 3/4 | [ADR 0003](decisions/0003-pdf-generation.md) |
| Hintergrund-Jobs | pg-boss (+ Cron) | laufend | [ADR 0004](decisions/0004-background-jobs.md) |
| Payments | Stripe | 8 | — |
| KI | @anthropic-ai/sdk | 6 | — |
| E-Mail (Transaktional) | nodemailer (Provider bereits aktiv) | laufend | — |

## 2. Ordnerstruktur (Vertical Slices)

```
src/
  app/                          # Next.js App Router
    api/auth/[...nextauth]/      # Auth.js Handler
    api/trpc/[trpc]/             # tRPC HTTP-Handler
    layout.tsx, page.tsx
  components/ui/                 # shadcn/ui Basis-Komponenten (button, input, label, …)
  features/                      # ── VERTICAL SLICES ──
    auth-org/
      organization.router.ts     # tRPC-Router des Slice
      organization.service.ts    # Data Access Layer (nimmt organizationId explizit)
      organization.schema.ts     # Zod-Schemas + abgeleitete Typen
      CLAUDE.md                  # lokale Konventionen des Slice
    <weitere Slices in späteren Phasen>
  lib/
    money.ts                     # Cent-Arithmetik (+ Tests)
    date.ts                      # UTC ↔ Europe/Berlin
    utils.ts                     # cn() für shadcn
  server/
    api/
      root.ts                    # appRouter (registriert Slice-Router)
      trpc.ts                    # Kontext + Procedures (TENANCY-CHOKEPOINT)
    auth/
      config.ts                  # NextAuth-Provider & Callbacks
      index.ts                   # auth()/handlers Export
      tenancy.ts                 # resolveActiveOrganization()
    db.ts                        # Prisma-Client-Singleton
  env.js                         # Zod-validierte ENV
  styles/globals.css             # Tailwind 4 + shadcn-Theme
prisma/
  schema.prisma                  # Datenmodell
  seed.ts                        # anonymisierte 2-Mandanten-Demodaten
e2e/                             # Playwright-Specs
docs/                            # SPEC, ARCHITECTURE, PROGRESS, decisions/
```

**Regel:** Slice-spezifischer Code lebt in `src/features/<slice>/`. Geteilter,
fachunabhängiger Code in `src/lib/` bzw. `src/server/`. UI, die nur ein Slice
betrifft, kommt in den Slice; global wiederverwendbare UI in `src/components/`.

## 3. Mandantentrennung (Multi-Tenancy)

Vollständige Begründung: [ADR 0002](decisions/0002-multi-tenancy.md).

**Modell:** Jeder fachliche Datensatz trägt `organizationId`. Nutzer sind über
`Membership` (mit `role`) mit einer oder mehreren `Organization` verbunden.

**Ein einziger Chokepoint:** `orgProcedure` in `src/server/api/trpc.ts`.

```
Request ──> tRPC Context (auth() → session)
        ──> protectedProcedure  (session.user vorhanden?)
        ──> orgProcedure        (resolveActiveOrganization → membership)
                 │  injiziert ctx.organizationId + ctx.membership.role
                 ▼
            Slice-Router ──> Service-Funktion(db, ctx.organizationId, …)
```

- `resolveActiveOrganization` (`src/server/auth/tenancy.ts`) ist die **einzige**
  Stelle, die User → Organisation auflöst. Aktive Organisation kommt aus dem
  Header `x-organization-id` (sofern Mitglied), sonst die erste Mitgliedschaft.
- `orgProcedure` wirft `FORBIDDEN`, wenn keine Mitgliedschaft existiert.
- `orgWriteProcedure` blockiert zusätzlich `ACCOUNTANT_READONLY` bei Mutationen.
- **Service-Funktionen** nehmen `organizationId` **explizit** als Parameter —
  so kann kein Slice die Trennung „vergessen“; sie kommt immer aus dem Kontext.

**Konvention:** Kein Slice ruft Prisma direkt mit tenant-übergreifenden Filtern
auf. Jede tenant-bezogene Query/Mutation läuft durch eine Service-Funktion, die
`organizationId` als ersten fachlichen Filter setzt.

## 4. Auth

- **Auth.js v5** mit **Datenbank-Sessions** (Prisma-Adapter). Datenbank-Sessions
  sind Voraussetzung für den E-Mail-/Magic-Link-Provider.
- Provider: **GitHub** (OAuth) + **Nodemailer** (E-Mail-Magic-Link, lokal gegen
  Mailpit auf `localhost:1025`).
- Die Session trägt nur `user.id`. Organisation und Rolle werden serverseitig im
  tRPC-Kontext aufgelöst (nicht in der Session gespeichert) — so bleiben
  Org-Wechsel und Rollenänderungen ohne Re-Login wirksam.

## 5. Konventionen für Geld & Zeit

- **Geld:** Integer-Cent, Feldsuffix `Cents`. Arithmetik nur über `src/lib/money.ts`
  (inkl. `distributeCents` mit Largest-Remainder für verlustfreie Umlage).
- **Zeit:** `DateTime` in UTC; Rendering über `src/lib/date.ts` in
  `Europe/Berlin`.

## 6. Tests & CI

- **Vitest** für Unit-Tests; Specs liegen neben dem Code (`*.test.ts`).
  Fachlich kritische Logik (Abrechnung, AfA, Mahnstufen) wird zuerst getestet.
- **Playwright** für E2E kritischer Flows (`e2e/`).
- **GitHub Actions** (`.github/workflows/ci.yml`): Job `quality`
  (Lint → Typecheck → Unit → Build) und Job `e2e` (Playwright gegen einen
  PostgreSQL-Service).

## 7. Lokale Entwicklung

`docker compose up -d` startet PostgreSQL (5432) und Mailpit (1025/8025).
Danach `npm run db:push && npm run db:seed && npm run dev`.
