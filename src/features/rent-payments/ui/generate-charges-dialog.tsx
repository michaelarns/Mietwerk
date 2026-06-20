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
import { api } from "~/trpc/react";

export function GenerateChargesDialog({ trigger }: { trigger: React.ReactNode }) {
  const router = useRouter();
  const now = new Date();
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(now.getUTCFullYear());
  const [month, setMonth] = useState(now.getUTCMonth() + 1);

  const generate = api.rentPayment.generateCharges.useMutation({
    onSuccess: (res) => {
      toast.success(
        `Sollstellung: ${res.created} neu, ${res.alreadyExisted} bereits vorhanden.`,
      );
      setOpen(false);
      router.refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sollstellung erzeugen</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="charge-year">Jahr</Label>
            <Input
              id="charge-year"
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="charge-month">Monat</Label>
            <Input
              id="charge-month"
              type="number"
              min={1}
              max={12}
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
            />
          </div>
        </div>
        <p className="text-muted-foreground text-sm">
          Erzeugt fehlende Mietforderungen (Kaltmiete + NK-Vorauszahlung) für alle
          im Monat aktiven Mietverhältnisse. Mehrfaches Ausführen ist
          unbedenklich (idempotent).
        </p>
        <DialogFooter>
          <Button
            disabled={generate.isPending}
            onClick={() =>
              generate.mutate({ periodYear: year, periodMonth: month })
            }
          >
            {generate.isPending ? "Erzeuge…" : "Erzeugen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
