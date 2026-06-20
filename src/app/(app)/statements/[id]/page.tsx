import Link from "next/link";
import { notFound } from "next/navigation";
import { TRPCError } from "@trpc/server";

import { Badge } from "~/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import {
  ADVANCE_BASIS_LABELS,
  ALLOCATION_KEY_LABELS,
  STATEMENT_STATUS_LABELS,
  balanceLabel,
} from "~/features/operating-cost-statement/labels";
import { ConsumptionEditor } from "~/features/operating-cost-statement/ui/consumption-editor";
import { GeneratePdfButton } from "~/features/operating-cost-statement/ui/generate-pdf-button";
import { StatementActions } from "~/features/operating-cost-statement/ui/statement-actions";
import { formatCents } from "~/lib/money";
import { formatDate } from "~/lib/date";
import { api } from "~/trpc/server";

export default async function StatementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let detail: Awaited<ReturnType<typeof api.operatingCostStatement.byId>>;
  try {
    detail = await api.operatingCostStatement.byId({ statementId: id });
  } catch (e) {
    if (e instanceof TRPCError && e.code === "NOT_FOUND") notFound();
    throw e;
  }

  const { statement, units, results } = detail;
  const isDraft = statement.status === "DRAFT";

  const landlordOf = (shares: { leaseId: string | null; shareCents: number }[]) =>
    shares.filter((s) => s.leaseId === null).reduce((a, s) => a + s.shareCents, 0);

  const totalCosts = statement.lineItems.reduce((a, i) => a + i.totalCents, 0);
  const totalLandlord = statement.lineItems.reduce(
    (a, i) => a + landlordOf(i.shares),
    0,
  );

  const consumptionItems = statement.lineItems
    .filter((i) => i.allocationKey === "VERBRAUCH" || i.consumptionSplit)
    .map((i) => ({ id: i.id, label: i.label }));
  const initialConsumption: Record<string, Record<string, number>> = {};
  for (const c of statement.consumptions) {
    initialConsumption[c.itemId] = {
      ...(initialConsumption[c.itemId] ?? {}),
      [c.unitId]: c.value,
    };
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/statements" className="text-muted-foreground text-sm hover:underline">
            ← Abrechnungen
          </Link>
          <h1 className="text-2xl font-bold">
            {statement.title ?? `Betriebskostenabrechnung ${statement.periodYear}`}
          </h1>
          <p className="text-muted-foreground">
            {statement.property.name} · {formatDate(statement.periodStart)} –{" "}
            {formatDate(statement.periodEnd)}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Badge variant={isDraft ? "outline" : "default"}>
              {STATEMENT_STATUS_LABELS[statement.status]}
            </Badge>
            <span className="text-muted-foreground text-sm">
              Vorauszahlung: {ADVANCE_BASIS_LABELS[statement.advanceBasis]}
            </span>
          </div>
        </div>
        <StatementActions statementId={statement.id} status={statement.status} />
      </div>

      {/* Gesamtkosten & Verteilerschlüssel */}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Kosten & Verteilerschlüssel</h2>
        {statement.lineItems.length === 0 ? (
          <p className="text-muted-foreground">
            Keine umlagefähigen Positionen im Zeitraum gefunden. Erfasse Belege
            (umlagefähig) in der Buchhaltung.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Position</TableHead>
                <TableHead>Schlüssel</TableHead>
                <TableHead className="text-right">Gesamtkosten</TableHead>
                <TableHead className="text-right">davon Vermieter/Leerstand</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {statement.lineItems.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="font-medium">{i.label}</TableCell>
                  <TableCell>
                    {i.consumptionSplit
                      ? "Verbrauch + Fläche (HeizkostenV)"
                      : ALLOCATION_KEY_LABELS[i.allocationKey]}
                  </TableCell>
                  <TableCell className="text-right">{formatCents(i.totalCents)}</TableCell>
                  <TableCell className="text-right">
                    {formatCents(landlordOf(i.shares))}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell className="font-semibold">Summe</TableCell>
                <TableCell />
                <TableCell className="text-right font-semibold">
                  {formatCents(totalCosts)}
                </TableCell>
                <TableCell className="text-right font-semibold">
                  {formatCents(totalLandlord)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        )}
      </section>

      {/* Verbrauchserfassung (nur Entwurf) */}
      {isDraft && consumptionItems.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Verbrauchswerte</h2>
          <ConsumptionEditor
            statementId={statement.id}
            items={consumptionItems}
            units={units.map((u) => ({ id: u.id, label: u.label }))}
            initial={initialConsumption}
          />
        </section>
      )}

      {/* Ergebnis je Mieter */}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Ergebnis je Mieter</h2>
        {results.length === 0 ? (
          <p className="text-muted-foreground">
            Keine Mieter im Zeitraum. Rechne die Abrechnung neu, sobald
            Mietverhältnisse erfasst sind.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Einheit</TableHead>
                <TableHead>Mieter</TableHead>
                <TableHead className="text-right">Umgelegt</TableHead>
                <TableHead className="text-right">Vorauszahlung</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead className="text-right">PDF</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map((r) => (
                <TableRow key={r.leaseId}>
                  <TableCell className="font-medium">{r.unitLabel}</TableCell>
                  <TableCell>{r.tenantNames}</TableCell>
                  <TableCell className="text-right">
                    {formatCents(r.allocatedCents)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCents(r.advanceCents)}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="font-semibold">
                      {formatCents(Math.abs(r.balanceCents))}
                    </span>{" "}
                    <span className="text-muted-foreground text-xs">
                      {balanceLabel(r.balanceCents)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <GeneratePdfButton statementId={statement.id} leaseId={r.leaseId} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <p className="text-muted-foreground text-xs">
        Hinweis: Die Abrechnung ist dem Mieter bis zum Ablauf des 12. Monats nach
        Ende des Abrechnungszeitraums mitzuteilen (§ 556 Abs. 3 BGB). Auf
        leerstehende Einheiten entfallende Kosten trägt der Vermieter (BGH
        VIII ZR 159/05).
      </p>
    </div>
  );
}
