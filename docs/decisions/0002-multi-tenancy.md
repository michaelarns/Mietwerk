# ADR 0002 — Mandantentrennung (Multi-Tenancy)

- **Status:** akzeptiert
- **Datum:** 2026-06 (Phase 0)

## Kontext

Mietwerk ist mandantenfähig: Privatvermieter und Hausverwaltungen teilen sich
eine Anwendung und Datenbank, dürfen aber niemals fremde Daten sehen. Die
Trennung muss an einer zentralen Stelle erzwungen werden, nicht ad hoc in
einzelnen Queries.

## Entscheidung

**Shared Database, Shared Schema** mit einer `organizationId`-Spalte auf jeder
fachlichen Entität. Die Trennung wird ausschließlich im tRPC-Layer erzwungen:

- `Membership(userId, organizationId, role)` verbindet Nutzer und Mandant.
- `resolveActiveOrganization()` (`src/server/auth/tenancy.ts`) ist die **einzige**
  Funktion, die einen User auf eine aktive Organisation abbildet.
- `orgProcedure` (`src/server/api/trpc.ts`) ruft diesen Resolver auf, injiziert
  `ctx.organizationId` und `ctx.membership.role` und ist der **einzige**
  Einstieg für mandantenbezogene Procedures.
- `orgWriteProcedure` ergänzt eine Rollenprüfung (kein Schreiben für
  `ACCOUNTANT_READONLY`).
- Service-Funktionen erhalten `organizationId` **explizit** als Parameter.

## Alternativen

- **PostgreSQL Row-Level Security (RLS):** stark, aber an Prisma vorbei
  konfiguriert und schwerer testbar; für die Zielgröße Over-Engineering.
- **Datenbank pro Mandant:** maximale Isolation, aber hoher Betriebsaufwand und
  teure Migrationen — unverhältnismäßig für 1–50-Einheiten-Kunden.
- **Filter ad hoc in jeder Query:** fehleranfällig, kein zentraler Chokepoint —
  abgelehnt.

## Konsequenzen

- Eine vergessene `organizationId` in einer Service-Funktion ist das zentrale
  Risiko. Gegenmaßnahmen: Services nehmen `organizationId` als ersten fachlichen
  Parameter; geplant sind Integrationstests, die Cross-Tenant-Zugriffe
  ausschließen.
- RLS kann später als zweite Verteidigungslinie ergänzt werden, ohne die
  API-Schicht zu ändern.
