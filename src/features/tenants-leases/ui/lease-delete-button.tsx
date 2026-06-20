"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "~/components/confirm-dialog";
import { Button } from "~/components/ui/button";
import { api } from "~/trpc/react";

export function LeaseDeleteButton({ id }: { id: string }) {
  const router = useRouter();
  const del = api.lease.softDelete.useMutation({
    onSuccess: () => {
      toast.success("Mietverhältnis gelöscht.");
      router.refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <ConfirmDialog
      title="Mietverhältnis löschen?"
      description="Das Mietverhältnis wird per Soft-Delete entfernt."
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
