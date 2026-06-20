# ADR 0009 — AfA, Werbungskosten & Anlage V (Phase 3, steuerliche Regeln)

- **Status:** akzeptiert (Defaults zur fachlichen Freigabe markiert)
- **Datum:** 2026-06 (Phase 3)
- **Betrifft Slices:** `costs-accounting`, `tax-afa`

## Kontext

Phase 3 führt die Buchhaltung ein: Belegerfassung/Kategorisierung
(`costs-accounting`) und AfA-Verwaltung (`tax-afa`), zusammengeführt zur
Anlage-V-Aufstellung je Objekt und Jahr. Das ist die steuerlich heikelste Phase.
Alle Sätze und Regeln wurden recherchiert (nicht aus dem Gedächtnis gesetzt), die
Quellen sind unten verlinkt. **Sämtliche Defaults sind konfigurierbar und als
Annahme zur fachlichen Freigabe markiert (⚠️).**

## Recherchierte Regeln (Stand 06/2026)

### 1. Lineare Gebäude-AfA — § 7 Abs. 4 EStG

Bemessung auf die Anschaffungs-/Herstellungskosten **des Gebäudes** (nicht Grund
und Boden). Satz nach Fertigstellung:

| Fertigstellung | Satz | Dauer |
|---|---|---|
| vor 1.1.1925 | **2,5 %** | 40 J. |
| 1.1.1925 – 31.12.2022 | **2,0 %** | 50 J. |
| Wohnzwecke, **nach 31.12.2022** | **3,0 %** | ~33⅓ J. |
| Wirtschaftsgebäude (Betriebsvermögen, Bauantrag nach 31.3.1985) | 3,0 % | — |

Eingeführt: 3 %-Satz durch JStG 2022 (ab 1.1.2023). § 7 Abs. 4 **Satz 2**: bei
kürzerer **tatsächlicher** Nutzungsdauer darf danach abgeschrieben werden.

### 2. Degressive AfA neue Wohngebäude — § 7 Abs. 5a EStG (Wachstumschancengesetz)

- **5 %** vom Restwert (fallende Jahresbeträge; 1. Jahr 5 % der Investitions-
  kosten, danach 5 % des jeweiligen Restwerts).
  ⚠️ **Achtung Gedächtnisfalle:** der Regierungsentwurf nannte 6 %, **final
  beschlossen sind 5 %** (Vermittlungsausschuss; Bundesrat 22.3.2024).
- Nur **Wohnzwecke / Neubau**. **Baubeginn 1.10.2023 – 30.9.2029** (maßgeblich:
  angezeigter Baubeginn, nicht Bauantrag).
- **Anschaffungsvariante:** obligatorischer Kaufvertrag im **Jahr der
  Fertigstellung** (Erwerb bis Jahresende), Vertrag im Förderzeitraum.
- **Wechsel zur linearen AfA** (§ 7 Abs. 4) jederzeit zulässig → ab Wechsel
  Restwert/Restnutzungsdauer.

### 3. Kürzere Restnutzungsdauer — § 7 Abs. 4 Satz 2 EStG

Nachweis per Gutachten. ⚠️ **Sehr aktuell:** das strenge **BMF-Schreiben vom
22.2.2023** (nur öffentlich bestellte/ISO-17024-Sachverständige; Verkehrswert-/
ImmoWertV-Restnutzungsdauern nicht ausreichend) wurde **mit BMF-Schreiben vom
1.12.2025 aufgehoben** → Rückkehr zur einzelfallbezogenen BFH-Auslegung,
geringere formelle Hürden, breiterer Kreis zulässiger Nachweise. → Im Tool: nur
**Hinweis**, ND/Satz frei konfigurierbar, Gutachten als Dokument verknüpfbar.

### 4. Bemessungsgrundlage

Nur **Gebäudeanteil** + **anteilige Anschaffungsnebenkosten** (Grunderwerbsteuer,
Notar, Grundbuch, Makler), aufgeteilt im Verhältnis Gebäude/Grund. Im Schema:
`DepreciationSchedule.baseCents`.

### 5. Anschaffungsnahe Herstellungskosten — § 6 Abs. 1 Nr. 1a EStG

Instandsetzung/Modernisierung **innerhalb 3 Jahren ab Anschaffung**, die **ohne
USt > 15 % der Gebäude-Anschaffungskosten** ausmacht → zwingend Herstellungs-
kosten (aktivieren → über AfA), kein Sofortabzug. Frist ab Übergang Besitz/Nutzen/
Lasten; **gebäudebezogen**. **Ausnahmen (Satz 2):** Erweiterungen (§ 255 Abs. 2
HGB) und **jährlich üblicherweise anfallende Erhaltungsarbeiten** (z. B. laufende
Heizungs-/Aufzugswartung) zählen **nicht** in die 15 %-Prüfung.
→ Mietwerk: pro Objekt im 3-Jahres-Fenster kumulieren (netto) und **warnen**,
wenn die Schwelle nahe/überschritten ist; Einordnung bleibt manuell.

