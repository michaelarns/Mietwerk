"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { type TransactionCategory } from "../../../../generated/prisma";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { CATEGORY_LABELS } from "../labels";

const ALL = "ALL";

/**
 * Objekt-/Jahr-/Kategorie-Filter der Kostenliste. Schreibt die Auswahl in die
 * URL-Query; die Seite (Server Component) lädt die gefilterte Liste neu — kein
 * Client-seitiges Daten-Fetching.
 */
export function CostFilters({
  propertyOptions,
  propertyId,
  year,
  category,
}: {
  propertyOptions: { id: string; name: string }[];
  propertyId?: string;
  year?: number;
  category?: TransactionCategory;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const thisYear = new Date().getUTCFullYear();
  const years = Array.from({ length: 6 }, (_, i) => thisYear - i);

  function update(key: string, value: string) {
    const params = new URLSearchParams(searchParams);
    if (value === ALL) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="filter-property">Objekt</Label>
        <Select
          value={propertyId ?? ALL}
          onValueChange={(v) => update("propertyId", v)}
        >
          <SelectTrigger id="filter-property" className="w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Alle Objekte</SelectItem>
            {propertyOptions.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="filter-year">Jahr</Label>
        <Select
          value={year ? String(year) : ALL}
          onValueChange={(v) => update("year", v)}
        >
          <SelectTrigger id="filter-year" className="w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Alle Jahre</SelectItem>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="filter-category">Kategorie</Label>
        <Select
          value={category ?? ALL}
          onValueChange={(v) => update("category", v)}
        >
          <SelectTrigger id="filter-category" className="w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Alle Kategorien</SelectItem>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
