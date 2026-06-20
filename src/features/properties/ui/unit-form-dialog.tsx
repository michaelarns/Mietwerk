"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";

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
import { centsToEuroInput, parseEuroInput } from "~/lib/money";
import { api } from "~/trpc/react";

const formSchema = z.object({
  label: z.string().min(1, "Pflichtfeld"),
  floor: z.string().optional(),
  rooms: z.string().optional(),
  areaSqm: z.string().optional(),
  baseRent: z.string().optional(),
  operatingCostAdvance: z.string().optional(),
});
type FormValues = z.infer<typeof formSchema>;

export interface UnitInitial {
  id: string;
  label: string;
  floor: string | null;
  rooms: number | null;
  areaSqm: number | null;
  baseRentCents: number | null;
  operatingCostAdvanceCents: number | null;
}

export function UnitFormDialog({
  propertyId,
  initial,
  trigger,
}: {
  propertyId: string;
  initial?: UnitInitial;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const isEdit = !!initial;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      label: initial?.label ?? "",
      floor: initial?.floor ?? "",
      rooms: initial?.rooms?.toString() ?? "",
      areaSqm: initial?.areaSqm?.toString() ?? "",
      baseRent: centsToEuroInput(initial?.baseRentCents),
      operatingCostAdvance: centsToEuroInput(
        initial?.operatingCostAdvanceCents,
      ),
    },
  });

  const onDone = (msg: string) => {
    toast.success(msg);
    setOpen(false);
    form.reset();
    router.refresh();
  };
  const onError = (e: { message: string }) => toast.error(e.message);

  const create = api.property.createUnit.useMutation({
    onSuccess: () => onDone("Einheit angelegt."),
    onError,
  });
  const update = api.property.updateUnit.useMutation({
    onSuccess: () => onDone("Einheit gespeichert."),
    onError,
  });

  function submit(values: FormValues) {
    const common = {
      label: values.label,
      floor: values.floor ?? null,
      rooms: values.rooms ? Number(values.rooms) : null,
      areaSqm: values.areaSqm ? Number(values.areaSqm) : null,
      baseRentCents: parseEuroInput(values.baseRent ?? "") ?? null,
      operatingCostAdvanceCents:
        parseEuroInput(values.operatingCostAdvance ?? "") ?? null,
    };
    if (isEdit) {
      update.mutate({ id: initial.id, ...common });
    } else {
      create.mutate({ propertyId, ...common });
    }
  }

  const pending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Einheit bearbeiten" : "Neue Einheit"}
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(submit)}
            className="flex flex-col gap-4"
          >
            <FormField
              control={form.control}
              name="label"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bezeichnung</FormLabel>
                  <FormControl>
                    <Input placeholder="z. B. EG links" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-3 gap-3">
              <FormField
                control={form.control}
                name="floor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Stockwerk</FormLabel>
                    <FormControl>
                      <Input placeholder="EG" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="rooms"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Zimmer</FormLabel>
                    <FormControl>
                      <Input inputMode="decimal" placeholder="3" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="areaSqm"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fläche m²</FormLabel>
                    <FormControl>
                      <Input inputMode="decimal" placeholder="72" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="baseRent"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Kaltmiete €</FormLabel>
                    <FormControl>
                      <Input inputMode="decimal" placeholder="780" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="operatingCostAdvance"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>NK-Vorauszahlung €</FormLabel>
                    <FormControl>
                      <Input inputMode="decimal" placeholder="180" {...field} />
                    </FormControl>
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
