"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "~/components/confirm-dialog";
import { Button } from "~/components/ui/button";
import { api } from "~/trpc/react";

export function DeleteScheduleButton({ id }: { id: string }) {
  const router = useRouter();
  const del = api.taxAfa.delete.useMutation({
    onSuccess: () => {
      toast.success("AfA-Plan gelöscht.");
      router.refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <ConfirmDialog
      title="AfA-Plan löschen?"
      description="Der Plan wird entfernt. Die Anlage-V-Vorschau berücksichtigt ihn danach nicht mehr."
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
