"use client";

import Link from "next/link";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Sparkles, X } from "lucide-react";
import { MODULES, type AppModule } from "@/lib/modules";
import { cn } from "@/lib/utils";

/** Navegación entre módulos: un panel flotante que entra desde la izquierda. */
export function Sidebar({
  open,
  onOpenChange,
  current,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  current: AppModule;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-foreground/10 backdrop-blur-[2px] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="floating fixed bottom-3 left-3 top-3 z-50 flex w-[min(19rem,calc(100vw-1.5rem))] flex-col rounded-[1.75rem] p-3 outline-none duration-300 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-left-8 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-left-8">
          <div className="flex items-center justify-between gap-2 px-1.5 pb-4 pt-1">
            <div className="flex items-center gap-2.5">
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-primary shadow-sm">
                <Sparkles className="h-5 w-5" />
              </span>
              <div>
                <DialogPrimitive.Title className="text-sm font-semibold leading-tight">Herramientas</DialogPrimitive.Title>
                <DialogPrimitive.Description className="text-xs text-muted-foreground">
                  Elegí un módulo
                </DialogPrimitive.Description>
              </div>
            </div>
            <DialogPrimitive.Close
              aria-label="Cerrar"
              className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>

          <nav className="flex flex-col gap-1" aria-label="Módulos">
            {MODULES.map((m) => {
              const active = m.href === current.href;
              const body = (
                <>
                  <span
                    className={cn(
                      "grid h-10 w-10 shrink-0 place-items-center rounded-xl transition-colors",
                      active ? "bg-primary text-primary-foreground shadow-sm" : "bg-secondary text-foreground/70 group-hover:text-foreground"
                    )}
                  >
                    <m.icon className="h-[18px] w-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      {m.label}
                      {m.soon && (
                        <span className="rounded-full bg-secondary px-1.5 py-px text-[10px] font-medium text-muted-foreground">
                          pronto
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">{m.description}</span>
                  </span>
                </>
              );

              if (m.soon) {
                return (
                  <div key={m.href} aria-disabled className="group flex items-center gap-3 rounded-2xl p-1.5 opacity-55">
                    {body}
                  </div>
                );
              }
              return (
                <Link
                  key={m.href}
                  href={m.href}
                  aria-current={active ? "page" : undefined}
                  onClick={() => onOpenChange(false)}
                  className={cn(
                    "group flex items-center gap-3 rounded-2xl p-1.5 transition-colors hover:bg-secondary/70",
                    active && "bg-secondary/70"
                  )}
                >
                  {body}
                </Link>
              );
            })}
          </nav>

          <p className="mt-auto px-2 pb-1 text-[11px] text-muted-foreground">
            <kbd className="rounded border bg-card px-1 font-ui">Esc</kbd> para cerrar
          </p>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
