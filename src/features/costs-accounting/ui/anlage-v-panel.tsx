"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { downloadTextFile } from "~/lib/browser-download";
import { formatCents } from "~/lib/money";
import { api } from "~/trpc/react";
import { type AnlageVGroup } from "../category-rules";
import { ANLAGE_V_GROUP_LABELS } from "../labels";

/** Anzeigereihenfolge der Werbungskosten-Gruppen (analog CSV-Export). */
const WK_ORDER: AnlageVGroup[] = [
  "AFA",
  "SCHULDZINSEN",
  "ERHALTUNGSAUFWAND",
  "LAUFENDE_BETRIEBSKOSTEN",
  "VERWALTUNGSKOSTEN",
  "SONSTIGE_WERBUNGSKOSTEN",
];

export function AnlageVPanel({
  propertyId,
  defaultYear,
}: {
  propertyId: string;
  defaultYear: number;
}) {
  const utils = api.useUtils();
  const [year, setYear] = useState(defaultYear);
  const [busy, setBusy] = useState(false);

  const years = Array.from({ length: 7 }, (_, i) => defaultYear + 1 - i);
  const anlageV = api.cost.anlageV.useQuery({ propertyId, year });

  async function downloadCsv() {
    setBusy(true);
    try {
      const csv = await utils.cost.exportAnlageVCsv.fetch({ propertyId, year });
      downloadTextFile(csv.fileName, csv.content);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  const result = anlageV.data?.result;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium" htmlFor="anlagev-year">
            Veranlagungsjahr
          </label>
          <Select
            value={String(year)}
            onValueChange={(v) => setYear(Number(v))}
          >
            <SelectTrigger id="anlagev-year" className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="outline"
          disabled={busy || !result}
          onClick={() => void downloadCsv()}
        >
          <Download className="h-4 w-4" /> {busy ? "Exportiere…" : "CSV-Export"}
        </Button>
      </div>

      {anlageV.isLoading || !result ? (
        <p className="text-muted-foreground text-sm">Lädt Aufstellung…</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Position</TableHead>
              <TableHead className="text-right">Betrag</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-medium">
                Einnahmen (Zufluss)
              </TableCell>
              <TableCell className="text-right font-medium">
                {formatCents(result.einnahmenCents)}
              </TableCell>
            </TableRow>
            {WK_ORDER.map((g) => (
              <TableRow key={g}>
                <TableCell className="text-muted-foreground pl-6">
                  {ANLAGE_V_GROUP_LABELS[g]}
                </TableCell>
                <TableCell className="text-right">
                  − {formatCents(result.groups[g])}
                </TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell className="font-medium">
                Summe Werbungskosten
              </TableCell>
              <TableCell className="text-right font-medium">
                − {formatCents(result.werbungskostenCents)}
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-semibold">
                {result.isUeberschuss ? "Überschuss" : "Verlust"}
              </TableCell>
              <TableCell
                className={`text-right font-semibold ${
                  result.isUeberschuss ? "" : "text-destructive"
                }`}
              >
                {formatCents(result.ergebnisCents)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      )}
      <p className="text-muted-foreground text-xs">
        Kassenbasis (§ 11 EStG): Einnahmen aus Zahlungseingängen, Ausgaben aus dem
        Zahlungsabfluss. Die 10-Tage-Regel wird nicht automatisch angewandt.
        Anlage-V-Zeilennummern variieren je Steuerjahr.
      </p>
    </div>
  );
}
