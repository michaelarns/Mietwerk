# ADR 0003 — PDF-Generierung

- **Status:** vorgeschlagen (umzusetzen in Phase 3/4)
- **Datum:** 2026-06 (Phase 0)

## Kontext

Mietwerk muss serverseitig PDFs erzeugen: Betriebskostenabrechnung je Mieter
(Phase 4, fachliches Herzstück), Mietvertrag (Phase 1/3), Mahnungen (Phase 2)
und Steuer-Exporte (Phase 3). Anforderungen: deterministisches Layout,
gut testbar, ohne schweren Headless-Browser im Hosting.

## Entscheidung

**`@react-pdf/renderer`** für die PDF-Erzeugung.

## Begründung

- **Deklarativ in React/TSX:** Layout-Komponenten sind testbar und passen zum
  bestehenden React/TypeScript-Stack; kein Kontextwechsel.
- **Kein Headless-Browser:** rendert ohne Chromium — geringerer Ressourcen- und
  Betriebsaufwand als Puppeteer/Playwright-PDF, gut für serverless/kleine Worker.
- **Deterministisch:** stabileres, reproduzierbares Layout als HTML→PDF über
  einen Browser; wichtig für rechtlich relevante Abrechnungs-Dokumente.

## Alternativen

- **Puppeteer / Playwright (HTML→PDF):** maximale CSS-Treue, aber schwergewichtig
  (Chromium), höhere Kosten und komplexeres Deployment. Rückfalloption, falls
  sehr komplexe Layouts nötig werden.
- **pdfkit:** imperativ und flexibel, aber mehr Boilerplate und schlechter
  wartbar für komplexe, tabellarische Abrechnungen.

## Konsequenzen

- PDF-Templates leben im jeweiligen Slice (z. B.
  `features/operating-cost-statement/pdf/`).
- Sehr aufwändige CSS-Layouts sind eingeschränkt; bei Bedarf gezielt einzelne
  Dokumente per Puppeteer rendern.
- Entscheidung vor Phase 4 final bestätigen (Prototyp einer Abrechnung).
