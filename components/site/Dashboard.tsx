"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUpRight, MessageSquare } from "lucide-react";
import { useAccount } from "@/components/shell/AccountProvider";
import { FeedbackSection } from "@/components/site/FeedbackSection";
import { SiteFooter } from "@/components/site/SiteFooter";
import { LAST_MODULE_KEY, MODULES, type AppModule } from "@/lib/modules";
import { STUDIO } from "@/lib/site";
import { cn } from "@/lib/utils";

const TOOLS = MODULES.filter((m) => m.href !== "/" && !m.soon);

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

/** Entrada escalonada de las tarjetas (con movimiento reducido, globals.css la apaga). */
const enter = (i: number): CSSProperties => ({ animationDelay: `${120 + i * 60}ms` });

/**
 * Inicio con sesión del estudio: las herramientas a un click (o a una tecla, del 1 al 5)
 * en lugar de la presentación, que es para quien llega por primera vez. Lo elige app/page.tsx.
 */
export function Dashboard({ name }: { name: string | null }) {
  const router = useRouter();
  const account = useAccount();
  const first = name?.split(/\s+/)[0];
  const [last, setLast] = useState<string | null>(null);

  useEffect(() => {
    try {
      setLast(localStorage.getItem(LAST_MODULE_KEY));
    } catch {
      /* sin almacenamiento */
    }
  }, []);

  // Si se cierra la sesión (acá o en otra pestaña), Inicio vuelve a ser la presentación.
  // Una sola vez: si el servidor igual manda el panel, no se queda refrescando.
  const refreshed = useRef(false);
  const signedOut = !!account?.ready && !account.user;
  useEffect(() => {
    if (!signedOut || refreshed.current) return;
    refreshed.current = true;
    router.refresh();
  }, [signedOut, router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      const tool = TOOLS[Number(e.key) - 1];
      if (!tool) return;
      e.preventDefault();
      router.push(tool.href);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  return (
    <div className="bg-background text-ink">
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-24 sm:px-8 md:pb-24 md:pt-32">
        <header className="grid gap-5 pb-8 duration-700 animate-in fade-in-0 md:grid-cols-[1fr_auto] md:items-end md:pb-10">
          <div>
            <p className="site-label text-ink/50">
              {STUDIO} <span className="text-ink/30">\</span> Herramientas
            </p>
            <h1 className="mt-5 text-balance font-display text-[clamp(2.6rem,7vw,5.5rem)] leading-[0.92] tracking-[-0.02em]">
              {first ? `Hola, ${first}.` : "Hola."} <em className="text-ink/40">¿Qué hacemos hoy?</em>
            </h1>
          </div>
          <Today />
        </header>

        <ul className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-3">
          {TOOLS.map((tool, i) => (
            <li key={tool.href} className="duration-700 animate-in fade-in-0 slide-in-from-bottom-3 fill-mode-backwards" style={enter(i)}>
              <ToolCard tool={tool} shortcut={i + 1} last={tool.href === last} />
            </li>
          ))}
          <li className="duration-700 animate-in fade-in-0 slide-in-from-bottom-3 fill-mode-backwards" style={enter(TOOLS.length)}>
            <FeedbackCard />
          </li>
        </ul>

        <p className="mt-5 hidden text-[13px] text-ink/45 md:block">
          Tip: con las teclas{" "}
          <kbd className="rounded border border-ink/20 bg-ink/5 px-1 font-ui text-[11px]">1</kbd> a{" "}
          <kbd className="rounded border border-ink/20 bg-ink/5 px-1 font-ui text-[11px]">{TOOLS.length}</kbd> abrís cada
          herramienta sin usar el mouse.
        </p>
      </main>

      <div className="mx-auto max-w-6xl px-4 sm:px-8">
        <div className="border-t border-ink/15" />
      </div>
      <FeedbackSection board />
      <SiteFooter />
    </div>
  );
}

/** La fecha de hoy. Se arma en el navegador, con su zona horaria (el servidor no la sabe). */
function Today() {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    setLabel(new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long" }).format(new Date()));
  }, []);
  return (
    <p className="site-label h-[11px] text-ink/50 md:text-right">
      {label && <span className="duration-500 animate-in fade-in-0">{label}</span>}
    </p>
  );
}

const CARD =
  "group relative flex h-full min-h-[9.5rem] flex-col overflow-hidden rounded-2xl border p-4 sm:min-h-[13rem] sm:p-6";
/** Al pasar el mouse la tarjeta se llena desde abajo, como las filas de la presentación. */
const FILL = "absolute inset-0 origin-bottom scale-y-0 transition-transform duration-500 ease-smooth group-hover:scale-y-100 group-focus-visible:scale-y-100";

function ToolCard({ tool, shortcut, last }: { tool: AppModule; shortcut: number; last: boolean }) {
  const Icon = tool.icon;
  return (
    <Link
      href={tool.href}
      aria-keyshortcuts={String(shortcut)}
      className={cn(CARD, "border-ink/15 bg-card shadow-[0_1px_0_hsl(240_12%_5%/0.04)]")}
    >
      <span aria-hidden className={cn(FILL, "bg-ink")} />
      <span className="relative flex items-start justify-between gap-2">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-ink/[0.06] transition-colors duration-500 group-hover:bg-primary group-hover:text-primary-foreground group-focus-visible:bg-primary sm:h-11 sm:w-11">
          <Icon className="h-[18px] w-[18px] sm:h-5 sm:w-5" />
        </span>
        <span className="flex items-center gap-2">
          {last && (
            <span className="site-label rounded-full bg-primary px-2 py-1 text-[9.5px] text-primary-foreground">Última</span>
          )}
          <kbd
            aria-hidden
            className="hidden h-6 min-w-6 place-items-center rounded-md border border-ink/15 px-1.5 font-ui text-[11px] font-medium text-ink/45 transition-colors duration-500 group-hover:border-cream/20 group-hover:text-cream/55 md:grid"
          >
            {shortcut}
          </kbd>
        </span>
      </span>
      <span className="relative mt-auto block pt-6">
        <span className="flex items-end justify-between gap-3">
          <span className="font-display text-[1.85rem] leading-none tracking-[-0.02em] transition-colors duration-500 group-hover:text-cream group-focus-visible:text-cream sm:text-[2.6rem]">
            {tool.label}
          </span>
          <ArrowUpRight className="hidden h-6 w-6 shrink-0 transition-[color,transform] duration-500 group-hover:rotate-45 group-hover:text-primary group-focus-visible:text-primary sm:block" />
        </span>
        <span className="mt-2 hidden text-sm text-ink/55 transition-colors duration-500 group-hover:text-cream/60 group-focus-visible:text-cream/60 sm:block">
          {tool.description}
        </span>
      </span>
    </Link>
  );
}

/** El sexto casillero: baja a las sugerencias. Negro, y amarillo al pasar el mouse. */
function FeedbackCard() {
  return (
    <a href="#sugerencias" className={cn(CARD, "border-ink bg-ink text-cream")}>
      <span aria-hidden className={cn(FILL, "bg-primary")} />
      <span className="relative grid h-10 w-10 place-items-center rounded-full bg-cream/10 transition-colors duration-500 group-hover:bg-ink group-hover:text-cream sm:h-11 sm:w-11">
        <MessageSquare className="h-[18px] w-[18px] sm:h-5 sm:w-5" />
      </span>
      <span className="relative mt-auto block pt-6">
        <span className="flex items-end justify-between gap-3">
          <span className="font-display text-[1.85rem] leading-none tracking-[-0.02em] transition-colors duration-500 group-hover:text-ink sm:text-[2.6rem]">
            Sugerencias
          </span>
          <ArrowDown className="hidden h-6 w-6 shrink-0 transition-[color,transform] duration-500 group-hover:translate-y-0.5 group-hover:text-ink sm:block" />
        </span>
        <span className="mt-2 hidden text-sm text-cream/55 transition-colors duration-500 group-hover:text-ink/60 sm:block">
          Ideas y errores del equipo, en un tablero
        </span>
      </span>
    </a>
  );
}
