import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { api } from "~/trpc/server";

export default async function TaxPage() {
  const properties = await api.cost.propertyOptions();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Steuer & AfA</h1>
        <p className="text-muted-foreground text-sm">
          AfA-Pläne und die Anlage-V-Vorschau je Objekt. Wähle ein Objekt.
        </p>
      </div>

      {properties.length === 0 ? (
        <p className="text-muted-foreground">
          Noch keine Objekte. Lege zuerst ein Objekt an.
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {properties.map((p) => (
            <li key={p.id}>
              <Link
                href={`/tax/${p.id}`}
                className="hover:bg-accent flex items-center justify-between px-4 py-3 transition-colors"
              >
                <span className="font-medium">{p.name}</span>
                <ChevronRight className="text-muted-foreground h-4 w-4" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
