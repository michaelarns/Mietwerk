"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { cn } from "~/lib/utils";
import { setActiveOrganization } from "../actions";

export interface OrgOption {
  id: string;
  name: string;
}

export function OrgSwitcher({
  organizations,
  activeOrgId,
}: {
  organizations: OrgOption[];
  activeOrgId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const active =
    organizations.find((o) => o.id === activeOrgId) ?? organizations[0];

  function select(id: string) {
    if (id === activeOrgId) return;
    startTransition(async () => {
      await setActiveOrganization(id);
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={isPending}
          className="w-56 justify-between"
          aria-label="Organisation wechseln"
        >
          <span className="truncate">{active?.name ?? "Organisation"}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="start">
        <DropdownMenuLabel>Organisation</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {organizations.map((org) => (
          <DropdownMenuItem
            key={org.id}
            onSelect={() => select(org.id)}
            className="justify-between"
          >
            <span className="truncate">{org.name}</span>
            <Check
              className={cn(
                "ml-2 h-4 w-4",
                org.id === activeOrgId ? "opacity-100" : "opacity-0",
              )}
            />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
