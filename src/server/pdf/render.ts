import "server-only";

import { type DocumentProps, renderToBuffer } from "@react-pdf/renderer";
import { type ReactElement } from "react";

/**
 * Zentrale serverseitige PDF-Erzeugung (ADR 0003/0010). Rendert ein
 * `@react-pdf/renderer`-Dokument deterministisch zu einem Buffer — ohne
 * Headless-Browser. Jede PDF-Ausgabe des Produkts läuft über diese Funktion und
 * legt das Ergebnis anschließend über den Storage-Port ab.
 */
export function renderPdfToBuffer(
  document: ReactElement<DocumentProps>,
): Promise<Buffer> {
  return renderToBuffer(document);
}
