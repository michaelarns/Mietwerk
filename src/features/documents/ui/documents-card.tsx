"use client";

import { useRef, useState } from "react";
import { Download, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "~/components/confirm-dialog";
import { Button } from "~/components/ui/button";
import { formatDate } from "~/lib/date";
import { api } from "~/trpc/react";

export function DocumentsCard({
  propertyId,
  unitId,
}: {
  propertyId?: string;
  unitId?: string;
}) {
  const utils = api.useUtils();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const propQ = api.document.listForProperty.useQuery(
    { propertyId: propertyId ?? "" },
    { enabled: !!propertyId },
  );
  const unitQ = api.document.listForUnit.useQuery(
    { unitId: unitId ?? "" },
    { enabled: !!unitId },
  );
  const docs = propertyId ? propQ.data : unitQ.data;

  const invalidate = async () => {
    if (propertyId)
      await utils.document.listForProperty.invalidate({ propertyId });
    if (unitId) await utils.document.listForUnit.invalidate({ unitId });
  };

  const del = api.document.softDelete.useMutation({
    onSuccess: async () => {
      toast.success("Dokument gelöscht.");
      await invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  async function onFile(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (propertyId) fd.append("propertyId", propertyId);
      if (unitId) fd.append("unitId", unitId);
      const res = await fetch("/api/files/upload", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const j = (await res.json()) as { error?: string };
        throw new Error(j.error ?? "Upload fehlgeschlagen.");
      }
      toast.success("Dokument hochgeladen.");
      await invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload fehlgeschlagen.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Dokumente & Fotos</h3>
        <div>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
            }}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="h-4 w-4" />
            {uploading ? "Lädt hoch…" : "Hochladen"}
          </Button>
        </div>
      </div>

      {!docs || docs.length === 0 ? (
        <p className="text-muted-foreground text-sm">Keine Dokumente.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center justify-between p-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{d.fileName}</p>
                <p className="text-muted-foreground text-xs">
                  {formatDate(d.createdAt)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button asChild variant="ghost" size="sm">
                  <a href={`/api/files/${d.id}`} target="_blank" rel="noreferrer">
                    <Download className="h-4 w-4" />
                  </a>
                </Button>
                <ConfirmDialog
                  title="Dokument löschen?"
                  description="Das Dokument wird per Soft-Delete entfernt."
                  pending={del.isPending}
                  onConfirm={() => del.mutate({ id: d.id })}
                  trigger={
                    <Button variant="ghost" size="sm">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  }
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
