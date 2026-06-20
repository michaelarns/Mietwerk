import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";

import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { AnlageVPanel } from "~/features/costs-accounting/ui/anlage-v-panel";
import { DEPRECIATION_METHOD_LABELS } from "~/features/tax-afa/labels";
import { CreateScheduleDialog } from "~/features/tax-afa/ui/create-schedule-dialog";
import { DeleteScheduleButton } from "~/features/tax-afa/ui/delete-schedule-button";
import { formatCents } from "~/lib/money";
import { api } from "~/trpc/server";

export default async function TaxPropertyPage({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  const { propertyId } = await params;
  const properties = await api.cost.propertyOptions();
  const property = properties.find((p) => p.id === propertyId);

  if (!property) {
    return (
      <div className="flex flex-col gap-4">
        <Link href="/tax" className="text-muted-foreground text-sm hover:underline">
          <ArrowLeft className="inline h-3 w-3" /> Steuer & AfA
        </Link>
        <p className="text-muted-foreground">Objekt nicht gefunden.</p>
      </div>
    );
  }

  const [schedules, suggestion] = await Promise.all([
    api.taxAfa.listForProperty({ propertyId }),
    api.taxAfa.suggest({ propertyId }),
  ]);

  const currentYear = new Date().getUTCFullYear();
  const defaultYear = currentYear - 1;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/tax"
          className="text-muted-foreground text-sm hover:underline"
        >
          <ArrowLeft className="inline h-3 w-3" /> Steuer & AfA
        </Link>
        <h1 className="text-2xl font-bold">{property.name}</h1>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">AfA-Pläne</CardTitle>
          <CreateScheduleDialog
            propertyId={propertyId}
            suggestion={suggestion}
            trigger={
              <Button size="sm">
                <Plus className="h-4 w-4" /> AfA-Plan anlegen
              </Button>
            }
          />
        </CardHeader>
        <CardContent>
          {schedules.length === 0 ? (
            <p className="text-muted-foreground">
              Noch kein AfA-Plan. Lege einen Plan an — der Vorschlag leitet Satz
              und Bemessungsgrundlage aus den Objekt-Stammdaten her.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Methode</TableHead>
                  <TableHead className="text-right">Bemessungsgrundlage</TableHead>
                  <TableHead className="text-right">Satz</TableHead>
                  <TableHead>Beginn</TableHead>
                  <TableHead className="text-right">Laufzeit</TableHead>
                  <TableHead className="text-right">AfA {defaultYear}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedules.map((s) => {
                  const yearAmount =
                    s.entries.find((e) => e.year === defaultYear)?.amountCents ??
                    0;
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">
                        {DEPRECIATION_METHOD_LABELS[s.method]}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCents(s.baseCents)}
                      </TableCell>
                      <TableCell className="text-right">
                        {s.ratePercent.toLocaleString("de-DE", {
                          maximumFractionDigits: 2,
                        })}{" "}
                        %
                      </TableCell>
                      <TableCell>
                        {String(s.startMonth).padStart(2, "0")}/{s.startYear}
                      </TableCell>
                      <TableCell className="text-right">
                        {s.entries.length} J.
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCents(yearAmount)}
                      </TableCell>
                      <TableCell className="text-right">
                        <DeleteScheduleButton id={s.id} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Anlage-V-Vorschau</CardTitle>
        </CardHeader>
        <CardContent>
          <AnlageVPanel propertyId={propertyId} defaultYear={defaultYear} />
        </CardContent>
      </Card>
    </div>
  );
}
