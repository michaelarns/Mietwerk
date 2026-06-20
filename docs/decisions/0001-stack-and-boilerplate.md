# ADR 0001 — Stack & Boilerplate

- **Status:** akzeptiert
- **Datum:** 2026-06 (Phase 0)

## Kontext

Es ist eine Basis für ein produktionsreifes SaaS zu wählen. Verbindlich war der
T3-Stack. Zur Beschleunigung stand das Boilerplate `micro-saas-boilerplate`
(Turborepo, T3, Better Auth, Stripe) zur Debatte.

## Entscheidung

Wir scaffolden mit **`create-t3-app`** (Single-App, kein Turborepo) und ergänzen
gezielt: shadcn/ui, react-hook-form + Zod, Vitest, Playwright.

## Begründung

- **Weniger Über-Engineering:** Ein modularer Monolith mit Vertical Slices
  braucht kein Turborepo-Monorepo. Ein einzelnes Next.js-Projekt ist einfacher
  zu betreiben und genügt für 1–50-Einheiten-Vermieter als Zielgruppe.
- **Auth-Konsistenz:** Wir bleiben bei **NextAuth/Auth.js v5** (T3-Default) statt
  Better Auth — eine Auth-Lösung, die nativ mit dem Prisma-Adapter und
  Datenbank-Sessions arbeitet und den E-Mail-Provider direkt unterstützt.
- **Volle Kontrolle über das Datenmodell:** Stripe/Abo und Mandanten werden
  bewusst selbst modelliert (siehe `prisma/schema.prisma`), statt ein fremdes
  Billing-Schema zu erben.
- **Vorhersehbarkeit:** Der T3-Default ist gut dokumentiert und stabil; wir
  vermeiden Abhängigkeit von einem weniger verbreiteten Boilerplate.

## Konsequenzen

- Stripe-Integration und Mitglieder-/Einladungs-Flows bauen wir selbst (Phasen
  0/8) — mehr Aufwand, aber passgenau und ohne Fremd-Konventionen.
- Falls später mehrere Apps/Packages nötig werden, ist ein Umzug auf ein
  Monorepo möglich, aber aktuell nicht vorgesehen.
