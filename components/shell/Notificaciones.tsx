"use client";

import { useMemo, useState, type ComponentType } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowDownWideNarrow, ArrowRightLeft, AtSign, Bell, Clock, Columns3, MessageCircle, Plus, UserPlus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Hint } from "@/components/ui/tooltip";
import { Avatar, BasecampGlyph, hace } from "@/components/tareas/comun";
import { marcarLeidas, useEstadoNotificaciones, useNotificaciones } from "@/hooks/useNotificaciones";
import { useStoredState } from "@/hooks/useStoredState";
import { TONO } from "@/lib/board/flujo";
import { hasSupabase } from "@/lib/supabase";
import {
  ABRIR_TAREA,
  MOTIVO_LABEL,
  NIVEL_LABEL,
  pasaFiltro,
  secciones,
  type Filtro,
  type Grupo,
  type Nivel,
  type Orden,
} from "@/lib/notificaciones/prioridad";
import { cn } from "@/lib/utils";
import { useAccount } from "./AccountProvider";

/** El rojo de lo urgente (el mismo de "Vencida" en el Board). */
const ROJO = TONO.vencida.fg;

const FILTROS: { value: Filtro; label: string }[] = [
  { value: "para-mi", label: "Para mí" },
  { value: "menciones", label: "Menciones" },
  { value: "todo", label: "Todo" },
];

/** Cuántas filas se ven de una sección que arranca cerrada (tus marcas, anteriores). */
const PLEGADA = 3;

/** La campanita se muestra con sesión y con la migración corrida (no carga nada: lo hace la campanita). */
export function useNotificacionesVisibles() {
  const account = useAccount();
  const n = useEstadoNotificaciones();
  return Boolean(account?.user) && hasSupabase && n.loaded && !n.sinMigracion;
}

