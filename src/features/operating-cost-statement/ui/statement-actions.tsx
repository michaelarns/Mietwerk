"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Calculator, Lock, Trash2 } from "lucide-react";

import { Button } from "~/components/ui/button";
import { api } from "~/trpc/react";

export function StatementActions({
  statementId,
  status,
}: {
  statementId: string;
  status: "DRAFT" | "FINALIZED" | "SENT";
}) {
  const router = useRouter();
  const isDraft = status === "DRAFT";

  const run = api.operatingCostStatement.run.useMutation({
    onSuccess: () => {
      toast.success("Abrechnung neu berechnet.");
      router.refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  const finalize = api.operatingCostStatement.finalize.useMutation({
    onSuccess: () => {
      toast.success("Abrechnung finalisiert.");
      router.refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  const del = api.operatingCostStatement.delete.useMutation({
    onSuccess: () => {
      toast.success("Abrechnung gelöscht.");
      router.push("/statements");
    },
    onError: (e) => toast.error(e.message),
  });

  if (!isDraft) {
    return (
      <span className="text-muted-foreground text-sm">
        Finalisiert – nicht mehr änderbar.
      </span>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        disabled={run.isPending}
        onClick={() => run.mutate({ statementId })}
      >
        <Calculator className="h-4 w-4" /> Neu berechnen
      </Button>
      <Button
        disabled={finalize.isPending}
        onClick={() => {
          if (confirm("Abrechnung finalisieren? Danach nicht mehr änderbar.")) {
            finalize.mutate({ statementId });
          }
        }}
      >
        <Lock className="h-4 w-4" /> Finalisieren
      </Button>
      <Button
        variant="ghost"
        disabled={del.isPending}
        onClick={() => {
          if (confirm("Entwurf wirklich löschen?")) del.mutate({ statementId });
        }}
      >
        <Trash2 className="h-4 w-4" /> Löschen
      </Button>
    </div>
  );
}
