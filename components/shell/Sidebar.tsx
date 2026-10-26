"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronDown, ChevronUp, Plus, X } from "lucide-react";
import { openNewClient } from "@/components/clients/newClient";
import { Hint } from "@/components/ui/tooltip";
import { MODULES, type AppModule } from "@/lib/modules";
import { STUDIO } from "@/lib/site";
import { cn } from "@/lib/utils";

/** Lo que tapa el degradé con la flecha: un módulo que queda ahí abajo no se ve entero. */
const FADE = 44;

/**
 * La lista de módulos: si no entra en el alto del panel, se scrollea (sin barra a la vista). Una flecha
 * abajo baja de a un módulo y, cuando ya se bajó, otra arriba sube. Al abrir, el módulo actual queda a la vista.
 */
function ScrollingNav({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const [edges, setEdges] = useState({ up: false, down: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdges({ up: el.scrollTop > 1, down: el.scrollTop + el.clientHeight < el.scrollHeight - 1 });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const active = el.querySelector<HTMLElement>("[aria-current=page]");
    const item = active?.closest<HTMLElement>("nav > *");
    if (item && item.offsetTop + item.offsetHeight > el.clientHeight - FADE) {
      el.scrollTop = item.offsetTop - (el.clientHeight - item.offsetHeight) / 2;
    }
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  /** Muestra entero el módulo siguiente (o el anterior) que está cortado o fuera de la vista. */
  const step = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    const items = [...el.children] as HTMLElement[];
    const top = el.scrollTop;
    const bottom = top + el.clientHeight;
    if (dir > 0) {
      const next = items.find((i) => i.offsetTop + i.offsetHeight > bottom - FADE + 1);
      if (!next) return;
      const last = next === items[items.length - 1];
      el.scrollTo({ top: next.offsetTop + next.offsetHeight - el.clientHeight + (last ? 0 : FADE), behavior: "smooth" });
    } else {
      const prev = [...items].reverse().find((i) => i.offsetTop < top + FADE - 1);
      if (!prev) return;
      el.scrollTo({ top: prev === items[0] ? 0 : prev.offsetTop - FADE, behavior: "smooth" });
    }
  };

  const arrow = "pointer-events-auto grid h-8 w-8 place-items-center rounded-full bg-cream/10 text-cream/80 transition-colors hover:bg-cream/20 hover:text-cream";
  return (
    <div className="relative -mx-1 min-h-0 flex-1">
      <nav ref={ref} onScroll={measure} className="no-scrollbar relative flex h-full flex-col gap-1 overflow-y-auto overscroll-contain px-1" aria-label="Módulos">
        {children}
      </nav>
      {/* Con el mouse; con el teclado, el foco ya trae a la vista cada módulo. */}
      {edges.up && (
        <div className="pointer-events-none absolute inset-x-0 top-0 flex h-11 items-start justify-center bg-gradient-to-b from-ink via-ink/85 to-transparent">
          <button type="button" tabIndex={-1} aria-label="Subir un módulo" onClick={() => step(-1)} className={arrow}>
            <ChevronUp className="h-4 w-4" />
          </button>
        </div>
      )}
      {edges.down && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-11 items-end justify-center bg-gradient-to-t from-ink via-ink/85 to-transparent">
          <button type="button" tabIndex={-1} aria-label="Bajar un módulo" onClick={() => step(1)} className={arrow}>
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

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
        {/* Sin backdrop-filter en el fondo: desenfocar toda la página mientras se anima traba la apertura. */}
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/25 duration-300 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="floating-ink fixed bottom-3 left-3 top-3 z-50 flex w-[min(19rem,calc(100vw-1.5rem))] flex-col rounded-[1.75rem] bg-ink p-3 outline-none will-change-transform ease-smooth data-[state=closed]:duration-200 data-[state=open]:duration-500 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-left-8 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-left-8">
          <div className="flex shrink-0 items-start justify-between gap-2 px-2 pb-6 pt-2">
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

          <ScrollingNav>
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
              const link = (
                <Link
                  key={m.href}
                  href={m.href}
                  aria-current={active ? "page" : undefined}
                  onClick={() => onOpenChange(false)}
                  className={cn(
                    "group flex items-center gap-3 rounded-2xl p-1.5 transition-colors hover:bg-cream/10",
                    active && "bg-cream/10",
                    m.href === "/clientes" && "pr-12"
                  )}
                >
                  {body}
                </Link>
              );
              if (m.href !== "/clientes") return link;
              // Un cliente nuevo se crea desde cualquier módulo, sin ir a Clientes.
              return (
                <div key={m.href} className="relative">
                  {link}
                  <Hint label="Nuevo cliente" side="right">
                    <button
                      type="button"
                      aria-label="Nuevo cliente"
                      onClick={() => {
                        onOpenChange(false);
                        openNewClient();
                      }}
                      className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-cream/10 text-cream/70 transition-colors hover:bg-primary hover:text-primary-foreground"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </Hint>
                </div>
              );
            })}
          </ScrollingNav>

          <div className="flex shrink-0 items-center justify-between px-2 pb-1 pt-3">
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
