import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "~/components/ui/button";
import { BankImportForm } from "~/features/rent-payments/ui/bank-import-form";

export default function BankImportPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/payments">
            <ArrowLeft className="h-4 w-4" /> Zurück
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">Kontoauszug importieren</h1>
      </div>
      <p className="text-muted-foreground max-w-2xl text-sm">
        Lade eine CSV-Datei deines Kontoauszugs hoch. Die Umsätze werden mit
        einem Zuordnungsvorschlag (über Betrag, Verwendungszweck und Name)
        angezeigt. Erst nach Bestätigung werden sie als Zahlungen verbucht. Ein
        erneuter Import derselben Datei legt keine Doubletten an.
      </p>
      <BankImportForm />
    </div>
  );
}
