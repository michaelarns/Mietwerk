import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";

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
  DUNNING_LEVEL_LABELS,
  PAYMENT_METHOD_LABELS,
  RENT_PAYMENT_STATUS_LABELS,
  STATUS_VARIANT,
  displayStatus,
  formatPeriod,
} from "~/features/rent-payments/labels";
import { RecordPaymentDialog } from "~/features/rent-payments/ui/record-payment-dialog";
import { formatCents } from "~/lib/money";
import { formatDate } from "~/lib/date";
import { api } from "~/trpc/server";

export default async function LeasePaymentsPage({
  params,
}: {
  params: Promise<{ leaseId: string }>;
}) {
  const { leaseId } = await params;
  const { lease, rentPayments, payments, creditCents, dunnings } =
    await api.rentPayment.leaseOverview({ leaseId });

  const tenants = lease.leaseTenants
    .map((lt) => `${lt.tenant.firstName} ${lt.tenant.lastName}`.trim())
    .join(", ");
  const monthly = lease.baseRentCents + lease.operatingCostAdvanceCents;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/payments"
            className="text-muted-foreground text-sm hover:underline"
          >
            <ArrowLeft className="inline h-3 w-3" /> Zahlungen
          </Link>
          <h1 className="text-2xl font-bold">
            {lease.unit.property.name} · {lease.unit.label}
          </h1>
          <p className="text-muted-foreground text-sm">
            {tenants || "—"} · Soll {formatCents(monthly)}/Monat · seit{" "}
            {formatDate(lease.startDate)}
          </p>
        </div>
        <RecordPaymentDialog
          leaseId={lease.id}
          trigger={
            <Button>
              <Plus className="h-4 w-4" /> Zahlung erfassen
            </Button>
          }
        />
      </div>

      {creditCents > 0 && (
        <Card>
          <CardContent className="py-4">
            <span className="font-medium">Guthaben: </span>
            {formatCents(creditCents)}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Forderungen (Soll/Ist)</CardTitle>
        </CardHeader>
        <CardContent>
          {rentPayments.length === 0 ? (
            <p className="text-muted-foreground">Noch keine Sollstellungen.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Periode</TableHead>
                  <TableHead>Fällig</TableHead>
                  <TableHead className="text-right">Soll</TableHead>
                  <TableHead className="text-right">Bezahlt</TableHead>
                  <TableHead className="text-right">Offen</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rentPayments.map((rp) => {
                  const status = displayStatus(rp.status, rp.overdue);
                  return (
                    <TableRow key={rp.id}>
                      <TableCell className="font-medium">
                        {formatPeriod(rp.periodYear, rp.periodMonth)}
                      </TableCell>
                      <TableCell>{formatDate(rp.dueDate)}</TableCell>
                      <TableCell className="text-right">
                        {formatCents(rp.targetCents)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCents(rp.paidCents)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCents(rp.remainingCents)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[status]}>
                          {RENT_PAYMENT_STATUS_LABELS[status]}
                        </Badge>
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
          <CardTitle className="text-base">Zahlungshistorie</CardTitle>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <p className="text-muted-foreground">Noch keine Zahlungen erfasst.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Datum</TableHead>
                  <TableHead className="text-right">Betrag</TableHead>
                  <TableHead>Herkunft</TableHead>
                  <TableHead>Zugeordnet</TableHead>
                  <TableHead>Zweck</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{formatDate(p.valueDate)}</TableCell>
                    <TableCell className="text-right">
                      {formatCents(p.amountCents)}
                    </TableCell>
                    <TableCell>{PAYMENT_METHOD_LABELS[p.method]}</TableCell>
                    <TableCell>
                      {p.allocations
                        .map(
                          (a) =>
                            `${formatPeriod(
                              a.rentPayment.periodYear,
                              a.rentPayment.periodMonth,
                            )} (${formatCents(a.amountCents)})`,
                        )
                        .join(", ") || "Guthaben"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.reference ?? ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {dunnings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Mahnungen</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Stufe</TableHead>
                  <TableHead>Periode</TableHead>
                  <TableHead>Versandt</TableHead>
                  <TableHead className="text-right">Gebühr</TableHead>
                  <TableHead className="text-right">Zinsen</TableHead>
                  <TableHead>Empfänger</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dunnings.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>
                      <Badge variant="outline">
                        {DUNNING_LEVEL_LABELS[d.level]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {formatPeriod(
                        d.rentPayment.periodYear,
                        d.rentPayment.periodMonth,
                      )}
                    </TableCell>
                    <TableCell>
                      {d.sentAt ? formatDate(d.sentAt) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCents(d.feeCents)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCents(d.interestCents)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {d.recipient ?? d.channel}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
