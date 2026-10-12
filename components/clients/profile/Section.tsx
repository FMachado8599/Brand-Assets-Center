"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { DatabaseZap } from "lucide-react";
import { copyPlain } from "@/lib/cards/clipboard";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";

/** Un bloque de la ficha: papel, título en serif y, a la derecha, su acción. */
export function Section({
  title,
  hint,
  action,
  children,
  className,
  id,
}: {
  title: string;
  hint?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section
      id={id}
      aria-label={title}
      className={cn(
        "scroll-mt-24 rounded-[1.75rem] border border-black/[0.06] bg-card/95 p-5 shadow-[0_1px_2px_hsl(40_30%_20%/0.04),0_18px_40px_-28px_hsl(40_45%_20%/0.3)] sm:p-6",
        className
      )}
    >
      <header className="mb-4 flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <h2 className="font-display text-[1.85rem] leading-none">{title}</h2>
          {hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
        {action && <div className="flex shrink-0 items-center gap-1.5">{action}</div>}
      </header>
      {children}
    </section>
  );
}

/** Botón chico, redondo, para las acciones de cada bloque. */
export function SmallAction({
  children,
  onClick,
  href,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
}) {
  const cls =
    "inline-flex h-8 items-center gap-1.5 rounded-full border bg-card px-3 text-xs font-medium shadow-sm transition-colors hover:bg-secondary disabled:pointer-events-none disabled:opacity-50 [&_svg]:h-3.5 [&_svg]:w-3.5";
  if (href) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cls}>
      {children}
    </button>
  );
}

/** Texto vacío de un bloque. */
export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed border-foreground/15 px-4 py-5 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}

export async function copyWithToast(value: string, done = `Copiado: ${value}`) {
  const ok = await copyPlain(value);
  toast(ok ? done : "No se pudo copiar", ok ? "ok" : "error");
}

/** La base todavía no tiene la ficha: se ve todo, pero logo, colores, tipografías y notas no se pueden guardar. */
export function MigrationNotice({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-start gap-3 rounded-2xl bg-primary/25 px-4 py-3 text-sm", className)}>
      <DatabaseZap className="mt-0.5 h-4 w-4 shrink-0" />
      <p>
        Para guardar logos, colores, tipografías y notas falta un paso en la base: correr{" "}
        <code className="rounded bg-ink/10 px-1 text-[13px]">supabase/migracion-clientes.sql</code> en Supabase → SQL Editor.
      </p>
    </div>
  );
}
