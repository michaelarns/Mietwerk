# ADR 0004 — Hintergrund-Jobs & Cron

- **Status:** vorgeschlagen (umzusetzen ab Phase 2, voll in `notifications-jobs`)
- **Datum:** 2026-06 (Phase 0)

## Kontext

Es braucht Hintergrundarbeit und Zeitpläne: Fristenmonitor (Mietende,
Indexanpassung, Abrechnungsfrist), automatisiertes mehrstufiges Mahnwesen,
wiederkehrende Sollstellung, E-Mail-Versand und perspektivisch KI-Aufgaben
(Beleg-OCR). Gefordert ist eine **schlanke** Lösung „passend zum Stack“.

## Entscheidung

**`pg-boss`** als Job-Queue und Scheduler — eine Queue **auf der bereits
vorhandenen PostgreSQL-Datenbank**, betrieben in einem schlanken Worker-Prozess.
Periodische Auslöser über die Cron-Funktion von `pg-boss` (alternativ ein
externer Cron, der einen internen Endpoint anstößt).

## Begründung

- **Keine zusätzliche Infrastruktur:** nutzt PostgreSQL — kein Redis, kein
  externer SaaS. Das ist die schlankste Option, die zum Stack passt.
- **Transaktionale Nähe:** Jobs können in derselben DB-Transaktion wie fachliche
  Änderungen eingereiht werden (Outbox-tauglich).
- **Eingebauter Scheduler:** Cron-Ausdrücke und Wiederholungen/Retries out of the
  box — deckt Fristenmonitor und Mahnlauf ab.

## Alternativen

- **BullMQ:** ausgereift, aber benötigt Redis → zusätzliche Infrastruktur.
- **Inngest / Trigger.dev:** komfortabel und serverless-freundlich, aber externe
  Abhängigkeit und Kosten; mehr als nötig für die Zielgröße.
- **Reiner Vercel-Cron → tRPC-Endpoint:** einfach, aber ohne Queue/Retry/
  Nebenläufigkeitskontrolle; geeignet nur für triviale Periodik.

## Konsequenzen

- Es wird ein **langlaufender Worker-Prozess** benötigt (separater Node-Prozess
  bzw. Container). Bei rein serverlosem Hosting (z. B. Vercel) ist der Worker
  getrennt zu deployen — **vor Phase „notifications-jobs“ zu bestätigen**.
- Job-Definitionen liegen je Slice; die Worker-Registrierung wird zentral
  gebündelt (`notifications-jobs`).
