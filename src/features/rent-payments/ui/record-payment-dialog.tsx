"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { centsToEuroInput, formatCents, parseEuroInput } from "~/lib/money";
import { api } from "~/trpc/react";

export function RecordPaymentDialog({
  leaseId,
  trigger,
  defaultAmountCents,
}: {
  leaseId: string;
  trigger: React.ReactNode;
  defaultAmountCents?: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(centsToEuroInput(defaultAmountCents));
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");

  const record = api.rentPayment.recordPayment.useMutation({
    onSuccess: (res) => {
      toast.success(
        res.creditCents > 0
          ? `Zahlung erfasst. Guthaben: ${formatCents(res.creditCents)}`
          : "Zahlung erfasst und zugeordnet.",
      );
      setOpen(false);
      setReference("");
      router.refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  function submit() {
    const cents = parseEuroInput(amount);
    if (!cents || cents <= 0) {
      toast.error("Bitte einen gültigen Betrag eingeben.");
      return;
    }
    record.mutate({
      leaseId,
      amountCents: cents,
      valueDate: new Date(`${date}T00:00:00.000Z`),
      reference: reference || undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Zahlung erfassen</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="pay-amount">Betrag €</Label>
            <Input
              id="pay-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="pay-date">Wertstellung</Label>
            <Input
              id="pay-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="pay-reference">Verwendungszweck (optional)</Label>
          <Input
            id="pay-reference"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </div>
        <p className="text-muted-foreground text-sm">
          Der Betrag wird automatisch den ältesten offenen Forderungen zugeordnet
          (FIFO). Ein Überschuss wird als Guthaben gehalten.
        </p>
        <DialogFooter>
          <Button disabled={record.isPending} onClick={submit}>
            {record.isPending ? "Speichern…" : "Zahlung buchen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
