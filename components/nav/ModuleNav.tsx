"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const MODULES = [
  { href: "/", label: "Tarjetas" },
  { href: "/conversor", label: "Conversor" },
];

/** Selector de módulo: cada uno es una página independiente que comparte solo el encabezado. */
export function ModuleNav() {
  const pathname = usePathname();
  return (
    <nav className="inline-flex items-center gap-1 rounded-lg bg-secondary p-1" aria-label="Módulos">
      {MODULES.map((m) => {
        const active = m.href === "/" ? pathname === "/" : pathname.startsWith(m.href);
        return (
          <Link
            key={m.href}
            href={m.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-semibold tracking-tight text-muted-foreground transition-colors hover:text-foreground",
              active && "bg-card text-foreground shadow-sm"
            )}
          >
            {m.label}
          </Link>
        );
      })}
    </nav>
  );
}
