"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";

import { PropertyType } from "../../../../generated/prisma";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { centsToEuroInput, parseEuroInput } from "~/lib/money";
import { api } from "~/trpc/react";
import { PROPERTY_TYPE_OPTIONS } from "../labels";

const formSchema = z.object({
  name: z.string().min(1, "Pflichtfeld"),
  type: z.nativeEnum(PropertyType),
  street: z.string().min(1, "Pflichtfeld"),
  houseNo: z.string().min(1, "Pflichtfeld"),
  postalCode: z.string().min(4, "PLZ prüfen"),
  city: z.string().min(1, "Pflichtfeld"),
  buildYear: z.string().optional(),
  purchaseDate: z.string().optional(),
  purchasePrice: z.string().optional(),
  landValue: z.string().optional(),
  buildingValue: z.string().optional(),
});
type FormValues = z.infer<typeof formSchema>;

export interface PropertyInitial {
  id: string;
  name: string;
  type: PropertyType;
  street: string;
  houseNo: string;
  postalCode: string;
  city: string;
  buildYear: number | null;
  purchaseDate: Date | null;
  purchasePriceCents: number | null;
  landValueCents: number | null;
  buildingValueCents: number | null;
}

export function PropertyFormDialog({
  initial,
  trigger,
}: {
  initial?: PropertyInitial;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const isEdit = !!initial;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: initial?.name ?? "",
      type: initial?.type ?? PropertyType.MEHRFAMILIENHAUS,
      street: initial?.street ?? "",
      houseNo: initial?.houseNo ?? "",
      postalCode: initial?.postalCode ?? "",
      city: initial?.city ?? "",
      buildYear: initial?.buildYear?.toString() ?? "",
      purchaseDate: initial?.purchaseDate
        ? initial.purchaseDate.toISOString().slice(0, 10)
        : "",
      purchasePrice: centsToEuroInput(initial?.purchasePriceCents),
      landValue: centsToEuroInput(initial?.landValueCents),
      buildingValue: centsToEuroInput(initial?.buildingValueCents),
    },
  });

  const onDone = (msg: string) => {
    toast.success(msg);
    setOpen(false);
    form.reset();
    router.refresh();
  };
  const onError = (e: { message: string }) => toast.error(e.message);

  const create = api.property.create.useMutation({
    onSuccess: () => onDone("Objekt angelegt."),
    onError,
  });
  const update = api.property.update.useMutation({
    onSuccess: () => onDone("Objekt gespeichert."),
    onError,
  });

  function submit(values: FormValues) {
    const payload = {
      name: values.name,
      type: values.type,
      street: values.street,
      houseNo: values.houseNo,
      postalCode: values.postalCode,
      city: values.city,
      country: "DE",
      buildYear: values.buildYear ? Number(values.buildYear) : null,
      purchaseDate: values.purchaseDate ? new Date(values.purchaseDate) : null,
      purchasePriceCents: parseEuroInput(values.purchasePrice ?? "") ?? null,
      landValueCents: parseEuroInput(values.landValue ?? "") ?? null,
      buildingValueCents: parseEuroInput(values.buildingValue ?? "") ?? null,
    };
    if (isEdit) {
      update.mutate({ id: initial.id, ...payload });
    } else {
      create.mutate(payload);
    }
  }

  const pending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Objekt bearbeiten" : "Neues Objekt"}
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(submit)}
            className="flex flex-col gap-4"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bezeichnung</FormLabel>
                  <FormControl>
                    <Input placeholder="z. B. Hamburg – Musterstr. 1" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Objekttyp</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {PROPERTY_TYPE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <FormField
                  control={form.control}
                  name="street"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Straße</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="houseNo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nr.</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <FormField
                control={form.control}
                name="postalCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>PLZ</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="col-span-2">
                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ort</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="buildYear"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Baujahr</FormLabel>
                    <FormControl>
                      <Input inputMode="numeric" placeholder="1998" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="purchaseDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Kaufdatum</FormLabel>
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
                name="purchasePrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Kaufpreis €</FormLabel>
                    <FormControl>
                      <Input inputMode="decimal" placeholder="650000" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="landValue"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Grundst.-Anteil €</FormLabel>
                    <FormControl>
                      <Input inputMode="decimal" placeholder="130000" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="buildingValue"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gebäude-Anteil €</FormLabel>
                    <FormControl>
                      <Input inputMode="decimal" placeholder="520000" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
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
