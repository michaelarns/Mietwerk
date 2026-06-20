"use client";

import { FileText } from "lucide-react";

import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { DocumentsCard } from "./documents-card";

export function UnitDocumentsButton({
  unitId,
  unitLabel,
}: {
  unitId: string;
  unitLabel: string;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Dokumente">
          <FileText className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dokumente – {unitLabel}</DialogTitle>
        </DialogHeader>
        <DocumentsCard unitId={unitId} />
      </DialogContent>
    </Dialog>
  );
}
