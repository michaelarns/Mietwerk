import { redirect } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { OnboardingForm } from "~/features/auth-org/ui/onboarding-form";
import { auth } from "~/server/auth";
import { api } from "~/trpc/server";

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/api/auth/signin");
  }

  // Already has an organization → straight into the app.
  const memberships = await api.organization.list();
  if (memberships.length > 0) {
    redirect("/properties");
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Willkommen bei Mietwerk</CardTitle>
          <CardDescription>
            Lege deine Organisation an, um Objekte und Mietverhältnisse zu
            verwalten.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OnboardingForm />
        </CardContent>
      </Card>
    </main>
  );
}
