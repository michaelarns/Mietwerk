"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Users, Wallet } from "lucide-react";

import { cn } from "~/lib/utils";

const ITEMS = [
  { href: "/properties", label: "Objekte", icon: Building2 },
  { href: "/tenants", label: "Mieter", icon: Users },
  { href: "/payments", label: "Zahlungen", icon: Wallet },
];

export function AppNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "hover:bg-accent hover:text-accent-foreground flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active && "bg-accent text-accent-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
