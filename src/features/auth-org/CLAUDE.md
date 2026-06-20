# CLAUDE.md — Slice `auth-org`

## Zweck

Authentifizierung, Mandanten (Organizations), Rollen/Rechte, Mitglieder und
(später) Stripe-Abo & Self-Service-Upgrade.

## Hauptentitäten (Prisma)

- `Organization` — der Mandant (Tenant-Grenze), trägt Abo-Status.
- `User` — globaler Nutzer (NextAuth), über `Membership` mit Orgs verbunden.
- `Membership(organizationId, userId, role)` — Rolle pro Mandant.
- `Invitation` — Einladungs-Flow.

## Dateien

- `organization.router.ts` — tRPC-Router (`list`, `current`, `members`, `update`).
- `organization.service.ts` — Data Access Layer; `organizationId` explizit.
- `organization.schema.ts` — Zod-Schemas.

## Lokale Konventionen

- `list` nutzt `protectedProcedure` (tenant-übergreifend: „meine Orgs“).
- Alle org-bezogenen Reads über `orgProcedure`, Mutationen über
  `orgWriteProcedure` (blockiert `ACCOUNTANT_READONLY`).
- Die Auflösung User → aktive Organisation passiert **ausschließlich** in
  `~/server/auth/tenancy.ts` (`resolveActiveOrganization`). Diesen Resolver nicht
  duplizieren.
- Mitglieder-/Rollenänderungen und Einladungen sind sensibel → `AuditLog`.

## Offene Punkte / zu verifizieren

- [ ] Stripe-Abo (Plan-Limits je `PlanTier`, Webhooks) — Phase 8.
- [ ] Einladungs-E-Mails + Annahme-Flow — folgt mit `notifications-jobs`.
- [ ] Org-Wechsel-UI (Header `x-organization-id` setzen) — Phase 1.
