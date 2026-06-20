# ADR 0010 — Betriebskostenabrechnung & PDF-Infrastruktur (Phase 4)

- **Status:** akzeptiert (Defaults zur fachlichen Freigabe markiert ⚠️)
- **Datum:** 2026-06 (Phase 4)
- **Betrifft Slices:** `operating-cost-statement`, `src/server/pdf`

## Kontext

Phase 4 ist das rechtlich folgenreichste Feature: die jährliche
Betriebskostenabrechnung. Sie führt die Wohnflächen (Phase 1), die NK-Voraus-
zahlungen aus Mietverhältnissen/Zahlungen (Phase 1/2) und die umlagefähigen
Kosten samt Umlageschlüssel-Hinweisen (Phase 3) zusammen, verteilt die Kosten
nach den jeweiligen Schlüsseln, rechnet die Vorauszahlungen an und erzeugt je
Mieter eine rechtskonforme Abrechnung als PDF. Zugleich wird die PDF-Infra-
struktur eingeführt (ADR 0003).

**Alle Sätze/Schwellen wurden in dieser Session gegen Primärquellen recherchiert
(nicht aus dem Gedächtnis gesetzt) und sind als konfigurierbare Konstanten mit
Quellenkommentar hinterlegt. Annahmen sind mit ⚠️ markiert und vom Auftraggeber
freizugeben.**

## Entscheidung A — PDF-Infrastruktur

- **`@react-pdf/renderer`** (bestätigt aus ADR 0003): deklarativ in TSX,
  deterministisch, kein Headless-Browser.
- Zentrales serverseitiges Modul `src/server/pdf/render.ts`
  (`renderPdfToBuffer`) + wiederverwendbares A4-Basis-Layout
  (`base-layout.tsx`, Kopf-/Fußzeile, Tabellen-Styles). Jede künftige PDF-Aus-
  gabe (Mahnung, Anlage V) baut darauf auf.
- Ausgabe wird über den **Storage-Port** (ADR 0005) abgelegt und als `Document`
  (Typ `ABRECHNUNG`) verknüpft; Download über die bestehende, mandantengeprüfte
  Route `/api/files/[id]`. `@react-pdf/renderer` ist `serverExternalPackages`.

## Recherchierte Regeln (Stand 06/2026)

### 1. Umlagefähige Betriebskosten — § 2 BetrKV i.V.m. § 1 BetrKV

Umlagefähig ist **nur** der Katalog des § 2 BetrKV (Nr. 1–17) und nur, soweit im
Mietvertrag **vereinbart**. „Sonstige Betriebskosten" (Nr. 17) müssen konkret
benannt sein. Kosten außerhalb des Katalogs oder ohne Vereinbarung (z. B.
Instandhaltung/Reparatur, Verwaltungskosten) sind **nicht** umlagefähig.
→ Mietwerk: Umlagefähigkeit + Schlüssel kommen aus Phase 3
(`isAllocatable`, `allocationKey`, `category-rules.ts`); die Engine verteilt nur
als umlagefähig markierte Positionen.

### 2. Umlagemaßstab (Default) — § 556a Abs. 1 BGB

Wortlaut (verifiziert): „Haben die Vertragsparteien nichts anderes vereinbart,
sind die Betriebskosten … **nach dem Anteil der Wohnfläche** umzulegen.
Betriebskosten, die von einem **erfassten Verbrauch** … abhängen, sind nach
einem Maßstab umzulegen, der dem unterschiedlichen Verbrauch … Rechnung trägt."
→ Default-Schlüssel **Wohnfläche**; Verbrauchskosten nach Verbrauch.

### 3. Heizung & Warmwasser — §§ 7, 8, 12 HeizkostenV

- § 7 Abs. 1 / § 8 Abs. 1 (verifiziert): **mindestens 50 v.H., höchstens
  70 v.H.** nach erfasstem Verbrauch; Rest (Grundkosten) nach Wohn-/Nutzfläche.
- § 12 Abs. 1 (verifiziert): wird **nicht** verbrauchsabhängig abgerechnet, darf
  der Mieter seinen Anteil **um 15 v.H. kürzen** (zusätzlich 3 % bei fehlenden
  fernablesbaren Zählern, § 5). → Bei vereinfachter Behandlung **Warnung**.

### 4. Abrechnungsfrist & -zeitraum — § 556 Abs. 3 BGB

Jährlich abzurechnen; Mitteilung an den Mieter **bis Ablauf des 12. Monats**
nach Ende des Abrechnungszeitraums, sonst ist die **Nachforderung ausgeschlossen**
(außer der Vermieter hat die Verspätung nicht zu vertreten). ⇒ Zeitraum
**höchstens 12 Monate** (Service erzwingt ≤ 366 Tage); das PDF nennt die Frist.

