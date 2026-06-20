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
import { emptyToNull } from "~/lib/utils";
import { api } from "~/trpc/react";

const formSchema = z.object({
  firstName: z.string().min(1, "Pflichtfeld"),
  lastName: z.string().min(1, "Pflichtfeld"),
  email: z.string().email("E-Mail prüfen").or(z.literal("")),
  phone: z.string().optional(),
});
type FormValues = z.infer<typeof formSchema>;

export interface TenantInitial {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
}

export function TenantFormDialog({
  initial,
  trigger,
}: {
  initial?: TenantInitial;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const isEdit = !!initial;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      firstName: initial?.firstName ?? "",
      lastName: initial?.lastName ?? "",
      email: initial?.email ?? "",
      phone: initial?.phone ?? "",
    },
  });

  const onDone = (msg: string) => {
    toast.success(msg);
    setOpen(false);
    form.reset();
    router.refresh();
  };
  const onError = (e: { message: string }) => toast.error(e.message);

  const create = api.tenant.create.useMutation({
    onSuccess: () => onDone("Mieter angelegt."),
    onError,
  });
  const update = api.tenant.update.useMutation({
    onSuccess: () => onDone("Mieter gespeichert."),
    onError,
  });

  function submit(values: FormValues) {
    const payload = {
      firstName: values.firstName,
      lastName: values.lastName,
      email: emptyToNull(values.email),
      phone: emptyToNull(values.phone),
    };
    if (isEdit) update.mutate({ id: initial.id, ...payload });
    else create.mutate(payload);
  }

  const pending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Mieter bearbeiten" : "Neuer Mieter"}
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(submit)}
            className="flex flex-col gap-4"
          >
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vorname</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nachname</FormLabel>
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
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>E-Mail</FormLabel>
                  <FormControl>
                    <Input type="email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Telefon</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
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
