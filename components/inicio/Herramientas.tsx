"use client";

import { useEffect, useState, type DragEvent } from "react";
import Link from "next/link";
import { ArrowUpRight, Eye, EyeOff, GripVertical } from "lucide-react";
import { Hint } from "@/components/ui/tooltip";
import { moduloDe, ordenarHerramientas, textoVisitas } from "@/lib/inicio/herramientas";
import { LAST_MODULE_KEY, LIBRARY_HUB, type AppModule } from "@/lib/modules";
import { cn } from "@/lib/utils";
import { BOTON_CHICO, Seccion, useAjustesInicio } from "./piezas";
import type { DatosInicio } from "./useInicio";

const ORIGEN: Record<string, string> = {
  uso: "Por cuánto las usás",
  puesto: "Las de tu puesto primero",
  manual: "En tu orden",
  fijo: "",
};

/** El orden que se usa también para las teclas 1 a 9 del Inicio. */
export function useOrdenHerramientas(d: DatosInicio) {
  const { ajustes } = useAjustesInicio();
  return ordenarHerramientas({ uso: d.uso, sectores: d.misSectores, manual: ajustes.herramientasOrden, ocultas: ajustes.herramientasOcultas });
}

export function Herramientas({ d }: { d: DatosInicio }) {
  const { ajustes, cambiar, acomodando } = useAjustesInicio();
  const orden = useOrdenHerramientas(d);
  const [ultima, setUltima] = useState<string | null>(null);
  const [arrastrada, setArrastrada] = useState<string | null>(null);

  useEffect(() => {
    try {
      setUltima(localStorage.getItem(LAST_MODULE_KEY));
    } catch {
      /* sin almacenamiento */
    }
  }, []);

  const visitas = new Map((d.uso ?? []).map((u) => [u.modulo, u.visitas]));
  const esUltima = (t: AppModule) => t.href === ultima || (t === LIBRARY_HUB && !!ultima?.startsWith(`${LIBRARY_HUB.href}/`));
  const grandes = orden.lista.slice(0, 4);
  const chicas = orden.lista.slice(4);

  const soltarSobre = (destino: string) => {
    if (!arrastrada || arrastrada === destino) return;
    const ids = orden.lista.map((t) => t.href).filter((h) => h !== arrastrada);
    ids.splice(ids.indexOf(destino), 0, arrastrada);
    cambiar({ herramientasOrden: ids });
    setArrastrada(null);
  };
  const esconder = (href: string) => cambiar((a) => ({ herramientasOcultas: [...a.herramientasOcultas, href] }));
  const arrastre = (t: AppModule) =>
    acomodando
      ? {
          draggable: true,
          onDragStart: (e: DragEvent) => {
            setArrastrada(t.href);
            e.dataTransfer.effectAllowed = "move";
          },
          onDragOver: (e: DragEvent) => arrastrada && e.preventDefault(),
          onDrop: () => soltarSobre(t.href),
          onDragEnd: () => setArrastrada(null),
        }
      : {};

  const extra = (
    <>
      {ORIGEN[orden.origen] && <span className="hidden text-[12px] text-muted-foreground sm:inline">{ORIGEN[orden.origen]}</span>}
      {acomodando && ajustes.herramientasOrden && (
        <button type="button" onClick={() => cambiar({ herramientasOrden: null })} className={BOTON_CHICO}>
          Ordenar por uso
        </button>
      )}
    </>
  );

  return (
    <Seccion id="herramientas" titulo="Tus herramientas" extra={extra}>
      <ul className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        {grandes.map((t, i) => (
          <li key={t.href} {...arrastre(t)} className={cn("duration-700 animate-in fade-in-0 slide-in-from-bottom-3 fill-mode-backwards", arrastrada === t.href && "opacity-40")} style={{ animationDelay: `${80 + i * 60}ms` }}>
            <ToolCard tool={t} atajo={i + 1} ultima={esUltima(t)} visitas={visitas.get(moduloDe(t.href)) ?? 0} acomodando={acomodando} onEsconder={() => esconder(t.href)} />
          </li>
        ))}
      </ul>
      {chicas.length > 0 && (
        <ul className="mt-2.5 flex flex-wrap gap-2">
          {chicas.map((t, i) => {
            const Icono = t.icon;
            const n = i + 5;
            return (
              <li key={t.href} {...arrastre(t)} className={cn(arrastrada === t.href && "opacity-40")}>
                <span className="group relative inline-flex">
                  <Link
                    href={t.href}
                    aria-keyshortcuts={n <= 9 ? String(n) : undefined}
                    className={cn(
                      "inline-flex h-11 items-center gap-2 rounded-full border border-foreground/[0.12] bg-card pl-1.5 pr-3.5 text-sm font-medium transition-colors hover:border-foreground/30",
                      acomodando && "cursor-grab pr-9"
                    )}
                  >
                    {acomodando ? <GripVertical className="ml-1 h-4 w-4 text-muted-foreground" /> : null}
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-foreground/[0.06] transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                      <Icono className="h-4 w-4" />
                    </span>
                    {t.label}
                    {esUltima(t) && <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-label="La última que usaste" />}
                    {n <= 9 && !acomodando && <kbd className="hidden text-[11px] text-muted-foreground md:inline">{n}</kbd>}
                  </Link>
                  {acomodando && (
                    <button type="button" onClick={() => esconder(t.href)} aria-label={`Esconder ${t.label}`} className="absolute right-1.5 top-1.5 grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-foreground/5">
                      <EyeOff className="h-3.5 w-3.5" />
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {orden.escondidas.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
          <span>Escondidas:</span>
          {orden.escondidas.map((t) => (
            <button
              key={t.href}
              type="button"
              onClick={() => cambiar((a) => ({ herramientasOcultas: a.herramientasOcultas.filter((h) => h !== t.href) }))}
              className="inline-flex h-7 items-center gap-1 rounded-full border border-dashed px-2.5 hover:border-foreground/30 hover:text-foreground"
            >
              <Eye className="h-3 w-3" /> {t.label}
            </button>
          ))}
        </div>
      )}
      <p className="mt-3 hidden text-[13px] text-foreground/45 md:block">
        Tip: con las teclas <kbd className="rounded border border-foreground/20 bg-foreground/5 px-1 font-ui text-[11px]">1</kbd> a{" "}
        <kbd className="rounded border border-foreground/20 bg-foreground/5 px-1 font-ui text-[11px]">9</kbd> abrís cada herramienta, y con{" "}
        <kbd className="rounded border border-foreground/20 bg-foreground/5 px-1 font-ui text-[11px]">⌘K</kbd> buscás lo que sea.
      </p>
    </Seccion>
  );
}

const CARD = "group relative flex h-full min-h-[9.5rem] flex-col overflow-hidden rounded-2xl border p-4 sm:min-h-[12rem] sm:p-5";
/** Al pasar el mouse la tarjeta se llena desde abajo, como las filas de la presentación. */
const FILL = "absolute inset-0 origin-bottom scale-y-0 transition-transform duration-500 ease-smooth group-hover:scale-y-100 group-focus-visible:scale-y-100";

function ToolCard({
  tool,
  atajo,
  ultima,
  visitas,
  acomodando,
  onEsconder,
}: {
  tool: AppModule;
  atajo: number;
  ultima: boolean;
  visitas: number;
  acomodando: boolean;
  onEsconder: () => void;
}) {
  const Icon = tool.icon;
  return (
    <div className="relative h-full">
      <Link
        href={tool.href}
        aria-keyshortcuts={String(atajo)}
        className={cn(CARD, "border-foreground/15 bg-card shadow-[0_1px_0_hsl(240_12%_5%/0.04)]", acomodando && "cursor-grab")}
      >
        <span aria-hidden className={cn(FILL, "bg-ink")} />
        <span className="relative flex items-start justify-between gap-2">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-foreground/[0.06] transition-colors duration-500 group-hover:bg-primary group-hover:text-primary-foreground sm:h-11 sm:w-11">
            <Icon className="h-[18px] w-[18px] sm:h-5 sm:w-5" />
          </span>
          <span className="flex items-center gap-2">
            {ultima && <span className="site-label rounded-full bg-primary px-2 py-1 text-[9.5px] text-primary-foreground">Última</span>}
            {!acomodando && (
              <kbd
                aria-hidden
                className="hidden h-6 min-w-6 place-items-center rounded-md border border-foreground/15 px-1.5 font-ui text-[11px] font-medium text-foreground/45 transition-colors duration-500 group-hover:border-cream/20 group-hover:text-cream/55 md:grid"
              >
                {atajo}
              </kbd>
            )}
          </span>
        </span>
        <span className="relative mt-auto block pt-5">
          <span className="flex items-end justify-between gap-3">
            <span className="font-display text-[1.85rem] leading-none tracking-[-0.02em] transition-colors duration-500 group-hover:text-cream group-focus-visible:text-cream sm:text-[2.4rem]">
              {tool.label}
            </span>
            <ArrowUpRight className="hidden h-6 w-6 shrink-0 transition-[color,transform] duration-500 group-hover:rotate-45 group-hover:text-primary sm:block" />
          </span>
          <span className="mt-1.5 hidden text-sm text-foreground/55 transition-colors duration-500 group-hover:text-cream/60 sm:block">
            {textoVisitas(visitas) ? `${textoVisitas(visitas)} en dos meses` : tool.description}
          </span>
        </span>
      </Link>
      {acomodando && (
        <Hint label="Esconder del Inicio">
          <button type="button" onClick={onEsconder} aria-label={`Esconder ${tool.label}`} className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full border bg-card shadow-sm hover:border-foreground/30">
            <EyeOff className="h-4 w-4" />
          </button>
        </Hint>
      )}
    </div>
  );
}
