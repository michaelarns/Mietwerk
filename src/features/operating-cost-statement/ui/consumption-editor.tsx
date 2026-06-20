"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { api } from "~/trpc/react";

interface Item {
  id: string;
  label: string;
}
interface Unit {
  id: string;
  label: string;
}

/**
 * Erfassung der Verbrauchswerte je Einheit für verbrauchsabhängige Positionen
 * (Heizung/Warmwasser/Wasser). Speichert und rechnet anschließend neu.
 */
export function ConsumptionEditor({
  statementId,
  items,
  units,
  initial,
}: {
  statementId: string;
  items: Item[];
  units: Unit[];
  initial: Record<string, Record<string, number>>;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, Record<string, string>>>(
    () => {
      const v: Record<string, Record<string, string>> = {};
      for (const it of items) {
        v[it.id] = {};
        for (const u of units) {
          const existing = initial[it.id]?.[u.id];
          v[it.id]![u.id] = existing != null ? String(existing) : "";
        }
      }
      return v;
    },
  );

  const setConsumption = api.operatingCostStatement.setConsumption.useMutation();
  const run = api.operatingCostStatement.run.useMutation();
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      for (const it of items) {
        for (const u of units) {
          const raw = values[it.id]?.[u.id] ?? "";
          if (raw.trim() === "") continue;
          const value = Number(raw.replace(",", "."));
          if (!Number.isFinite(value) || value < 0) continue;
          await setConsumption.mutateAsync({
            statementId,
            itemId: it.id,
            unitId: u.id,
            value,
          });
        }
      }
      await run.mutateAsync({ statementId });
      toast.success("Verbrauchswerte gespeichert und neu berechnet.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fehler beim Speichern.");
    } finally {
      setSaving(false);
    }
  }

  if (items.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm">
        Verbrauchswerte je Einheit (z. B. kWh, m³). Ohne erfasste Werte trägt der
        Vermieter den verbrauchsabhängigen Anteil.
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Einheit</TableHead>
            {items.map((it) => (
              <TableHead key={it.id} className="text-right">
                {it.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {units.map((u) => (
            <TableRow key={u.id}>
              <TableCell className="font-medium">{u.label}</TableCell>
              {items.map((it) => (
                <TableCell key={it.id} className="text-right">
                  <Input
                    className="ml-auto w-28 text-right"
                    inputMode="decimal"
                    value={values[it.id]?.[u.id] ?? ""}
                    onChange={(e) =>
                      setValues((prev) => ({
                        ...prev,
                        [it.id]: { ...prev[it.id], [u.id]: e.target.value },
                      }))
                    }
                  />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div>
        <Button onClick={save} disabled={saving}>
          {saving ? "Speichere…" : "Speichern & neu berechnen"}
        </Button>
      </div>
    </div>
  );
}
