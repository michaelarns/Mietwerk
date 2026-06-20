import { Plus } from "lucide-react";

import { type TransactionCategory } from "../../../../generated/prisma";
import { Badge } from "~/components/ui/badge";
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
import {
  ANSCHAFFUNGSNAH_STATUS_LABELS,
  ANSCHAFFUNGSNAH_STATUS_VARIANT,
  CATEGORY_LABELS,
  EXPENSE_TYPE_LABELS,
} from "~/features/costs-accounting/labels";
import { CostFilters } from "~/features/costs-accounting/ui/cost-filters";
import { CostsCsvButton } from "~/features/costs-accounting/ui/costs-csv-button";
import { RecordCostDialog } from "~/features/costs-accounting/ui/record-cost-dialog";
import { formatCents } from "~/lib/money";
import { formatDate } from "~/lib/date";
import { api } from "~/trpc/server";

export default async function CostsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const propertyOptions = await api.cost.propertyOptions();

  const rawProperty = typeof sp.propertyId === "string" ? sp.propertyId : undefined;
  const propertyId = propertyOptions.find((p) => p.id === rawProperty)?.id;

  const rawCategory = typeof sp.category === "string" ? sp.category : undefined;
  const category =
    rawCategory && rawCategory in CATEGORY_LABELS
      ? (rawCategory as TransactionCategory)
      : undefined;

  const rawYear = typeof sp.year === "string" ? Number(sp.year) : NaN;
  const year =
    Number.isInteger(rawYear) && rawYear >= 2000 && rawYear <= 2100
      ? rawYear
      : undefined;

  const filter = { propertyId, year, category };
  const transactions = await api.cost.list(filter);
  const anschaffungsnah = propertyId
    ? await api.cost.anschaffungsnah({ propertyId })
    : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Kosten & Belege</h1>
        <div className="flex flex-wrap items-center gap-2">
          <RecordCostDialog
            propertyOptions={propertyOptions}
            defaultPropertyId={propertyId}
            trigger={
              <Button>
                <Plus className="h-4 w-4" /> Beleg erfassen
              </Button>
            }
          />
          <CostsCsvButton
            propertyId={propertyId}
            year={year}
            category={category}
          />
        </div>
      </div>

      <CostFilters
        propertyOptions={propertyOptions}
        propertyId={propertyId}
        year={year}
        category={category}
      />

      {anschaffungsnah && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Anschaffungsnahe Herstellungskosten (15 %-Regel)
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {anschaffungsnah.applicable ? (
              <div className="flex flex-col gap-2">
                <div>
                  <Badge
                    variant={
                      ANSCHAFFUNGSNAH_STATUS_VARIANT[anschaffungsnah.status]
                    }
                  >
                    {ANSCHAFFUNGSNAH_STATUS_LABELS[anschaffungsnah.status]}
                  </Badge>
                </div>
                <p>
                  Kumuliert im 3-Jahres-Fenster (
                  {formatDate(anschaffungsnah.windowStart)} –{" "}
                  {formatDate(anschaffungsnah.windowEnd)}):{" "}
                  <span className="font-medium">
                    {formatCents(anschaffungsnah.cumulativeNetCents)}
                  </span>{" "}
                  von {formatCents(anschaffungsnah.thresholdCents)} (netto).
                </p>
                {anschaffungsnah.status === "UEBERSCHRITTEN" ? (
                  <p className="text-destructive">
                    Schwelle um{" "}
                    {formatCents(Math.abs(anschaffungsnah.remainingCents))}{" "}
                    überschritten — die Aufwendungen sind als Herstellungskosten
                    über die AfA abzuschreiben (§ 6 Abs. 1 Nr. 1a EStG), nicht
                    sofort abziehbar.
                  </p>
                ) : (
                  <p className="text-muted-foreground">
                    Verbleibender Spielraum:{" "}
                    {formatCents(anschaffungsnah.remainingCents)}.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground">{anschaffungsnah.reason}</p>
            )}
          </CardContent>
        </Card>
      )}

      {transactions.length === 0 ? (
        <p className="text-muted-foreground">
          Keine Kostenpositionen{propertyId || year || category ? " für diesen Filter" : ""}.
          Erfasse deinen ersten Beleg.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Belegdatum</TableHead>
              <TableHead>Objekt / Einheit</TableHead>
              <TableHead>Kategorie</TableHead>
              <TableHead>Beschreibung</TableHead>
              <TableHead>Behandlung</TableHead>
              <TableHead className="text-right">Betrag</TableHead>
              <TableHead>Umlage</TableHead>
              <TableHead className="text-right">Belege</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.map((t) => (
              <TableRow key={t.id}>
                <TableCell>{formatDate(t.bookingDate)}</TableCell>
                <TableCell>
                  {t.property?.name ?? "—"}
                  {t.unit ? ` · ${t.unit.label}` : ""}
                </TableCell>
                <TableCell>{CATEGORY_LABELS[t.category]}</TableCell>
                <TableCell className="max-w-[220px] truncate">
                  {t.description ?? ""}
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {EXPENSE_TYPE_LABELS[t.expenseType]}
                </TableCell>
                <TableCell className="text-right">
                  {formatCents(t.amountCents)}
                </TableCell>
                <TableCell>
                  {t.isAllocatable ? (
                    <Badge variant="secondary">umlagefähig</Badge>
                  ) : (
                    <span className="text-muted-foreground">–</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {t._count.documents > 0 ? t._count.documents : "–"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
