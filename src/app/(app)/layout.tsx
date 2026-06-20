import Link from "next/link";
import { redirect } from "next/navigation";

import { AppNav } from "~/components/app-nav";
import { Button } from "~/components/ui/button";
import { OrgSwitcher } from "~/features/auth-org/ui/org-switcher";
import { auth } from "~/server/auth";
import { api } from "~/trpc/server";

/**
 * Authenticated app shell. Guards all nested routes: unauthenticated users are
 * sent to the login, users without an organization to onboarding.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/api/auth/signin");
  }

  const memberships = await api.organization.list();
  if (memberships.length === 0) {
    redirect("/onboarding");
  }

  const current = await api.organization.current();
  const organizations = memberships.map((m) => ({
    id: m.organization.id,
    name: m.organization.name,
  }));
  const activeOrgId = current.organization?.id ?? organizations[0]!.id;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between gap-4 border-b px-4 py-3">
        <div className="flex items-center gap-4">
          <Link href="/properties" className="text-lg font-bold">
            Mietwerk
          </Link>
          <OrgSwitcher
            organizations={organizations}
            activeOrgId={activeOrgId}
          />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground hidden text-sm sm:inline">
            {session.user.email ?? session.user.name}
          </span>
          <Button asChild variant="outline" size="sm">
            <Link href="/api/auth/signout">Abmelden</Link>
          </Button>
        </div>
      </header>
      <div className="flex flex-1">
        <aside className="w-56 shrink-0 border-r p-4">
          <AppNav />
        </aside>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
