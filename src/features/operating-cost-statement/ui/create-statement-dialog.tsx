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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { api } from "~/trpc/react";

export function CreateStatementDialog({ trigger }: { trigger: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [propertyId, setPropertyId] = useState<string>("");
  const [year, setYear] = useState(new Date().getUTCFullYear() - 1);

  const properties = api.operatingCostStatement.propertyOptions.useQuery(
    undefined,
    { enabled: open },
  );

  const create = api.operatingCostStatement.create.useMutation({
    onSuccess: (res) => {
      toast.success("Abrechnung angelegt und berechnet.");
      setOpen(false);
      router.push(`/statements/${res.id}`);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Neue Betriebskostenabrechnung</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label>Objekt</Label>
            <Select value={propertyId} onValueChange={setPropertyId}>
              <SelectTrigger>
                <SelectValue placeholder="Objekt wählen" />
              </SelectTrigger>
              <SelectContent>
                {(properties.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="stmt-year">Abrechnungsjahr</Label>
            <Input
              id="stmt-year"
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </div>
          <p className="text-muted-foreground text-sm">
            Default ist das Kalenderjahr (höchstens 12 Monate, § 556 Abs. 3 BGB).
            Die Positionen werden aus den umlagefähigen Belegen des Objekts im
            Zeitraum vorbefüllt.
          </p>
        </div>
        <DialogFooter>
          <Button
            disabled={!propertyId || create.isPending}
            onClick={() => create.mutate({ propertyId, periodYear: year })}
          >
            {create.isPending ? "Wird angelegt…" : "Anlegen & berechnen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
