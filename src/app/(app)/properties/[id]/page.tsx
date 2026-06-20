import Link from "next/link";
import { Pencil, Plus } from "lucide-react";

import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { PROPERTY_TYPE_LABELS } from "~/features/properties/labels";
import {
  PropertyDeleteButton,
  UnitDeleteButton,
} from "~/features/properties/ui/delete-buttons";
import { PropertyFormDialog } from "~/features/properties/ui/property-form-dialog";
import { UnitFormDialog } from "~/features/properties/ui/unit-form-dialog";
import { Badge } from "~/components/ui/badge";
import {
  LEASE_STATUS_LABELS,
  LEASE_STATUS_VARIANT,
  LEASE_TYPE_LABELS,
} from "~/features/tenants-leases/labels";
import { LeaseDeleteButton } from "~/features/tenants-leases/ui/lease-delete-button";
import { LeaseFormDialog } from "~/features/tenants-leases/ui/lease-form-dialog";
import { formatCents } from "~/lib/money";
import { formatDate } from "~/lib/date";
import { api } from "~/trpc/server";

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const property = await api.property.byId({ id });
  const leases = await api.lease.listForProperty({ propertyId: id });
  const unitOptions = property.units.map((u) => ({ id: u.id, label: u.label }));

  const propertyInitial = {
    id: property.id,
    name: property.name,
    type: property.type,
    street: property.street,
    houseNo: property.houseNo,
    postalCode: property.postalCode,
    city: property.city,
    buildYear: property.buildYear,
    purchaseDate: property.purchaseDate,
    purchasePriceCents: property.purchasePriceCents,
    landValueCents: property.landValueCents,
    buildingValueCents: property.buildingValueCents,
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/properties"
            className="text-muted-foreground text-sm hover:underline"
          >
            ← Objekte
          </Link>
          <h1 className="text-2xl font-bold">{property.name}</h1>
          <p className="text-muted-foreground">
            {PROPERTY_TYPE_LABELS[property.type]} · {property.street}{" "}
            {property.houseNo}, {property.postalCode} {property.city}
          </p>
        </div>
        <div className="flex gap-2">
          <PropertyFormDialog
            initial={propertyInitial}
            trigger={
              <Button variant="outline" size="sm">
                <Pencil className="h-4 w-4" /> Bearbeiten
              </Button>
            }
          />
          <PropertyDeleteButton id={property.id} redirectTo="/properties" />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Stammdaten</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <Field label="Baujahr" value={property.buildYear?.toString()} />
          <Field
            label="Kaufdatum"
            value={property.purchaseDate ? formatDate(property.purchaseDate) : undefined}
          />
          <Field
            label="Kaufpreis"
            value={
              property.purchasePriceCents != null
                ? formatCents(property.purchasePriceCents)
                : undefined
            }
          />
          <Field
            label="Grundstücksanteil"
            value={
              property.landValueCents != null
                ? formatCents(property.landValueCents)
                : undefined
            }
          />
          <Field
            label="Gebäudeanteil (AfA)"
            value={
              property.buildingValueCents != null
                ? formatCents(property.buildingValueCents)
                : undefined
            }
          />
        </CardContent>
      </Card>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Einheiten</h2>
          <UnitFormDialog
            propertyId={property.id}
            trigger={
              <Button size="sm">
                <Plus className="h-4 w-4" /> Einheit hinzufügen
              </Button>
            }
          />
        </div>
        {property.units.length === 0 ? (
          <p className="text-muted-foreground">Noch keine Einheiten.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bezeichnung</TableHead>
                <TableHead>Stockwerk</TableHead>
                <TableHead className="text-right">Zimmer</TableHead>
                <TableHead className="text-right">Fläche</TableHead>
                <TableHead className="text-right">Kaltmiete</TableHead>
                <TableHead className="text-right">NK-Voraus.</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {property.units.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.label}</TableCell>
                  <TableCell>{u.floor ?? "–"}</TableCell>
                  <TableCell className="text-right">{u.rooms ?? "–"}</TableCell>
                  <TableCell className="text-right">
                    {u.areaSqm != null ? `${u.areaSqm} m²` : "–"}
                  </TableCell>
                  <TableCell className="text-right">
                    {u.baseRentCents != null
                      ? formatCents(u.baseRentCents)
                      : "–"}
                  </TableCell>
                  <TableCell className="text-right">
                    {u.operatingCostAdvanceCents != null
                      ? formatCents(u.operatingCostAdvanceCents)
                      : "–"}
                  </TableCell>
                  <TableCell className="flex justify-end gap-1">
                    <UnitFormDialog
                      propertyId={property.id}
                      initial={{
                        id: u.id,
                        label: u.label,
                        floor: u.floor,
                        rooms: u.rooms,
                        areaSqm: u.areaSqm,
                        baseRentCents: u.baseRentCents,
                        operatingCostAdvanceCents: u.operatingCostAdvanceCents,
                      }}
                      trigger={
                        <Button variant="ghost" size="sm">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      }
                    />
                    <UnitDeleteButton id={u.id} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Mietverhältnisse</h2>
          <LeaseFormDialog
            units={unitOptions}
            defaultUnitId={unitOptions[0]?.id}
            trigger={
              <Button size="sm" disabled={unitOptions.length === 0}>
                <Plus className="h-4 w-4" /> Mietverhältnis anlegen
              </Button>
            }
          />
        </div>
        {leases.length === 0 ? (
          <p className="text-muted-foreground">
            Noch keine Mietverhältnisse.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Einheit</TableHead>
                <TableHead>Mieter</TableHead>
                <TableHead>Art</TableHead>
                <TableHead>Zeitraum</TableHead>
                <TableHead className="text-right">Kaltmiete</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {leases.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">{l.unit.label}</TableCell>
                  <TableCell>
                    {l.leaseTenants
                      .map((lt) => `${lt.tenant.lastName}`)
                      .join(", ") || "–"}
                  </TableCell>
                  <TableCell>{LEASE_TYPE_LABELS[l.type]}</TableCell>
                  <TableCell>
                    {formatDate(l.startDate)} –{" "}
                    {l.endDate ? formatDate(l.endDate) : "unbefristet"}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCents(l.baseRentCents)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={LEASE_STATUS_VARIANT[l.status]}>
                      {LEASE_STATUS_LABELS[l.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="flex justify-end gap-1">
                    <LeaseFormDialog
                      units={unitOptions}
                      initial={{
                        id: l.id,
                        unitId: l.unit.id,
                        type: l.type,
                        startDate: l.startDate,
                        endDate: l.endDate,
                        baseRentCents: l.baseRentCents,
                        operatingCostAdvanceCents: l.operatingCostAdvanceCents,
                        depositCents: l.depositCents,
                        tenantIds: l.leaseTenants.map((lt) => lt.tenant.id),
                      }}
                      trigger={
                        <Button variant="ghost" size="sm">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      }
                    />
                    <LeaseDeleteButton id={l.id} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value ?? "–"}</dd>
    </div>
  );
}
