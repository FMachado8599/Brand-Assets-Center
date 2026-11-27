"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { PanelLeft } from "lucide-react";
import { TooltipProvider, Hint } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { NewClientHost } from "@/components/clients/NewClientHost";
import { Buscador } from "@/components/inicio/Buscador";
import { Flotantes } from "@/components/inicio/Flotantes";
import { MarcaActivaProvider } from "@/components/inicio/MarcaActiva";
import { JamBurbuja } from "@/components/spotify/jam/JamBurbuja";
import { refrescarNoLeidos } from "@/lib/correo/noLeidos";
import { activeModule, AJUSTES, LAST_MODULE_KEY, PERFIL, type AppModule } from "@/lib/modules";
import { aplicarModoNoche } from "@/lib/tema";
import { AccountPill } from "./AccountPill";
import { AccountProvider, useAccount } from "./AccountProvider";
import { NotificacionesPill, useNotificacionesVisibles } from "./Notificaciones";
import { BarTargetProvider, ContextBarHost } from "./ContextBar";
import { ModoNocheProvider } from "./ModoNoche";
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

  useEffect(() => {
    // Tu perfil y los Ajustes no son herramientas: no le sacan la marca de "la última" a la que usaste.
    if (current.href === "/" || current === PERFIL || AJUSTES.includes(current)) return;
    try {
      localStorage.setItem(LAST_MODULE_KEY, current.href);
    } catch {
      /* sin almacenamiento */
    }
  }, [current.href]);

  // La plani en el link del cliente (/p/…) va sola: sin la navegación ni la cuenta del estudio, y
  // siempre de día (acá no está ModoNocheProvider, así que si se llega navegando se saca acá).
  const delCliente = pathname.startsWith("/p/");
  useEffect(() => {
    if (delCliente) aplicarModoNoche(false);
  }, [delCliente]);

  if (delCliente) {
    return (
      <TooltipProvider delayDuration={1000} skipDelayDuration={300}>
        {children}
        <Toaster />
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={1000} skipDelayDuration={300}>
      <AccountProvider>
        <ModoNocheProvider>
          <MarcaActivaProvider>
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
                <CuentaYAvisos />
              </div>
            </div>

            <Sidebar open={navOpen} onOpenChange={setNavOpen} current={current} />
            {children}
            <NewClientHost />
            <JamBurbuja />
            <Flotantes />
            <Buscador />
            <Toaster />
            <VisitTracker />
          </BarTargetProvider>
          </MarcaActivaProvider>
        </ModoNocheProvider>
      </AccountProvider>
    </TooltipProvider>
  );
}

/** La campanita y la cuenta, arriba a la derecha. Con la campanita, la cuenta muestra solo la foto. */
function CuentaYAvisos() {
  const conAvisos = useNotificacionesVisibles();
  return (
    <div className="flex items-start gap-1.5">
      <NotificacionesPill />
      <AccountPill compact={conAvisos} />
    </div>
  );
}

function NavPill({ module, onClick }: { module: AppModule; onClick?: () => void }) {
  const Icon = module.icon;
  const yo = useAccount()?.user?.id ?? null;
  const pill = (
    <button
      type="button"
      onClick={onClick}
      // Al acercarse al botón ya se pregunta cuántos mails sin leer hay: al abrir la sidebar el número ya está.
      onPointerEnter={onClick ? () => refrescarNoLeidos(yo) : undefined}
      onFocus={onClick ? () => refrescarNoLeidos(yo) : undefined}
      tabIndex={onClick ? undefined : -1}
      aria-label={onClick ? `Módulos · estás en ${module.label}` : undefined}
      className="floating-ink pointer-events-auto flex h-[50px] shrink-0 items-center gap-2 rounded-full p-1.5 transition-transform hover:scale-[1.02] active:scale-[0.98] md:pr-3"
    >
      <span key={module.href} className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm duration-300 animate-in zoom-in-75">
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <span className="hidden text-sm font-semibold tracking-tight md:inline">{module.label}</span>
      <PanelLeft className="hidden h-4 w-4 text-cream/45 md:block" />
    </button>
  );
  return onClick ? <Hint label="Módulos">{pill}</Hint> : pill;
}
