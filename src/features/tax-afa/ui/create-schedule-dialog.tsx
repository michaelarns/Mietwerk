"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { DepreciationMethod } from "../../../../generated/prisma";
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
import { centsToEuroInput, parseEuroInput } from "~/lib/money";
import { api } from "~/trpc/react";
import { DEPRECIATION_METHOD_LABELS } from "../labels";

export interface AfaSuggestion {
  method: DepreciationMethod;
  baseCents: number;
  ratePercent: number;
  usefulLifeYears: number;
  startYear: number;
  startMonth: number;
  basis: string;
  degressive: { eligible: boolean; reason: string; ratePercent: number };
}

export function CreateScheduleDialog({
  propertyId,
  suggestion,
  trigger,
}: {
  propertyId: string;
  suggestion: AfaSuggestion;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<DepreciationMethod>(suggestion.method);
  const [base, setBase] = useState(centsToEuroInput(suggestion.baseCents));
  const [ratePercent, setRatePercent] = useState(String(suggestion.ratePercent));
  const [usefulLifeYears, setUsefulLifeYears] = useState(
    String(suggestion.usefulLifeYears),
  );
  const [startYear, setStartYear] = useState(suggestion.startYear);
  const [startMonth, setStartMonth] = useState(suggestion.startMonth);
  const [note, setNote] = useState("");

  const create = api.taxAfa.create.useMutation({
    onSuccess: () => {
      toast.success("AfA-Plan angelegt.");
      setOpen(false);
      setNote("");
      router.refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  function applySuggestion() {
    setMethod(suggestion.method);
    setBase(centsToEuroInput(suggestion.baseCents));
    setRatePercent(String(suggestion.ratePercent));
    setUsefulLifeYears(String(suggestion.usefulLifeYears));
    setStartYear(suggestion.startYear);
    setStartMonth(suggestion.startMonth);
    toast.success("Vorschlag übernommen.");
  }

  function submit() {
    const baseCents = parseEuroInput(base);
    if (!baseCents || baseCents <= 0) {
      toast.error("Bitte eine gültige Bemessungsgrundlage (> 0) eingeben.");
      return;
    }
    const isRnd = method === DepreciationMethod.RESTNUTZUNGSDAUER;
    const life = Number(usefulLifeYears);
    if (isRnd && (!Number.isFinite(life) || life <= 0)) {
      toast.error("Restnutzungsdauer (Jahre) ist erforderlich.");
      return;
    }
    const rate = Number(ratePercent);
    create.mutate({
      propertyId,
      method,
      baseCents,
      ratePercent: isRnd || !Number.isFinite(rate) || rate <= 0 ? null : rate,
      usefulLifeYears: isRnd ? life : null,
      startYear,
      startMonth,
      note: note || null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>AfA-Plan anlegen</DialogTitle>
        </DialogHeader>

        <div className="bg-muted/50 flex flex-col gap-1 rounded-md p-3 text-sm">
          <p>
            <span className="font-medium">Vorschlag:</span> {suggestion.basis}
          </p>
          <p className="text-muted-foreground">
            Degressive AfA (§ 7 Abs. 5a):{" "}
            {suggestion.degressive.eligible ? "möglich" : "nicht erkennbar"} —{" "}
            {suggestion.degressive.reason}
          </p>
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={applySuggestion}
            >
              Vorschlag übernehmen
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="afa-method">Methode</Label>
            <Select
              value={method}
              onValueChange={(v) => setMethod(v as DepreciationMethod)}
            >
              <SelectTrigger id="afa-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(DEPRECIATION_METHOD_LABELS).map(
                  ([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="afa-base">Bemessungsgrundlage € (Gebäudeanteil)</Label>
            <Input
              id="afa-base"
              inputMode="decimal"
              value={base}
              onChange={(e) => setBase(e.target.value)}
            />
          </div>

          {method === DepreciationMethod.RESTNUTZUNGSDAUER ? (
            <div className="flex flex-col gap-1">
              <Label htmlFor="afa-life">Restnutzungsdauer (Jahre)</Label>
              <Input
                id="afa-life"
                type="number"
                min={1}
                value={usefulLifeYears}
                onChange={(e) => setUsefulLifeYears(e.target.value)}
              />
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <Label htmlFor="afa-rate">AfA-Satz (% pro Jahr)</Label>
              <Input
                id="afa-rate"
                inputMode="decimal"
                value={ratePercent}
                onChange={(e) => setRatePercent(e.target.value)}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="afa-start-year">Beginn (Jahr)</Label>
              <Input
                id="afa-start-year"
                type="number"
                value={startYear}
                onChange={(e) => setStartYear(Number(e.target.value))}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="afa-start-month">Beginn (Monat)</Label>
              <Input
                id="afa-start-month"
                type="number"
                min={1}
                max={12}
                value={startMonth}
                onChange={(e) => setStartMonth(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="afa-note">Notiz (optional)</Label>
            <Input
              id="afa-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button disabled={create.isPending} onClick={submit}>
            {create.isPending ? "Speichern…" : "Plan anlegen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