### 6. Größerer Erhaltungsaufwand — § 82b EStDV

Wahlrecht: gleichmäßige Verteilung auf **2–5 Jahre**. Nur **Privatvermögen** und
**überwiegend Wohnzwecke**. Bei Verkauf/Wegfall der Einkünfteerzielung: Restbetrag
sofort im Ereignisjahr. → Default Sofortabzug, Verteilung optional je Aufwand.

### 7. Zufluss-/Abfluss-Prinzip — § 11 EStG

V+V = Überschusseinkünfte → **Kassenbasis**: Einnahmen im Jahr des Zuflusses
(Zahlungseingang), Ausgaben im Jahr des Abflusses (Zahlungsabfluss) — **nicht**
Soll-/Rechnungsdatum. **10-Tage-Regel** (§ 11 Abs. 1 S. 2 / Abs. 2 S. 2):
regelmäßig wiederkehrende Zahlungen (z. B. Miete) kurz (≤ 10 Tage) vor/nach
Jahreswechsel werden dem wirtschaftlich zugehörigen Jahr zugeordnet.
→ Mietwerk: Aggregation auf `Payment.valueDate` (Einnahmen) bzw.
`Transaction.paidDate` (Ausgaben). Die 10-Tage-Regel ist als markierte Annahme
zunächst **nicht** automatisch angewandt (Hinweis im UI); spätere Verfeinerung.

### 8. § 35a EStG

Steuerermäßigung nur für den **eigenen Haushalt**; **ausgeschlossen, soweit
Werbungskosten** (Abs. 5 S. 1). Bei **vermieteten** Objekten sind Handwerker-
leistungen i. d. R. **Werbungskosten → kein § 35a** für den Vermieter. → nur
Hinweis-Flag, niedrigste Priorität.

## Umsetzungsentscheidungen (vom Auftraggeber freigegeben)

- **AfA-Default:** Methode `LINEAR`; Satz automatisch aus Fertigstellungsdatum
  hergeleitet, **editierbar**. `DEGRESSIV`/`RESTNUTZUNGSDAUER` nur bewusste
  manuelle Wahl mit Plausibilitäts-/Eignungshinweis (u. a. Baubeginn-Förderzeitraum).
- **Erhaltungsaufwand:** Sofortabzug als Default, **§ 82b-Verteilung (2–5 J.)
  optional** je Aufwand.
- **15 %-Grenze:** kumulieren (netto) im 3-Jahres-Fenster + **warnen**.
- **Export:** **CSV** (UTF-8, Semikolon, deutsches Dezimalkomma); kein PDF in
  Phase 3.
- **Kategorien:** bestehendes `TransactionCategory`-Enum bleibt Erfassungs-Ebene;
  Erhaltung/Herstellung/anschaffungsnah über neues Feld `expenseType`. Mapping auf
  umlagefähig/Umlageschlüssel (BetrKV) und auf Anlage-V-Zeilen liegt **in Code**
  (`category-rules.ts`), nicht hartverdrahtet in der DB.

## Konsequenzen

- Alle Sätze/Schwellen/Fristen sind Konstanten in den `*-rules.ts`-Dateien mit
  Quellenkommentar und `⚠️`-Markierung; nichts ist im UI fest verdrahtet.
- Anlage-V-Zeilennummern variieren je Steuerjahr → als kommentierte Hinweise mit
  Jahresbezug hinterlegt, zur Verifikation markiert.
- Reine Rechenlogik (AfA, 15 %-Regel, § 82b-Verteilung, Anlage-V-Aggregation) ist
  ohne DB testbar und mit Unit-Tests abgedeckt.

## Quellen

- § 7 EStG — <https://www.gesetze-im-internet.de/estg/__7.html>
- Haufe, lineare Gebäude-AfA § 7 Abs. 4 EStG
- BMWSB / Haufe / IVD, degressive AfA § 7 Abs. 5a (Wachstumschancengesetz, 5 %)
- PKF Fasselt, Aufhebung BMF-Schreiben 22.2.2023 (durch BMF-Schreiben 1.12.2025)
- smartsteuer / Haufe / BFH IX R 22/15, anschaffungsnahe HK § 6 Abs. 1 Nr. 1a EStG
- dejure.org, § 82b EStDV
- Haufe / smartsteuer, Zufluss-Abfluss-Prinzip § 11 EStG (10-Tage-Regel)
- § 35a EStG — <https://www.gesetze-im-internet.de/estg/__35a.html>
