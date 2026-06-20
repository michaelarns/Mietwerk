import Link from "next/link";
import { Plus } from "lucide-react";

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
import { STATEMENT_STATUS_LABELS } from "~/features/operating-cost-statement/labels";
import { CreateStatementDialog } from "~/features/operating-cost-statement/ui/create-statement-dialog";
import { formatDate } from "~/lib/date";
import { api } from "~/trpc/server";

export default async function StatementsPage() {
  const statements = await api.operatingCostStatement.list();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Betriebskostenabrechnungen</h1>
        <CreateStatementDialog
          trigger={
            <Button>
              <Plus className="h-4 w-4" /> Neue Abrechnung
            </Button>
          }
        />
      </div>

      {statements.length === 0 ? (
        <p className="text-muted-foreground">
          Noch keine Abrechnungen. Lege eine Abrechnung für ein Objekt und ein
          Jahr an.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Objekt</TableHead>
              <TableHead>Zeitraum</TableHead>
              <TableHead className="text-right">Positionen</TableHead>
              <TableHead className="text-right">Mieter</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {statements.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">
                  <Link href={`/statements/${s.id}`} className="hover:underline">
                    {s.property.name}
                  </Link>
                </TableCell>
                <TableCell>
                  {formatDate(s.periodStart)} – {formatDate(s.periodEnd)}
                </TableCell>
                <TableCell className="text-right">{s._count.lineItems}</TableCell>
                <TableCell className="text-right">{s._count.results}</TableCell>
                <TableCell>
                  <Badge variant={s.status === "DRAFT" ? "outline" : "default"}>
                    {STATEMENT_STATUS_LABELS[s.status]}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
