"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";

import { type TransactionCategory } from "../../../../generated/prisma";
import { Button } from "~/components/ui/button";
import { downloadTextFile } from "~/lib/browser-download";
import { api } from "~/trpc/react";

/** Lädt das Belegjournal (gefilterte Kostenliste) als CSV für den Steuerberater. */
export function CostsCsvButton({
  propertyId,
  year,
  category,
}: {
  propertyId?: string;
  year?: number;
  category?: TransactionCategory;
}) {
  const utils = api.useUtils();
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const filter =
        propertyId || year || category
          ? { propertyId, year, category }
          : undefined;
      const csv = await utils.cost.exportCostsCsv.fetch(filter);
      downloadTextFile(csv.fileName, csv.content);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="outline" disabled={busy} onClick={() => void download()}>
      <Download className="h-4 w-4" /> {busy ? "Exportiere…" : "CSV-Export"}
    </Button>
  );
}
