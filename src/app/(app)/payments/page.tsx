import Link from "next/link";
import { Plus, Upload } from "lucide-react";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import {
  DUNNING_LEVEL_LABELS,
  RENT_PAYMENT_STATUS_LABELS,
  STATUS_VARIANT,
  displayStatus,
  formatPeriod,
} from "~/features/rent-payments/labels";
import { GenerateChargesDialog } from "~/features/rent-payments/ui/generate-charges-dialog";
import { RunDunningButton } from "~/features/rent-payments/ui/run-dunning-button";
import { formatCents } from "~/lib/money";
import { formatDate } from "~/lib/date";
import { api } from "~/trpc/server";

type OpenItem = Awaited<ReturnType<typeof api.rentPayment.openItems>>[number];

function ItemsTable({ items }: { items: OpenItem[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Periode</TableHead>
          <TableHead>Objekt / Einheit</TableHead>
          <TableHead>Mieter</TableHead>
          <TableHead>Fällig</TableHead>
          <TableHead className="text-right">Soll</TableHead>
          <TableHead className="text-right">Offen</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((it) => {
          const status = displayStatus(it.status, it.overdue);
          return (
            <TableRow key={it.id}>
              <TableCell className="font-medium">
                <Link
                  href={`/payments/leases/${it.leaseId}`}
                  className="hover:underline"
                >
                  {formatPeriod(it.periodYear, it.periodMonth)}
                </Link>
              </TableCell>
              <TableCell>
                {it.propertyName} · {it.unitLabel}
              </TableCell>
              <TableCell>{it.tenants.join(", ") || "—"}</TableCell>
              <TableCell>
                {formatDate(it.dueDate)}
                {it.overdue && (
                  <span className="text-muted-foreground text-xs">
                    {" "}
                    ({it.daysOverdue} T)
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right">
                {formatCents(it.targetCents)}
              </TableCell>
              <TableCell className="text-right">
                {formatCents(it.remainingCents)}
              </TableCell>
              <TableCell className="space-x-1">
                <Badge variant={STATUS_VARIANT[status]}>
                  {RENT_PAYMENT_STATUS_LABELS[status]}
                </Badge>
                {it.latestDunningLevel && (
                  <Badge variant="outline">
                    {DUNNING_LEVEL_LABELS[it.latestDunningLevel]}
                  </Badge>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export default async function PaymentsPage() {
  const openItems = await api.rentPayment.openItems(undefined);
  const overdue = openItems.filter((i) => i.overdue);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Zahlungen</h1>
        <div className="flex flex-wrap items-center gap-2">
          <GenerateChargesDialog
            trigger={
              <Button>
                <Plus className="h-4 w-4" /> Sollstellung
              </Button>
            }
          />
          <RunDunningButton />
          <Button asChild variant="outline">
            <Link href="/payments/import">
              <Upload className="h-4 w-4" /> Kontoauszug importieren
            </Link>
          </Button>
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">
          Überfällige Posten ({overdue.length})
        </h2>
        {overdue.length === 0 ? (
          <p className="text-muted-foreground">Keine überfälligen Posten. 🎉</p>
        ) : (
          <ItemsTable items={overdue} />
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">
          Offene Posten ({openItems.length})
        </h2>
        {openItems.length === 0 ? (
          <p className="text-muted-foreground">
            Keine offenen Posten. Erzeuge die Sollstellung für den aktuellen
            Monat.
          </p>
        ) : (
          <ItemsTable items={openItems} />
        )}
      </section>
    </div>
  );
}
