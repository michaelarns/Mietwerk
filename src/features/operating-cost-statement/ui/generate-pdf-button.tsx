"use client";

import { toast } from "sonner";
import { FileDown } from "lucide-react";

import { Button } from "~/components/ui/button";
import { api } from "~/trpc/react";

/** Erzeugt das Mieter-PDF und öffnet es danach über /api/files/[id]. */
export function GeneratePdfButton({
  statementId,
  leaseId,
}: {
  statementId: string;
  leaseId: string;
}) {
  const generate = api.operatingCostStatement.generatePdf.useMutation({
    onSuccess: (res) => {
      toast.success("PDF erzeugt.");
      window.open(`/api/files/${res.documentId}`, "_blank", "noopener");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={generate.isPending}
      onClick={() => generate.mutate({ statementId, leaseId })}
    >
      <FileDown className="h-4 w-4" />
      {generate.isPending ? "Erzeuge…" : "PDF"}
    </Button>
  );
}
