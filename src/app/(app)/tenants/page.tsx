import { Pencil, Plus } from "lucide-react";

import { Button } from "~/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { TenantDeleteButton } from "~/features/tenants-leases/ui/tenant-delete-button";
import { TenantFormDialog } from "~/features/tenants-leases/ui/tenant-form-dialog";
import { api } from "~/trpc/server";

export default async function TenantsPage() {
  const tenants = await api.tenant.list();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Mieter</h1>
        <TenantFormDialog
          trigger={
            <Button>
              <Plus className="h-4 w-4" /> Neuer Mieter
            </Button>
          }
        />
      </div>

      {tenants.length === 0 ? (
        <p className="text-muted-foreground">Noch keine Mieter erfasst.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>E-Mail</TableHead>
              <TableHead>Telefon</TableHead>
              <TableHead className="text-right">Mietverhältnisse</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {tenants.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">
                  {t.lastName}, {t.firstName}
                </TableCell>
                <TableCell>{t.email ?? "–"}</TableCell>
                <TableCell>{t.phone ?? "–"}</TableCell>
                <TableCell className="text-right">
                  {t._count.leaseTenants}
                </TableCell>
                <TableCell className="flex justify-end gap-1">
                  <TenantFormDialog
                    initial={{
                      id: t.id,
                      firstName: t.firstName,
                      lastName: t.lastName,
                      email: t.email,
                      phone: t.phone,
                    }}
                    trigger={
                      <Button variant="ghost" size="sm">
                        <Pencil className="h-4 w-4" />
                      </Button>
                    }
                  />
                  <TenantDeleteButton id={t.id} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
