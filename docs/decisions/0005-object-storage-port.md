# ADR 0005 — Object Storage über einen Port mit austauschbaren Adaptern

- **Status:** akzeptiert
- **Datum:** 2026-06 (Phase 1)

## Kontext

Mietwerk speichert Dokumente und Fotos (Property/Unit, später Belege, Verträge).
Die Anwendung läuft in der Entwicklung vollständig lokal, in CI ohne externe
Dienste, und soll in Produktion gegen Cloudflare R2 (optional Azure Blob)
laufen. Wir brauchen eine einheitliche Schnittstelle, hinter der verschiedene
Backends andocken.

## Entscheidung

Ein **Storage-Port** (`src/server/storage/storage.port.ts`) mit den Operationen
`put`, `get`, `delete`, `getSignedUrl`. Zwei Adapter:

- **S3-Adapter** (`@aws-sdk/client-s3`) — Dev gegen **MinIO**, Prod gegen R2/Azure.
- **Local-FS-Adapter** — Fallback für **CI** und gesperrte Umgebungen.

Die Auswahl erfolgt über `STORAGE_DRIVER` (`s3` | `fs`) in der Factory
(`src/server/storage/index.ts`). Downloads werden grundsätzlich über eine
**authentifizierte App-Route** ausgeliefert (Mandanten-Prüfung über die
`Document`-Zeile); bei S3 leitet die Route auf eine **presigned URL** um, bei FS
streamt sie die Datei. Der FS-Adapter unterstützt bewusst keine signierten URLs
(`SignedUrlNotSupportedError`).

## Begründung

- **Austauschbarkeit:** R2/Azure/MinIO sind über Konfiguration tauschbar, kein
  Slice kennt das Backend.
- **Lokal & CI ohne Cloud:** Local-FS macht CI und gesperrte Umgebungen
  unabhängig von Netzwerk/Registry.
- **Sicherheit:** Der einheitliche Download-Pfad erzwingt die Mandantenprüfung an
  einer Stelle, statt Objekte öffentlich zu machen.

## Konsequenzen

- Upload/Download laufen über die App (kein direkter Browser→S3-Upload in Phase
  1). Direkte presigned Uploads können später ergänzt werden, ohne den Port zu
  ändern.
- Storage-Keys sind mandantenpräfixiert (`<organizationId>/<random>-<name>`).
- `.storage/` ist gitignored.
