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

Mietwerk läuft vollständig **lokal** — keine Cloud, kein Deployment nötig.
Zwei Befehle genügen:

```bash
# 1. Einmalig: Abhängigkeiten + .env
npm install
cp .env.example .env          # AUTH_SECRET via `npx auth secret` setzen.
                              # GitHub-OAuth ist optional (Magic-Link genügt);
                              # ohne MinIO: STORAGE_DRIVER="fs" setzen.

# 2. Dienste hoch (PostgreSQL 5432, Mailpit 8025, MinIO 9000/9001)
npm run dev:up                # = docker compose up -d

# 3. Datenbank & Demo-Daten (einmalig bzw. bei Schema-Änderung)
npm run db:push
npm run db:seed

# 4. App + Worker zusammen starten
npm run dev
```

Danach:

- **App:** http://localhost:3000
- **Mailpit (Magic-Link-Mails):** http://localhost:8025 — Login-Link dort anklicken
- **MinIO-Konsole:** http://localhost:9001 (`minioadmin` / `minioadmin`)

Der **Worker** ist in Phase 1 ein Platzhalter: er verbindet sich mit der DB,
meldet Bereitschaft und bleibt am Leben (noch keine Jobs).

In gesperrten Umgebungen / CI ohne S3: `STORAGE_DRIVER="fs"` setzen — dann nutzt
der Storage-Port den lokalen Dateispeicher (`.storage/`) statt MinIO.

## Wichtige Befehle

| Befehl | Zweck |
|---|---|
| `npm run dev` | App **und** Worker zusammen (beschriftete Logs) |
| `npm run dev:app` | nur die Next.js-App |
| `npm run dev:worker` | nur den Worker-Prozess |
| `npm run dev:up` | docker-compose hoch (Postgres, Mailpit, MinIO) |
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
