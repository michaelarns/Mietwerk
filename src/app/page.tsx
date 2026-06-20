import Link from "next/link";

import { Button } from "~/components/ui/button";
import { auth } from "~/server/auth";
import { HydrateClient } from "~/trpc/server";

export default async function Home() {
  const session = await auth();

  return (
    <HydrateClient>
      <main className="flex min-h-screen flex-col items-center justify-center gap-10 px-4 py-16">
        <div className="flex flex-col items-center gap-4 text-center">
          <h1 className="text-5xl font-extrabold tracking-tight sm:text-6xl">
            Mietwerk
          </h1>
          <p className="text-muted-foreground max-w-xl text-lg">
            Das Cockpit für private und semiprofessionelle Vermieter –
            Betriebskostenabrechnung, Steuer und Verwaltung an einem Ort.
          </p>
        </div>

        <div className="flex flex-col items-center gap-3">
          {session?.user ? (
            <p className="text-sm">
              Angemeldet als{" "}
              <span className="font-medium">
                {session.user.name ?? session.user.email}
              </span>
            </p>
          ) : null}
          {session ? (
            <div className="flex gap-3">
              <Button asChild>
                <Link href="/properties">Zum Cockpit</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/api/auth/signout">Abmelden</Link>
              </Button>
            </div>
          ) : (
            <Button asChild>
              <Link href="/api/auth/signin">Anmelden</Link>
            </Button>
          )}
        </div>
      </main>
    </HydrateClient>
  );
}
