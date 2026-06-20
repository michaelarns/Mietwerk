# ADR 0007 — Einführung von pg-boss (Phase 2)

- **Status:** akzeptiert
- **Datum:** 2026-06 (Phase 2)
- **Kontext zu:** [ADR 0004](0004-background-jobs.md) (Grundsatzentscheidung pg-boss)

## Kontext

Phase 2 (`rent-payments`) braucht einen Scheduler: die **wiederkehrende
Sollstellung** (monatlich) und den **mehrstufigen Mahnlauf** (täglich) müssen
automatisiert, überlappungssicher und idempotent laufen. ADR 0004 hat pg-boss
grundsätzlich gewählt; hier wird es konkret eingeführt.

## Entscheidung

`pg-boss` wird installiert und der bisherige Worker-Platzhalter
(`worker/index.ts`) zu einem echten pg-boss-Runner ausgebaut.

- **Eigenes DB-Schema:** pg-boss legt seine Tabellen im Schema `pgboss` an
  (Default), **getrennt** vom Prisma-App-Schema `public`. Prisma verwaltet nur
  `public`; die beiden überschneiden sich nicht.
- **Worker-only:** pg-boss läuft ausschließlich im Worker-Prozess. Die Next-App
  importiert pg-boss **nicht**. Die fachliche Logik liegt in org-gescopten
  Service-Funktionen; der Worker ruft sie pro Organisation auf.
- **Zwei wiederkehrende Queues**, beide mit Queue-Policy `singleton`
  (überlappungssicher) und idempotenter Logik:
  - `rent-charge` — monatliche Sollstellung,
  - `dunning-run` — täglicher Mahnlauf.
- **Manuell auslösbar:** dieselben Service-Funktionen sind über
  org-gescopte tRPC-Mutationen synchron auslösbar (für Tests und UI), ohne dass
  der Worker laufen muss. pg-boss ist reine Automatisierungs-/Zeitplan-Schicht.

## Abgrenzung (bewusst eng)

pg-boss dient in dieser Phase **nur** Sollstellung und Mahnwesen. Der allgemeine
**Fristenmonitor** und das breitere **Benachrichtigungssystem** bleiben Phase 7
(`notifications-jobs`) vorbehalten. Neue Job-Typen werden erst dort ergänzt.

## Konsequenzen

- Es wird ein **langlaufender Worker-Prozess** benötigt (lokal via `npm run dev`
  über `concurrently`; Deployment-Frage für serverloses Hosting bleibt offen,
  siehe ADR 0004).
- Tenant-Sicherheit der Jobs: Jobs sind organisationsübergreifend geplant, aber
  verarbeiten **jede Organisation strikt isoliert** über die org-gescopten
  Service-Funktionen. Cross-Tenant-Tests decken auch die Jobs ab.
- Mandanten ohne fällige Aktionen werden übersprungen; der Lauf bleibt idempotent
  (kein Doppel-Soll, keine doppelte Mahnstufe).
