"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import { api } from "~/trpc/react";

export function RunDunningButton() {
  const router = useRouter();
  const run = api.rentPayment.runDunning.useMutation({
    onSuccess: (res) => {
      toast.success(`Mahnlauf abgeschlossen: ${res.issued} Schreiben erzeugt.`);
      router.refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Button
      variant="outline"
      disabled={run.isPending}
      onClick={() => run.mutate({})}
    >
      {run.isPending ? "Mahnlauf läuft…" : "Mahnlauf starten"}
    </Button>
  );
}