export function NotificacionesPill() {
  const account = useAccount();
  const activo = Boolean(account?.user) && hasSupabase;
  const n = useNotificaciones({ activo });
  const visible = activo && n.loaded && !n.sinMigracion;
  const router = useRouter();
  const pathname = usePathname();
  const [abierto, setAbierto] = useState(false);
  const [filtro, setFiltro] = useStoredState<Filtro>("notificaciones:filtro", "para-mi");
  const [orden, setOrden] = useStoredState<Orden>("notificaciones:orden", "prioridad");
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());

  const lista = useMemo(() => secciones(n.grupos, filtro, orden), [n.grupos, filtro, orden]);
  const noLeidasVisibles = useMemo(
    () => n.grupos.filter((g) => pasaFiltro(g, filtro)).flatMap((g) => g.idsNoLeidas),
    [n.grupos, filtro]
  );
  const marcasSinLeer = n.grupos.filter((g) => g.nivel === "marcas").length;
  const mencionesSinLeer = n.grupos.filter((g) => g.menciones > 0 && g.noLeidas > 0).length;

  if (!visible) return null;
  const { total, urgentes } = n.contador;

  const verEnBoard = (tareaId: number) => {
    setAbierto(false);
    if (pathname === "/board") window.dispatchEvent(new CustomEvent(ABRIR_TAREA, { detail: tareaId }));
    else router.push(`/board?tarea=${tareaId}`);
  };

  const abrir = (g: Grupo) => {
    marcarLeidas(g.idsNoLeidas);
    const url = g.principal.app_url;
    if (url && g.principal.origen === "basecamp") window.open(url, "_blank", "noopener,noreferrer");
    else if (g.principal.tarea_id != null) verEnBoard(g.principal.tarea_id);
  };

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <Hint label={urgentes ? `${urgentes} para vos, ahora` : "Notificaciones"}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={total ? `Notificaciones: ${total} sin leer${urgentes ? `, ${urgentes} urgentes` : ""}` : "Notificaciones"}
            className="floating-ink pointer-events-auto relative grid h-[50px] w-[50px] shrink-0 place-items-center rounded-full transition-transform hover:scale-[1.02] active:scale-[0.98] data-[state=open]:scale-100"
          >
            <Bell className="h-5 w-5" />
            {total > 0 && (
              <span
                className={cn(
                  "absolute right-1 top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10px] font-bold leading-none ring-2 ring-ink",
                  urgentes ? "text-white" : "bg-primary text-primary-foreground"
                )}
                style={urgentes ? { background: ROJO } : undefined}
              >
                {total > 9 ? "9+" : total}
              </span>
            )}
          </button>
        </PopoverTrigger>
      </Hint>
      <PopoverContent align="end" className="w-[26rem] p-0">
        <div className="flex items-center gap-2 px-4 pb-2 pt-3.5">
          <h2 className="flex-1 text-sm font-semibold">Notificaciones</h2>
          {noLeidasVisibles.length > 0 && (
            <button
              type="button"
              onClick={() => marcarLeidas(noLeidasVisibles)}
              className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Marcar todo leído
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 px-4 pb-2">
          <div role="tablist" aria-label="Qué notificaciones ver" className="flex flex-1 gap-1">
            {FILTROS.map((f) => {
              const cuenta = f.value === "para-mi" ? total : f.value === "menciones" ? mencionesSinLeer : 0;
              return (
                <button
                  key={f.value}
                  type="button"
                  role="tab"
                  aria-selected={filtro === f.value}
                  onClick={() => setFiltro(f.value)}
                  className={cn(
                    "inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-medium transition-colors",
                    filtro === f.value ? "bg-foreground text-background" : "bg-secondary/70 text-muted-foreground hover:text-foreground"
                  )}
                >
                  {f.label}
                  {cuenta > 0 && <span className="tabular-nums opacity-70">{cuenta}</span>}
                </button>
              );
            })}
          </div>
          <Hint label={orden === "prioridad" ? "Lo urgente y lo tuyo primero. Tocá para ver por fecha." : "Por fecha. Tocá para ver lo urgente primero."}>
            <button
              type="button"
              onClick={() => setOrden(orden === "prioridad" ? "recientes" : "prioridad")}
              className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              {orden === "prioridad" ? <ArrowDownWideNarrow className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
              {orden === "prioridad" ? "Prioridad" : "Recientes"}
            </button>
          </Hint>
        </div>

        <div className="max-h-[min(68vh,34rem)] overflow-y-auto border-t pb-2">
          {n.error && <p className="m-3 rounded-xl bg-primary/20 p-3 text-xs">{n.error}</p>}
          {!lista.length && !n.error && (
            <p className="px-6 py-10 text-center text-sm text-muted-foreground">
              {filtro === "menciones"
                ? "Nadie te nombró en las últimas semanas."
                : filtro === "todo"
                  ? "Todavía no llegó nada de Basecamp."
                  : "Nada nuevo para vos. Lo que te nombren, te asignen o pase en tus tareas aparece acá primero."}
            </p>
          )}
          {lista.map((s) => {
            const plegable = (s.nivel === "marcas" || s.nivel === "leidas") && s.grupos.length > PLEGADA;
            const abierta = abiertas.has(s.nivel);
            const filas = plegable && !abierta ? s.grupos.slice(0, PLEGADA) : s.grupos;
            return (
              <section key={s.nivel}>
                <h3 className="eyebrow flex items-center gap-1.5 px-4 pb-1 pt-3 text-muted-foreground">
                  {s.nivel === "ahora" && <span className="h-1.5 w-1.5 rounded-full" style={{ background: ROJO }} />}
                  {s.nivel === "nuevas" ? "Sin leer" : NIVEL_LABEL[s.nivel as Nivel]}
                </h3>
                <ul>
                  {filas.map((g) => (
                    <Fila key={g.clave} g={g} onAbrir={() => abrir(g)} onBoard={g.principal.tarea_id != null ? () => verEnBoard(g.principal.tarea_id!) : undefined} />
                  ))}
                </ul>
                {plegable && (
                  <button
                    type="button"
                    onClick={() =>
                      setAbiertas((prev) => {
                        const next = new Set(prev);
                        if (next.has(s.nivel)) next.delete(s.nivel);
                        else next.add(s.nivel);
                        return next;
                      })
                    }
                    className="mx-4 mt-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    {abierta ? "Ver menos" : `Ver ${s.grupos.length - PLEGADA} más`}
                  </button>
                )}
              </section>
            );
          })}
          {filtro === "para-mi" && marcasSinLeer > 0 && (
            <button
              type="button"
              onClick={() => setFiltro("todo")}
              className="mx-4 mt-3 block w-[calc(100%-2rem)] rounded-xl bg-secondary/55 px-3 py-2 text-left text-xs text-muted-foreground hover:text-foreground"
            >
              {marcasSinLeer === 1 ? "Hay 1 novedad" : `Hay ${marcasSinLeer} novedades`} en tus marcas que no son para vos.{" "}
              <span className="font-medium text-foreground">Ver en Todo</span>
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** El ícono chico sobre la foto: qué pasó. */
function iconoDe(g: Grupo): ComponentType<{ className?: string }> {
  if (g.motivo === "mencion") return AtSign;
  if (g.motivo === "asignacion") return UserPlus;
  const kind = g.principal.kind ?? "";
  if (kind === "comment_created") return MessageCircle;
  if (/moved/.test(kind)) return ArrowRightLeft;
  if (/_created$/.test(kind)) return Plus;
  return g.principal.origen === "basecamp" ? BasecampGlyph : Columns3;
}

function Fila({ g, onAbrir, onBoard }: { g: Grupo; onAbrir: () => void; onBoard?: () => void }) {
  const n = g.principal;
  const Icono = iconoDe(g);
  const nueva = g.noLeidas > 0;
  const fuerte = g.nivel === "ahora";
  const tono = g.urgente && g.tono ? TONO[g.tono] : null;
  const titulo = n.titulo ?? n.proyecto ?? "Basecamp";
  const esRespuesta = n.kind === "comment_created";
  const otros = g.autores.length > 1 ? ` y ${g.autores.length - 1} más` : "";

  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={onAbrir}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onAbrir();
          }
        }}
        className={cn(
          "group/fila relative flex cursor-pointer gap-3 px-4 py-2.5 outline-none transition-colors hover:bg-secondary/60 focus-visible:bg-secondary/60",
          !nueva && "opacity-70"
        )}
      >
        {fuerte && <span aria-hidden className="absolute inset-y-2 left-0 w-1 rounded-r-full" style={{ background: ROJO }} />}
        <span className="relative mt-0.5 shrink-0">
          <Avatar nombre={n.autor ?? "Basecamp"} url={n.autor_avatar} className="h-9 w-9 text-[11px]" />
          <span
            className={cn("absolute -bottom-1 -right-1 grid h-[18px] w-[18px] place-items-center rounded-full ring-2 ring-[hsl(var(--card))]", !fuerte && "bg-ink text-cream")}
            style={fuerte ? { background: ROJO, color: "#fff" } : undefined}
          >
            <Icono className="h-2.5 w-2.5" />
          </span>
        </span>

        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] font-semibold">
            <span style={fuerte ? { color: ROJO } : undefined} className={cn(!fuerte && "text-muted-foreground")}>
              {MOTIVO_LABEL[g.motivo]}
            </span>
            {tono && (
              <span className="rounded-full px-1.5 py-px text-[10px]" style={{ color: tono.fg, background: tono.bg }}>
                {tono.label}
              </span>
            )}
          </p>
          <p className={cn("truncate text-sm leading-snug", nueva ? "font-semibold" : "font-medium")}>
            {esRespuesta ? `Re: ${titulo}` : titulo}
          </p>
          {n.texto && <p className="line-clamp-2 text-xs leading-snug text-muted-foreground">{n.texto}</p>}
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {hace(g.fecha)}
            {n.autor ? ` · ${n.autor}${otros}` : ""}
            {n.brand_name || n.proyecto ? ` · ${n.brand_name ?? n.proyecto}` : ""}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end justify-between gap-1">
          {g.noLeidas > 0 ? (
            <span
              className={cn("grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[10px] font-bold tabular-nums", !fuerte && "bg-secondary text-foreground")}
              style={fuerte ? { background: ROJO, color: "#fff" } : undefined}
              aria-label={`${g.noLeidas} sin leer`}
            >
              {g.noLeidas}
            </span>
          ) : (
            <span />
          )}
          {onBoard && n.origen === "basecamp" && (
            <Hint label="Ver en el Board">
              <button
                type="button"
                aria-label="Ver en el Board"
                onClick={(e) => {
                  e.stopPropagation();
                  marcarLeidas(g.idsNoLeidas);
                  onBoard();
                }}
                className="grid h-6 w-6 place-items-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:bg-secondary hover:text-foreground focus:opacity-100 group-hover/fila:opacity-100"
              >
                <Columns3 className="h-3.5 w-3.5" />
              </button>
            </Hint>
          )}
        </div>
      </div>
    </li>
  );
}