### 5. Leerstand — BGH VIII ZR 159/05 (31.05.2006)

Der auf leerstehende/nicht vermietete Einheiten entfallende Anteil trägt der
**Vermieter**. Bei Flächenmaßstab bleibt der **Divisor = Gesamtfläche** (inkl.
Leerstand); es wird **nicht** auf weniger m² verteilt. → Engine: Leerstand ist
ein eigener Teilnehmer (`leaseId = null`); Summe Mieter + Vermieter = Gesamtkosten.

### 6. Formelle Mindestanforderungen — st. Rspr. BGH (§ 259 BGB)

(1) Zusammenstellung der Gesamtkosten, (2) Angabe **und Erläuterung** der
Verteilerschlüssel, (3) Berechnung des Anteils des Mieters, (4) Abzug der
**geleisteten** Vorauszahlungen. → Alle vier Angaben stehen im Mieter-PDF.

## Umsetzungsentscheidungen (vom Auftraggeber gewählt)

| Festlegung | Entscheidung | Default / Konfiguration |
|---|---|---|
| **Vorauszahlungen** | **IST** (tatsächlich geleistet) | NK-Anteil der echten Zahlungen, anteilig NK/(Kalt+NK). SOLL wird zur Transparenz mitgeführt. ⚠️ NK-Extraktion aus gebündelter Sollmiete |
| **Heizkosten-Split** | voll nach HeizkostenV, **einstellbar** | Verbrauchsanteil je Abrechnung/Position konfigurierbar im Korridor 50–70 %; Default **50 % Verbrauch / 50 % Grund** ⚠️ |
| **Personenzahl** | **zeitraum-genaues** Modell | `LeaseOccupancy` (validFrom/validTo, personCount) → Personen-Tage |
| **Proration** | **tagesgenau** | identische UTC-Tageslogik wie Phase 2 (`charge-rules`) |
| **Leerstand** | Vermieter trägt | Engine weist Leerstandsanteil `leaseId = null` zu |
| **Abrechnungszeitraum** | **Kalenderjahr** Default | konfigurierbar, ≤ 12 Monate (§ 556 Abs. 3) |
| **Schlüssel je Kategorie** | Phase-3-Mapping | Beleg-`allocationKey` > Kategorie-Default > Wohnfläche |

### Offene ⚠️-Punkte zur Freigabe

- **Default-Verbrauchsanteil 50 %** (untere zulässige Grenze) — bestätigen oder
  z. B. auf 70 % setzen.
- **NK-Anteil der Ist-Zahlungen** wird anteilig aus der gebündelten Sollmiete
  (aktuelle Lease-Konditionen) gerechnet — bestätigen.
- **Kostenzuordnung nach Leistungs-/Buchungsdatum** (`bookingDate`) im Zeitraum
  (nicht Kassenbasis) — bestätigen.
- **MITEIGENTUMSANTEIL**: mangels MEA-Stammdaten in v1 → Fallback Wohnfläche
  (mit Hinweis) — bestätigen/zurückstellen.
- **Personen-Schlüssel & Leerstand**: leerstehende Einheiten haben 0 Personen
  und tragen bei personenbezogenen Kosten keinen Anteil (kein fiktiver Ansatz) —
  bestätigen.
- **Vereinfachte Verbrauchserfassung**: Verbrauchswerte werden manuell je
  Einheit erfasst (keine Messdienstleister-Anbindung, out of scope). Fehlen
  Werte, trägt der Vermieter (Fallback) — bestätigen.

## Konsequenzen

- Reine, hochabgedeckte Engine (`statement-engine`, `heizkosten-rules`,
  `advance-reconciliation`) ohne DB; Summenkonsistenz (Σ Mieter + Vermieter =
  Gesamtkosten) in Tests abgesichert.
- Eine **finalisierte** Abrechnung ist unveränderlich (Snapshot der Positions-
  beträge); Audit-Log für create/run/finalize/delete/pdf.
- Rechtliche Konstanten leben in `*-rules.ts` mit Quellenkommentar und ⚠️.

## Quellen

- § 2 BetrKV — <https://www.gesetze-im-internet.de/betrkv/__2.html>
- § 556 BGB / § 556a BGB — <https://www.gesetze-im-internet.de/bgb/__556.html>,
  <https://www.gesetze-im-internet.de/bgb/__556a.html>
- §§ 7, 8, 12 HeizkostenV —
  <https://www.gesetze-im-internet.de/heizkostenv/__7.html>, `__8.html`, `__12.html`
- BGH 31.05.2006 – VIII ZR 159/05 (Leerstand trägt der Vermieter)
- BGH st. Rspr. zu den formellen Mindestanforderungen (§ 259 BGB)
