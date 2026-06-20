"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";

import { LeaseType } from "../../../../generated/prisma";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "~/components/ui/form";
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
import { LEASE_TYPE_OPTIONS } from "../labels";

const formSchema = z.object({
  unitId: z.string().min(1, "Einheit wählen"),
  type: z.nativeEnum(LeaseType),
  startDate: z.string().min(1, "Pflichtfeld"),
  endDate: z.string().optional(),
  baseRent: z.string().min(1, "Pflichtfeld"),
  operatingCostAdvance: z.string().optional(),
  deposit: z.string().optional(),
  tenantIds: z.array(z.string()).min(1, "Mindestens ein Mieter"),
});
type FormValues = z.infer<typeof formSchema>;

export interface UnitOption {
  id: string;
  label: string;
}

export interface LeaseInitial {
  id: string;
  unitId: string;
  type: LeaseType;
  startDate: Date;
  endDate: Date | null;
  baseRentCents: number;
  operatingCostAdvanceCents: number;
  depositCents: number;
  tenantIds: string[];
}

const toDateInput = (d: Date) => d.toISOString().slice(0, 10);
const toUtcDate = (s: string) => new Date(`${s}T00:00:00.000Z`);

export function LeaseFormDialog({
  units,
  defaultUnitId,
  initial,
  trigger,
}: {
  units: UnitOption[];
  defaultUnitId?: string;
  initial?: LeaseInitial;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const isEdit = !!initial;
  const tenants = api.tenant.list.useQuery(undefined, { enabled: open });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      unitId: initial?.unitId ?? defaultUnitId ?? "",
      type: initial?.type ?? LeaseType.STANDARD,
      startDate: initial ? toDateInput(initial.startDate) : "",
      endDate: initial?.endDate ? toDateInput(initial.endDate) : "",
      baseRent: centsToEuroInput(initial?.baseRentCents),
      operatingCostAdvance: centsToEuroInput(
        initial?.operatingCostAdvanceCents,
      ),
      deposit: centsToEuroInput(initial?.depositCents),
      tenantIds: initial?.tenantIds ?? [],
    },
  });

  const onDone = (msg: string) => {
    toast.success(msg);
    setOpen(false);
    form.reset();
    router.refresh();
  };
  const onError = (e: { message: string }) => toast.error(e.message);

  const create = api.lease.create.useMutation({
    onSuccess: () => onDone("Mietverhältnis angelegt."),
    onError,
  });
  const update = api.lease.update.useMutation({
    onSuccess: () => onDone("Mietverhältnis gespeichert."),
    onError,
  });

  function submit(values: FormValues) {
    const common = {
      type: values.type,
      startDate: toUtcDate(values.startDate),
      endDate: values.endDate ? toUtcDate(values.endDate) : null,
      baseRentCents: parseEuroInput(values.baseRent) ?? 0,
      operatingCostAdvanceCents:
        parseEuroInput(values.operatingCostAdvance ?? "") ?? 0,
      depositCents: parseEuroInput(values.deposit ?? "") ?? 0,
      tenantIds: values.tenantIds,
    };
    if (isEdit) {
      update.mutate({ id: initial.id, ...common });
    } else {
      create.mutate({ unitId: values.unitId, ...common });
    }
  }

  const pending = create.isPending || update.isPending;
  const selected = form.watch("tenantIds");

  function toggleTenant(id: string) {
    const next = selected.includes(id)
      ? selected.filter((t) => t !== id)
      : [...selected, id];
    form.setValue("tenantIds", next, { shouldValidate: true });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Mietverhältnis bearbeiten" : "Neues Mietverhältnis"}
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(submit)}
            className="flex flex-col gap-4"
          >
            {!isEdit && (
              <FormField
                control={form.control}
                name="unitId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Einheit</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Einheit wählen" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {units.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mietart</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {LEASE_TYPE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Beginn</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="endDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ende (optional)</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <FormField
                control={form.control}
                name="baseRent"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Kaltmiete €</FormLabel>
                    <FormControl>
                      <Input inputMode="decimal" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="operatingCostAdvance"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>NK-Voraus. €</FormLabel>
                    <FormControl>
                      <Input inputMode="decimal" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="deposit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Kaution €</FormLabel>
                    <FormControl>
                      <Input inputMode="decimal" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label>Mieter</Label>
              <div className="flex flex-col gap-2 rounded-md border p-3">
                {tenants.isLoading && (
                  <span className="text-muted-foreground text-sm">lädt…</span>
                )}
                {tenants.data?.length === 0 && (
                  <span className="text-muted-foreground text-sm">
                    Noch keine Mieter erfasst. Lege zuerst einen Mieter an.
                  </span>
                )}
                {tenants.data?.map((t) => (
                  <Label
                    key={t.id}
                    className="flex items-center gap-2 font-normal"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={selected.includes(t.id)}
                      onChange={() => toggleTenant(t.id)}
                    />
                    {t.lastName}, {t.firstName}
                  </Label>
                ))}
              </div>
              {form.formState.errors.tenantIds?.message && (
                <p className="text-destructive text-sm font-medium">
                  {form.formState.errors.tenantIds.message}
                </p>
              )}
            </div>

            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {pending ? "Speichern…" : isEdit ? "Speichern" : "Anlegen"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
