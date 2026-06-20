# ADR 0008 — Branch-Workflow: `main` als eindeutige Integrations-Spitze

- **Status:** akzeptiert
- **Datum:** 2026-06 (vor Phase 3)

## Kontext

Die ersten Phasen entstanden auf **gestapelten Feature-Branches** (jede Phase
brancht von der vorigen). Das funktionierte, solange streng linear gearbeitet
wurde, brach aber, als eine neue Session versehentlich von einer **Basis ohne
Phase 2** startete: die vollständige Spitze (Phase 0 + 1 + 2) lag nur noch auf
einem einzelnen Feature-Branch (`claude/pensive-noether-7wa9z0`), während
andere Branches Teilstände trugen. Welcher Branch „der aktuelle" ist, war nicht
mehr eindeutig.

Zudem existierte **kein dedizierter Integrations-Branch**; der von GitHub als
Default markierte Branch trug nur Phase 0 + 1.

## Entscheidung

Wir führen **`main` als einzigen, eindeutigen Integrations-Branch** ein.

- `main` wurde auf den vollständigen Stand gebracht (Phase 0 + 1 + 2, Commit
  `f26c55f`) und ist ab jetzt die **maßgebliche Spitze** des Projekts.
- **Workflow ab Phase 3:**
  1. Jede Phase **brancht von `main`** (frischer Branch pro Phase/Session).
  2. Entwicklung passiert auf dem Phasen-Branch; `main` bleibt währenddessen
     stabil.
  3. Nach bestandenem **Review-Gate** wird der Phasen-Branch in `main`
     integriert (Fast-Forward, wenn möglich; sonst regulärer Merge —
     **kein** Force, **kein** History-Rewrite auf `main`).
  4. Die **nächste Phase startet wieder von `main`**.
- Damit ist die vollständige Spitze **immer eindeutig `main`** — es gibt keine
  gestapelten Phasen-Branches mehr, deren Reihenfolge man kennen muss.

## Konsequenzen

- **Konsolidierung war nicht-destruktiv:** `main` wurde neu angelegt und zeigt
  auf den bereits existierenden vollständigen Commit. Es wurde nichts
  umgeschrieben und nichts gelöscht.
- Die **alten Feature-Branches bleiben als Backup** erhalten und werden nicht
  angetastet.
- **`claude/great-gates-68v4ux`** trägt einen einzelnen Commit, der nicht in der
  vollständigen Linie liegt (`fix: make AUTH_GITHUB_ID/SECRET optional for local
  dev`). Er ist **nicht** in `main` enthalten; falls dieser Fix gebraucht wird,
  muss er separat (z. B. via Cherry-Pick) übernommen werden.
- Der **GitHub-Default-Branch** sollte manuell auf `main` umgestellt werden,
  damit Tooling und PRs konsistent auf die Integrations-Spitze zeigen.
- **Regel:** Auf `main` wird nur über integrierte, review-geprüfte Phasen-
  Branches geschrieben — nie direkt mit großen Änderungen, nie mit Force.
