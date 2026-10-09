"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { PanelLeft } from "lucide-react";
import { TooltipProvider, Hint } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { activeModule, type AppModule } from "@/lib/modules";
import { AccountPill } from "./AccountPill";
import { AccountProvider } from "./AccountProvider";
import { BarTargetProvider, ContextBarHost } from "./ContextBar";
import { Sidebar } from "./Sidebar";
import { VisitTracker } from "./VisitTracker";

/**
 * Marco común de todos los módulos: botón de navegación a la izquierda,
 * barra contextual al centro, cuenta a la derecha y la sidebar flotante. Vive
 * en el layout, así que sobrevive a la navegación y la barra puede
 * transformarse entre páginas.
 */
export function AppFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const current = activeModule(pathname);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => setNavOpen(false), [pathname]);

  return (
    <TooltipProvider delayDuration={1000} skipDelayDuration={300}>
      <AccountProvider>
        <BarTargetProvider value={target}>
          {/* right-scroll-bar-position: al abrir la sidebar se bloquea el scroll y desaparece la barra de
              desplazamiento; con esta clase (de react-remove-scroll) la barra superior no salta de costado. */}
          <div className="right-scroll-bar-position pointer-events-none fixed inset-x-0 top-0 z-40 flex items-start gap-1.5 p-2 sm:gap-2 sm:p-3">
            {/* Columnas laterales del mismo ancho en pantallas anchas: la barra queda centrada de verdad. */}
            <div className="flex shrink-0 lg:w-48">
              <NavPill module={current} onClick={() => setNavOpen(true)} />
            </div>
            <div className="flex min-w-0 flex-1 justify-center">
              <ContextBarHost onTarget={setTarget} />
            </div>
            <div className="flex shrink-0 justify-end lg:w-48">
              <AccountPill />
            </div>
          </div>

          <Sidebar open={navOpen} onOpenChange={setNavOpen} current={current} />
          {children}
          <Toaster />
          <VisitTracker />
        </BarTargetProvider>
      </AccountProvider>
    </TooltipProvider>
  );
}

function NavPill({ module, onClick }: { module: AppModule; onClick?: () => void }) {
  const Icon = module.icon;
  const pill = (
    <button
      type="button"
      onClick={onClick}
      tabIndex={onClick ? undefined : -1}
      aria-label={onClick ? `Módulos · estás en ${module.label}` : undefined}
      className="floating-ink pointer-events-auto flex h-[50px] shrink-0 items-center gap-2 rounded-full p-1.5 transition-transform hover:scale-[1.02] active:scale-[0.98] md:pr-3"
    >
      <span key={module.href} className="grid h-9 w-9 place-items-center rounded-full bg-primary shadow-sm duration-300 animate-in zoom-in-75">
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <span className="hidden text-sm font-semibold tracking-tight md:inline">{module.label}</span>
      <PanelLeft className="hidden h-4 w-4 text-cream/45 md:block" />
    </button>
  );
  return onClick ? <Hint label="Módulos">{pill}</Hint> : pill;
}
