# Mietwerk — Produkt- & Feature-Spezifikation

> Lebendes Dokument. Stand: Phase 0 (Fundament).

## 1. Vision

Mietwerk ist ein Cockpit für **private und semiprofessionelle Vermieter** mit
1–50 Einheiten. Diese Zielgruppe fällt zwischen die Stühle: Excel wird ab
wenigen Einheiten unübersichtlich und fehleranfällig, professionelle
Hausverwaltungssoftware ist zu teuer, zu komplex und auf gewerbliche Verwalter
zugeschnitten.

Der Kern-Schmerzpunkt im deutschen Markt ist die jährliche
**Betriebskostenabrechnung** (rechtlich reguliert, fehleranfällig, in Excel
mühsam) sowie die steuerliche Erfassung (Anlage V, AfA, umlagefähige vs. nicht
umlagefähige Kosten). Hier liegt die Zahlungsbereitschaft.

## 2. Zielnutzer

1. **Privatvermieter (B2C)** — verwalten ihre eigenen Objekte selbst.
2. **Kleine Hausverwaltungen / semiprofessionelle Investoren (B2B)** — betreuen
   mehrere Mandate.

## 3. Monetarisierung (relevant fürs Datenmodell)

- **Freemium**: 1 Einheit kostenlos (`PlanTier.FREE`).
- Gestaffelte Pläne nach Anzahl Einheiten: `STARTER` (bis 5), `PRO` (bis 20),
  `BUSINESS` (bis 50).
- Abrechnung über **Stripe**, Self-Service-Upgrade (Phase 8).

## 4. Domänen-Glossar (deutsche Fachbegriffe bleiben erhalten)

| Begriff | Bedeutung |
|---|---|
| Kaltmiete | Nettomiete ohne Betriebskosten (`baseRentCents`) |
| Nebenkostenvorauszahlung | monatliche Vorauszahlung auf Betriebskosten (`operatingCostAdvanceCents`) |
| Umlageschlüssel | Verteilungsmaßstab der Kosten (Wohnfläche, Personen, Einheiten, Verbrauch, MEA) |
| Betriebskostenabrechnung | jährliche Abrechnung der Vorauszahlungen gegen die tatsächlichen Kosten |
| Werbungskosten | steuerlich absetzbare Kosten der Vermietung (Anlage V) |
| AfA | Absetzung für Abnutzung (Gebäudeabschreibung) |
| Sollstellung | fällige Miete (Soll) im Gegensatz zum tatsächlichen Eingang (Ist) |
| Mahnstufe | Eskalationsstufe im Mahnwesen (Erinnerung → 1./2./letzte Mahnung) |

## 5. Feature-Scope (Vertical Slices)

| # | Slice | Inhalt | Phase |
|---|---|---|---|
| 1 | `auth-org` | Login, Registrierung, Mandanten, Rollen/Rechte, Einladungen, Stripe-Abo | 0 / 8 |
| 2 | `properties` | Liegenschaften & Einheiten, Stammdaten, Fotos, Dokumente | 1 |
| 3 | `tenants-leases` | Mieter, Mietverhältnisse, Mietvertrags-PDF, Selbstauskunft, Kaution | 1 |
| 4 | `rent-payments` | Sollstellung, Zahlungsabgleich, CSV/CAMT-Import, Mahnwesen | 2 |
| 5 | `costs-accounting` | Belegerfassung, Kategorisierung, umlagefähig?, Anlage-V-Export | 3 |
| 6 | `operating-cost-statement` | Abrechnungs-Engine mit Umlageschlüsseln, PDF je Mieter | 4 |
| 7 | `tax-afa` | AfA (linear/degressiv/Restnutzungsdauer), §35a EStG, Steuerberater-Export | 3 |
| 8 | `maintenance` | Schadensmeldung, Tickets, Handwerker, Kostenverfolgung | 7 |
| 9 | `dashboard-analytics` | Rendite brutto/netto, Cashflow, Leerstand, Mietausfälle | 5 |
| 10 | `ai-assistant` | Beleg-OCR, Kategorisierung, Entwürfe, Plausibilitätscheck (Anthropic API) | 6 |
| 11 | `tenant-portal` | Mieter-Login: Schadensmeldung, Dokumente, Zahlungsstatus | 7 |
| 12 | `notifications-jobs` | Fristenmonitor, E-Mail-Versand, Hintergrund-Jobs | laufend |

## 6. Rollen & Rechte

| Rolle | Rechte |
|---|---|
| `OWNER` | Vollzugriff inkl. Abo/Billing und Mitglieder-Verwaltung |
| `MANAGER` | Vollzugriff auf operative Daten, kein Billing |
| `ACCOUNTANT_READONLY` | Nur-Lese-Zugriff (z. B. Steuerberater) — keine Mutationen |

Durchgesetzt über `orgProcedure` (Lesen) bzw. `orgWriteProcedure`
(Schreiben blockiert `ACCOUNTANT_READONLY`). Siehe `docs/ARCHITECTURE.md`.

## 7. Querschnittsanforderungen

- **DSGVO**: Soft-Delete personenbezogener Entitäten, Audit-Log sensibler
  Aktionen, keine echten Personendaten in Seeds.
- **Geld**: Integer-Cent, nie Float.
- **Zeit**: UTC speichern, `Europe/Berlin` rendern.
- **Recht/Steuer**: rechtliche Details (zulässige Umlageschlüssel nach BetrKV,
  AfA-Sätze, Mahnfristen) werden vor Implementierung recherchiert und zur
  Prüfung markiert — nicht aus dem Gedächtnis angenommen.

## 8. Offene fachliche Punkte (für spätere Phasen zu klären)

- [ ] Genaue zulässige Umlageschlüssel & Pflichtangaben nach BetrKV / § 556 BGB
      (Phase 4) — **rechtlich zu verifizieren**.
- [ ] AfA-Sätze und Sonderabschreibungen (§ 7 EStG, degressive AfA Neubau)
      (Phase 3) — **steuerlich zu verifizieren**.
- [ ] Mahnfristen & zulässige Mahngebühren (Phase 2) — **rechtlich zu verifizieren**.
- [ ] Heizkostenverordnung (verbrauchsabhängige Abrechnung) — Umfang in Phase 4
      festlegen.
- [ ] Dokumenten-Storage (S3-kompatibel vs. lokal) — Entscheidung vor Phase 1.
