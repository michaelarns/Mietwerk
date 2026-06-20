"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "~/components/confirm-dialog";
import { Button } from "~/components/ui/button";
import { api } from "~/trpc/react";

export function PropertyDeleteButton({
  id,
  redirectTo,
}: {
  id: string;
  redirectTo?: string;
}) {
  const router = useRouter();
  const del = api.property.softDelete.useMutation({
    onSuccess: () => {
      toast.success("Objekt gelöscht.");
      if (redirectTo) router.push(redirectTo);
      router.refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <ConfirmDialog
      title="Objekt löschen?"
      description="Das Objekt wird in den Papierkorb verschoben (Soft-Delete). Aktive oder zukünftige Mietverhältnisse verhindern das Löschen."
      pending={del.isPending}
      onConfirm={() => del.mutate({ id })}
      trigger={
        <Button variant="outline" size="sm">
          <Trash2 className="h-4 w-4" /> Löschen
        </Button>
      }
    />
  );
}

export function UnitDeleteButton({ id }: { id: string }) {
  const router = useRouter();
  const del = api.property.softDeleteUnit.useMutation({
    onSuccess: () => {
      toast.success("Einheit gelöscht.");
      router.refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <ConfirmDialog
      title="Einheit löschen?"
      description="Die Einheit wird in den Papierkorb verschoben (Soft-Delete). Aktive oder zukünftige Mietverhältnisse verhindern das Löschen."
      pending={del.isPending}
      onConfirm={() => del.mutate({ id })}
      trigger={
        <Button variant="ghost" size="sm">
          <Trash2 className="h-4 w-4" />
        </Button>
      }
    />
  );
}
