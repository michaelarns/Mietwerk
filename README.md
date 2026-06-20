# Mietwerk

Vermietungs- & Verwaltungs-Cockpit für private und semiprofessionelle Vermieter
(1–50 Einheiten). Schwerpunkt: Betriebskostenabrechnung und steuerliche
Erfassung (Anlage V, AfA, umlagefähige vs. nicht umlagefähige Kosten).

Gebaut als modularer Monolith mit Vertical Slices auf dem T3-Stack.

## Stack

Next.js 15 (App Router, RSC) · TypeScript (strict) · tRPC 11 · Prisma 6 +
PostgreSQL 16 · NextAuth/Auth.js v5 · Tailwind 4 + shadcn/ui ·
react-hook-form + Zod · Vitest + Playwright.

## Schnellstart (lokal)

```bash
# 1. Abhängigkeiten
npm install

# 2. .env anlegen
cp .env.example .env   # Werte ausfüllen (AUTH_SECRET via `npx auth secret`)

# 3. Dienste starten: PostgreSQL (5432) + Mailpit (UI: http://localhost:8025)
docker compose up -d

# 4. Datenbank & Demo-Daten
npm run db:push
npm run db:seed

# 5. Dev-Server
npm run dev
```

## Wichtige Befehle

| Befehl | Zweck |
|---|---|
| `npm run dev` | Dev-Server (Turbopack) |
| `npm run check` | Lint + Typecheck |
| `npm run test` | Unit-Tests (Vitest) |
| `npm run test:e2e` | E2E-Tests (Playwright) |
| `npm run db:push` | Prisma-Schema in die DB |
| `npm run db:seed` | anonymisierte Demo-Daten (2 Mandanten) |
| `npm run db:studio` | Prisma Studio |

## Dokumentation

- [`CLAUDE.md`](./CLAUDE.md) — globale Regeln & Konventionen
- [`docs/SPEC.md`](./docs/SPEC.md) — Produkt- & Feature-Spezifikation
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — Stack, Struktur, Multi-Tenancy
- [`docs/PROGRESS.md`](./docs/PROGRESS.md) — Phasen & Fortschritt
- [`docs/decisions/`](./docs/decisions/) — Architecture Decision Records
