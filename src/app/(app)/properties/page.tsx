import Link from "next/link";
import { Plus } from "lucide-react";

import { Button } from "~/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { PROPERTY_TYPE_LABELS } from "~/features/properties/labels";
import { PropertyFormDialog } from "~/features/properties/ui/property-form-dialog";
import { api } from "~/trpc/server";

export default async function PropertiesPage() {
  const properties = await api.property.list();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Objekte</h1>
        <PropertyFormDialog
          trigger={
            <Button>
              <Plus className="h-4 w-4" /> Neues Objekt
            </Button>
          }
        />
      </div>

      {properties.length === 0 ? (
        <p className="text-muted-foreground">
          Noch keine Objekte. Lege dein erstes Objekt an.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bezeichnung</TableHead>
              <TableHead>Typ</TableHead>
              <TableHead>Adresse</TableHead>
              <TableHead className="text-right">Einheiten</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {properties.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">
                  <Link
                    href={`/properties/${p.id}`}
                    className="hover:underline"
                  >
                    {p.name}
                  </Link>
                </TableCell>
                <TableCell>{PROPERTY_TYPE_LABELS[p.type]}</TableCell>
                <TableCell>
                  {p.street} {p.houseNo}, {p.postalCode} {p.city}
                </TableCell>
                <TableCell className="text-right">{p._count.units}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
