"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "~/components/confirm-dialog";
import { Button } from "~/components/ui/button";
import { api } from "~/trpc/react";

export function TenantDeleteButton({ id }: { id: string }) {
  const router = useRouter();
  const del = api.tenant.softDelete.useMutation({
    onSuccess: () => {
      toast.success("Mieter gelöscht.");
      router.refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <ConfirmDialog
      title="Mieter löschen?"
      description="Der Mieter wird per Soft-Delete entfernt (DSGVO). Ist er alleiniger Mieter eines aktiven Mietverhältnisses, ist das Löschen blockiert."
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
