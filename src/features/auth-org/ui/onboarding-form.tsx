"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
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
  createOrganizationSchema,
  type CreateOrganizationInput,
} from "~/features/auth-org/organization.schema";
import { api } from "~/trpc/react";
import { setActiveOrganization } from "../actions";

export function OnboardingForm() {
  const router = useRouter();
  const form = useForm<CreateOrganizationInput>({
    resolver: zodResolver(createOrganizationSchema),
    defaultValues: { name: "" },
  });

  const create = api.organization.create.useMutation({
    onSuccess: async (org) => {
      await setActiveOrganization(org.id);
      toast.success("Organisation angelegt.");
      router.push("/properties");
      router.refresh();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => create.mutate(values))}
        className="flex flex-col gap-4"
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name der Organisation</FormLabel>
              <FormControl>
                <Input placeholder="z. B. Wohnbau Nord GbR" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? "Wird angelegt…" : "Organisation anlegen"}
        </Button>
      </form>
    </Form>
  );
}
