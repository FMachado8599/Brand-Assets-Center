"use client";

import Link from "next/link";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { MODULES, type AppModule } from "@/lib/modules";
import { STUDIO } from "@/lib/site";
import { cn } from "@/lib/utils";

/** Navegación entre módulos: un panel negro que entra desde la izquierda. */
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
        {/* Sin backdrop-filter, ni en el fondo ni en el panel: desenfocar mientras se anima hace que la apertura se trabe. */}
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/25 duration-300 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="floating-ink fixed bottom-3 left-3 top-3 z-50 flex w-[min(19rem,calc(100vw-1.5rem))] flex-col rounded-[1.75rem] bg-ink p-3 outline-none will-change-transform ease-smooth [-webkit-backdrop-filter:none] [backdrop-filter:none] data-[state=closed]:duration-200 data-[state=open]:duration-500 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-left-8 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-left-8">
          <div className="flex items-start justify-between gap-2 px-2 pb-6 pt-2">
            <div>
              <DialogPrimitive.Description className="site-label text-cream/50">
                {STUDIO} <span className="text-primary">\</span>
              </DialogPrimitive.Description>
              <DialogPrimitive.Title className="mt-2 font-display text-[2rem] leading-none">Herramientas</DialogPrimitive.Title>
            </div>
            <DialogPrimitive.Close
              aria-label="Cerrar"
              className="grid h-9 w-9 place-items-center rounded-full text-cream/60 transition-colors hover:bg-cream/10 hover:text-cream"
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
                      active ? "bg-primary text-primary-foreground" : "bg-cream/10 text-cream/70 group-hover:text-cream"
                    )}
                  >
                    <m.icon className="h-[18px] w-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 font-display text-[1.35rem] leading-tight">
                      {m.label}
                      {m.soon && (
                        <span className="rounded-full bg-cream/10 px-1.5 py-px font-ui text-[10px] font-medium text-cream/50">
                          pronto
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-xs text-cream/45">{m.description}</span>
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
                  className={cn("group flex items-center gap-3 rounded-2xl p-1.5 transition-colors hover:bg-cream/10", active && "bg-cream/10")}
                >
                  {body}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto flex items-center justify-between px-2 pb-1">
            <Link href="/privacidad" onClick={() => onOpenChange(false)} className="site-label text-cream/40 transition-colors hover:text-cream">
              Privacidad
            </Link>
            <p className="text-[11px] text-cream/40">
              <kbd className="rounded border border-cream/20 bg-cream/5 px-1 font-ui">Esc</kbd> para cerrar
            </p>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
