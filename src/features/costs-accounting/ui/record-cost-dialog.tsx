"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  type AllocationKey,
  ExpenseType,
  TransactionCategory,
} from "../../../../generated/prisma";
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
import { parseEuroInput } from "~/lib/money";
import { api } from "~/trpc/react";
import {
  ALLOCATION_KEY_LABELS,
  CATEGORY_LABELS,
  EXPENSE_TYPE_LABELS,
} from "../labels";

const NONE = "NONE";

export function RecordCostDialog({
  propertyOptions,
  defaultPropertyId,
  trigger,
}: {
  propertyOptions: { id: string; name: string }[];
  defaultPropertyId?: string;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const utils = api.useUtils();
  const fileRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [propertyId, setPropertyId] = useState(defaultPropertyId ?? NONE);
  const [bookingDate, setBookingDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [paidDate, setPaidDate] = useState("");
  const [category, setCategory] = useState<TransactionCategory>(
    TransactionCategory.SONSTIGE,
  );
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [netAmount, setNetAmount] = useState("");
  const [isAllocatable, setIsAllocatable] = useState(false);
  const [allocationKey, setAllocationKey] = useState<string>(NONE);
  const [expenseType, setExpenseType] = useState<ExpenseType>(
    ExpenseType.SOFORTABZUG,
  );
  const [isAfaRelevant, setIsAfaRelevant] = useState(false);
  const [isLaborCost35a, setIsLaborCost35a] = useState(false);
  const [distributionYears, setDistributionYears] = useState(3);
  const [distributionStartYear, setDistributionStartYear] = useState(
    new Date().getUTCFullYear(),
  );
  const [uploading, setUploading] = useState(false);

  const create = api.cost.create.useMutation({
    onSuccess: async (res) => {
      const file = fileRef.current?.files?.[0];
      if (file) {
        setUploading(true);
        try {
          const fd = new FormData();
          fd.append("file", file);
          fd.append("transactionId", res.id);
          const upload = await fetch("/api/files/upload", {
            method: "POST",
            body: fd,
          });
          if (!upload.ok) {
            const j = (await upload.json()) as { error?: string };
            throw new Error(j.error ?? "Beleg-Upload fehlgeschlagen.");
          }
        } catch (e) {
          toast.error(
            e instanceof Error ? e.message : "Beleg-Upload fehlgeschlagen.",
          );
        } finally {
          setUploading(false);
        }
      }
      toast.success("Kostenposition erfasst.");
      reset();
      setOpen(false);
      router.refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  function reset() {
    setDescription("");
    setAmount("");
    setNetAmount("");
    setIsAllocatable(false);
    setAllocationKey(NONE);
    setExpenseType(ExpenseType.SOFORTABZUG);
    setIsAfaRelevant(false);
    setIsLaborCost35a(false);
    setCategory(TransactionCategory.SONSTIGE);
    if (fileRef.current) fileRef.current.value = "";
  }

  /** Regelbasierter Kategorie-Vorschlag aus dem Buchungstext (keine KI). */
  async function suggest() {
    if (!description.trim()) {
      toast.error("Bitte zuerst eine Beschreibung eingeben.");
      return;
    }
    const res = await utils.cost.suggestCategory.fetch({ text: description });
    if (!res.category) {
      toast.info("Kein Vorschlag gefunden — bitte Kategorie manuell wählen.");
      return;
    }
    setCategory(res.category);
    if (res.info) {
      setIsAllocatable(res.info.allocatableByDefault);
      setAllocationKey(res.info.suggestedKey ?? NONE);
    }
    toast.success(`Vorschlag: ${CATEGORY_LABELS[res.category]}`);
  }

  function submit() {
    const amountCents = parseEuroInput(amount);
    if (!amountCents || amountCents <= 0) {
      toast.error("Bitte einen gültigen Betrag (> 0) eingeben.");
      return;
    }
    const netCents = parseEuroInput(netAmount);
    if (netCents === undefined) {
      toast.error("Netto-Betrag ist ungültig.");
      return;
    }
    create.mutate({
      propertyId: propertyId === NONE ? null : propertyId,
      bookingDate: new Date(`${bookingDate}T00:00:00.000Z`),
      paidDate: paidDate ? new Date(`${paidDate}T00:00:00.000Z`) : null,
      category,
      description: description || null,
      amountCents,
      netAmountCents: netCents,
      isAllocatable,
      allocationKey:
        allocationKey === NONE ? null : (allocationKey as AllocationKey),
      isAfaRelevant,
      isLaborCost35a,
      expenseType,
      distributionYears:
        expenseType === ExpenseType.VERTEILUNG_82B ? distributionYears : null,
      distributionStartYear:
        expenseType === ExpenseType.VERTEILUNG_82B
          ? distributionStartYear
          : null,
    });
  }

  const pending = create.isPending || uploading;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Beleg / Kostenposition erfassen</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="cost-property">Objekt</Label>
            <Select value={propertyId} onValueChange={setPropertyId}>
              <SelectTrigger id="cost-property">
                <SelectValue placeholder="Objekt wählen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Kein Objekt (allgemein)</SelectItem>
                {propertyOptions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="cost-booking-date">Belegdatum</Label>
              <Input
                id="cost-booking-date"
                type="date"
                value={bookingDate}
                onChange={(e) => setBookingDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="cost-paid-date">Zahlungsdatum (Abfluss)</Label>
              <Input
                id="cost-paid-date"
                type="date"
                value={paidDate}
                onChange={(e) => setPaidDate(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="cost-description">Beschreibung</Label>
            <div className="flex gap-2">
              <Input
                id="cost-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="z. B. Gebäudeversicherung 2025"
              />
              <Button type="button" variant="outline" onClick={() => void suggest()}>
                Kategorie vorschlagen
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="cost-category">Kategorie</Label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as TransactionCategory)}
            >
              <SelectTrigger id="cost-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="cost-amount">Betrag € (brutto)</Label>
              <Input
                id="cost-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="cost-net">Netto € (für 15 %-Test)</Label>
              <Input
                id="cost-net"
                inputMode="decimal"
                value={netAmount}
                onChange={(e) => setNetAmount(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="cost-expense-type">Steuerliche Behandlung</Label>
            <Select
              value={expenseType}
              onValueChange={(v) => setExpenseType(v as ExpenseType)}
            >
              <SelectTrigger id="cost-expense-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(EXPENSE_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {expenseType === ExpenseType.VERTEILUNG_82B && (
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <Label htmlFor="cost-dist-years">Verteilung (Jahre 2–5)</Label>
                <Input
                  id="cost-dist-years"
                  type="number"
                  min={2}
                  max={5}
                  value={distributionYears}
                  onChange={(e) =>
                    setDistributionYears(Number(e.target.value))
                  }
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="cost-dist-start">Beginn (Jahr)</Label>
                <Input
                  id="cost-dist-start"
                  type="number"
                  value={distributionStartYear}
                  onChange={(e) =>
                    setDistributionStartYear(Number(e.target.value))
                  }
                />
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <Label htmlFor="cost-allocation-key">
              Umlageschlüssel (BetrKV)
            </Label>
            <Select value={allocationKey} onValueChange={setAllocationKey}>
              <SelectTrigger id="cost-allocation-key">
                <SelectValue placeholder="Kein Schlüssel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Kein Schlüssel</SelectItem>
                {Object.entries(ALLOCATION_KEY_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isAllocatable}
                onChange={(e) => setIsAllocatable(e.target.checked)}
              />
              Umlagefähig auf Mieter (Betriebskosten)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isAfaRelevant}
                onChange={(e) => setIsAfaRelevant(e.target.checked)}
              />
              AfA-relevant (erhöht Bemessungsgrundlage)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isLaborCost35a}
                onChange={(e) => setIsLaborCost35a(e.target.checked)}
              />
              Enthält Lohnanteil (§ 35a – Hinweis)
            </label>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="cost-file">Beleg (PDF/Foto, optional)</Label>
            <Input id="cost-file" ref={fileRef} type="file" accept=".pdf,image/*" />
          </div>
        </div>

        <DialogFooter>
          <Button disabled={pending} onClick={submit}>
            {pending ? "Speichern…" : "Erfassen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
