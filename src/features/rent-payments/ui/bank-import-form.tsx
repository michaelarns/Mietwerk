"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
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
import { formatCents } from "~/lib/money";
import { formatDate } from "~/lib/date";
import { api } from "~/trpc/react";

export function BankImportForm() {
  const router = useRouter();
  const [fileName, setFileName] = useState("");
  const [content, setContent] = useState("");
  const [choice, setChoice] = useState<Record<string, string>>({});

  const pending = api.rentPayment.pendingTransactions.useQuery();
  const leaseOptions = api.rentPayment.leaseOptions.useQuery();

  const importMut = api.rentPayment.importBankStatement.useMutation({
    onSuccess: (res) => {
      toast.success(
        `Import: ${res.created} neu, ${res.duplicates} Duplikate` +
          (res.skippedLines.length
            ? `, ${res.skippedLines.length} Zeilen übersprungen`
            : ""),
      );
      setFileName("");
      setContent("");
      void pending.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const confirmMut = api.rentPayment.confirmTransactions.useMutation({
    onSuccess: (res) => {
      const booked = res.filter((r) => r.status === "BOOKED").length;
      toast.success(`${booked} Umsätze verbucht.`);
      void pending.refetch();
      router.refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  const ignoreMut = api.rentPayment.ignoreTransaction.useMutation({
    onSuccess: () => {
      toast.success("Umsatz ignoriert.");
      void pending.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  async function onFile(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    setContent(await file.text());
  }

  const rows = pending.data ?? [];
  const leaseFor = (id: string, suggested: string | null) =>
    choice[id] ?? suggested ?? "";

  function bookOne(id: string, suggested: string | null) {
    const leaseId = leaseFor(id, suggested);
    if (!leaseId) {
      toast.error("Bitte ein Mietverhältnis wählen.");
      return;
    }
    confirmMut.mutate({ items: [{ bankTransactionId: id, leaseId }] });
  }

  function bookAll() {
    const items = rows
      .map((t) => ({
        bankTransactionId: t.id,
        leaseId: leaseFor(t.id, t.suggestedLeaseId),
      }))
      .filter((i) => i.leaseId);
    if (items.length === 0) {
      toast.error("Keine zuordenbaren Umsätze.");
      return;
    }
    confirmMut.mutate({ items });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label>Kontoauszug (CSV)</Label>
          <Input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
        </div>
        <Button
          disabled={!content || importMut.isPending}
          onClick={() => importMut.mutate({ fileName, content })}
        >
          {importMut.isPending ? "Importiere…" : "Importieren"}
        </Button>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          Offene Umsätze ({rows.length})
        </h2>
        {rows.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            disabled={confirmMut.isPending}
            onClick={bookAll}
          >
            Alle zugeordneten verbuchen
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground">
          Keine offenen Umsätze. Importiere einen Kontoauszug, um Zahlungen
          zuzuordnen.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Datum</TableHead>
              <TableHead>Zahler / Zweck</TableHead>
              <TableHead className="text-right">Betrag</TableHead>
              <TableHead>Mietverhältnis</TableHead>
              <TableHead className="text-right">Aktion</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((tx) => (
              <TableRow key={tx.id}>
                <TableCell>{formatDate(tx.bookingDate)}</TableCell>
                <TableCell>
                  <div className="font-medium">{tx.counterparty ?? "—"}</div>
                  <div className="text-muted-foreground text-xs">
                    {tx.reference ?? ""}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  {formatCents(tx.amountCents)}
                </TableCell>
                <TableCell>
                  <Select
                    value={leaseFor(tx.id, tx.suggestedLeaseId)}
                    onValueChange={(v) =>
                      setChoice((c) => ({ ...c, [tx.id]: v }))
                    }
                  >
                    <SelectTrigger className="w-[280px]">
                      <SelectValue placeholder="Mietverhältnis wählen" />
                    </SelectTrigger>
                    <SelectContent>
                      {(leaseOptions.data ?? []).map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.label}
                          {o.id === tx.suggestedLeaseId ? " (Vorschlag)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="space-x-2 text-right">
                  <Button
                    size="sm"
                    disabled={confirmMut.isPending || tx.amountCents <= 0}
                    onClick={() => bookOne(tx.id, tx.suggestedLeaseId)}
                  >
                    Verbuchen
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={ignoreMut.isPending}
                    onClick={() => ignoreMut.mutate({ id: tx.id })}
                  >
                    Ignorieren
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
