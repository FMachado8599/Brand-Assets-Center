"use client";

import { useState } from "react";
import { CalendarDays, Copy, MessageSquare, MoreHorizontal, Trash2, Unlink } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ComentariosStore } from "@/hooks/useComentarios";
import { APROBACION, FORMATOS, nombreFormato } from "@/lib/plani/config";
import { etiquetaCorta, horaCorta } from "@/lib/plani/fechas";
import type { Aprobacion, Medio, Pieza, PiezaPatch, Rol } from "@/lib/plani/types";
import type { Brand } from "@/lib/types";
import { cn } from "@/lib/utils";
import { FormatDot, FormatIcon } from "../bits";
import { HiloComentarios, pendientes } from "../Comentarios";
import { anchoMockup, Mockup, portadaDe, PortadaMockup } from "../Mockups";
import { PlatformIcon } from "../PlatformIcon";
import { CopyDialog } from "./CopyDialog";
import { PanelCM, PanelDiseno, PanelRedaccion } from "./panels";

type Props = {
  pieza: Pieza;
  /** Las historias que adaptan esta pieza: van en el mismo bloque, en pestañas. */
  adaptaciones: Pieza[];
  brand: Brand;
  rol: Rol;
  update: (id: string, patch: PiezaPatch, ahora?: boolean) => void;
  onDuplicar: (id: string) => void;
  onBorrar: (id: string) => void;
  onAdaptar: (id: string) => void;
  onOpen?: (medio: Medio, pieza: Pieza) => void;
  comentarios: ComentariosStore;
  /** Los copys de toda la plani (para sugerir hashtags al redactar). */
  otrosCopys: string[];
};

/**
 * Una pieza de la plani: a la izquierda cómo se va a ver publicada; a la derecha lo que le toca
 * al rol que está mirando. Si tiene adaptación a historia, las dos van juntas con pestañas (mismo
 * título, misma idea). Arriba, el formato, el título, las aprobaciones y los comentarios.
 */
export function PiezaCard({ pieza, adaptaciones, brand, rol, update, onDuplicar, onBorrar, onAdaptar, onOpen, comentarios, otrosCopys }: Props) {
  const grupo = [pieza, ...adaptaciones];
  const [activaId, setActivaId] = useState(pieza.id);
  const activa = grupo.find((p) => p.id === activaId) ?? pieza;
  const esAdaptacion = activa.id !== pieza.id;

  const [stickerSel, setStickerSel] = useState<string | null>(null);
  const [vista, setVista] = useState<"pieza" | "portada">("pieza");
  const [copyOpen, setCopyOpen] = useState(false);

  const set = (patch: PiezaPatch, ahora?: boolean) => update(activa.id, patch, ahora);
  const conPortada = activa.formato === "reel" && !!portadaDe(activa);
  const hilo = grupo.flatMap((p) => comentarios.porPieza.get(p.id) ?? []).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const sinResolver = pendientes(hilo);

  return (
    <article
      id={`pieza-${pieza.id}`}
      className="scroll-mt-28 rounded-[1.75rem] border border-black/[0.06] bg-card/95 p-4 shadow-[0_1px_2px_hsl(40_30%_20%/0.04),0_18px_40px_-28px_hsl(40_45%_20%/0.3)] sm:p-5"
    >
      <header className="mb-4 flex flex-wrap items-center gap-2">
        {grupo.length > 1 ? (
          <div role="tablist" aria-label="Pieza y adaptación" className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-secondary p-0.5">
            {grupo.map((p) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={p.id === activa.id}
                onClick={() => {
                  setActivaId(p.id);
                  setVista("pieza");
                  setStickerSel(null);
                }}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground",
                  p.id === activa.id && "bg-card text-foreground shadow-sm"
                )}
              >
                <FormatDot formato={p.formato} className="h-2 w-2" />
                {p.id === pieza.id ? nombreFormato(p.formato, p.proporcion) : "Historia"}
                {p.fecha !== pieza.fecha && <span className="font-normal text-muted-foreground">· {etiquetaCorta(p.fecha)}</span>}
              </button>
            ))}
          </div>
        ) : (
          <span className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-secondary px-2.5 text-xs font-semibold">
            <FormatDot formato={pieza.formato} className="h-2 w-2" />
            {nombreFormato(pieza.formato, pieza.proporcion)}
          </span>
        )}
        {activa.hora && <span className="text-xs tabular-nums text-muted-foreground">{horaCorta(activa.hora)} h</span>}
        <input
          value={pieza.titulo}
          onChange={(e) => update(pieza.id, { titulo: e.target.value })}
          readOnly={rol !== "redaccion"}
          placeholder={rol === "redaccion" ? "Título o idea de la pieza…" : FORMATOS[pieza.formato].label}
          maxLength={300}
          aria-label="Título de la pieza"
          className={cn(
            "h-8 min-w-[8rem] flex-1 truncate rounded-lg bg-transparent px-1.5 text-[15px] font-semibold tracking-tight outline-none placeholder:font-normal placeholder:text-muted-foreground",
            rol === "redaccion" && "hover:bg-secondary/60 focus:bg-secondary/70"
          )}
        />
        <div className="ml-auto flex items-center gap-1.5">
          {activa.programada && (
            <span className="inline-flex h-6 items-center rounded-full bg-emerald-700 px-2.5 text-[10px] font-bold uppercase tracking-wider text-white">Programada</span>
          )}
          <AprobacionMenu quien="Agencia" value={activa.estado_agencia} onChange={(estado_agencia) => set({ estado_agencia }, true)} />
          <AprobacionMenu quien="Cliente" value={activa.estado_cliente} onChange={(estado_cliente) => set({ estado_cliente }, true)} />

          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={`Comentarios${sinResolver ? ` (${sinResolver} sin resolver)` : ""}`}
                title="Comentarios"
                className="relative grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground data-[state=open]:bg-secondary data-[state=open]:text-foreground"
              >
                <MessageSquare className="h-4 w-4" />
                {sinResolver > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                    {sinResolver}
                  </span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[22rem]">
              <p className="mb-3 text-sm font-semibold">
                Comentarios <span className="font-normal text-muted-foreground">· {esAdaptacion ? "historia" : FORMATOS[pieza.formato].label.toLowerCase()}</span>
              </p>
              <HiloComentarios
                comentarios={hilo}
                modo="estudio"
                yo={comentarios.yo}
                compacto
                onEnviar={(texto, paraCliente) => comentarios.comentar(activa.id, texto, !paraCliente)}
                onResolver={comentarios.resolver}
                onBorrar={comentarios.borrar}
              />
            </PopoverContent>
          </Popover>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label="Más opciones de la pieza" className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel>{esAdaptacion ? "Historia" : "Pieza"}</DropdownMenuLabel>
              <label className="flex items-center gap-2 px-2 py-1.5 text-sm">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                <input
                  type="date"
                  value={activa.fecha}
                  onChange={(e) => e.target.value && set({ fecha: e.target.value }, true)}
                  className="min-w-0 flex-1 rounded-md bg-secondary px-2 py-1 text-xs outline-none"
                  aria-label="Mover a otra fecha"
                />
              </label>
              {!esAdaptacion && (
                <DropdownMenuItem onSelect={() => onDuplicar(pieza.id)}>
                  <Copy className="h-4 w-4" /> Duplicar
                </DropdownMenuItem>
              )}
              {esAdaptacion && (
                <DropdownMenuItem
                  onSelect={() => {
                    update(activa.id, { adapta_de: null }, true);
                    setActivaId(pieza.id);
                  }}
                >
                  <Unlink className="h-4 w-4" /> Separar (historia suelta)
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => {
                  onBorrar(activa.id);
                  if (esAdaptacion) setActivaId(pieza.id);
                }}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4" /> {esAdaptacion ? "Eliminar la historia" : "Eliminar pieza"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className={cn("grid gap-5", activa.formato === "reel" || activa.formato === "historia" ? "md:grid-cols-[minmax(0,15.5rem)_1fr]" : "md:grid-cols-[minmax(0,19rem)_1fr]")}>
        <div className={cn("mx-auto w-full md:sticky md:top-24 md:self-start", anchoMockup(activa))}>
          {conPortada && (
            <div className="mb-2.5 flex justify-center">
              <div role="tablist" aria-label="Ver" className="inline-flex items-center gap-0.5 rounded-full bg-secondary p-0.5">
                {(
                  [
                    ["pieza", "Reel"],
                    ["portada", "Portada"],
                  ] as const
                ).map(([v, l]) => (
                  <button
                    key={v}
                    type="button"
                    role="tab"
                    aria-selected={vista === v}
                    onClick={() => setVista(v)}
                    className={cn(
                      "h-7 rounded-full px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground",
                      vista === v && "bg-card text-foreground shadow-sm"
                    )}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
          )}
          {conPortada && vista === "portada" ? (
            <PortadaMockup pieza={activa} onOpen={onOpen ? (m) => onOpen(m, activa) : undefined} />
          ) : (
            <Mockup
              pieza={activa}
              brand={brand}
              fuente={esAdaptacion ? pieza : null}
              onStickers={rol === "diseno" && activa.formato === "historia" ? (stickers) => set({ stickers }) : undefined}
              stickerSel={stickerSel}
              onStickerSel={setStickerSel}
              onOpen={onOpen ? (m) => onOpen(m, activa) : undefined}
            />
          )}
          {activa.plataformas.length > 0 && !(conPortada && vista === "portada") && (
            <div className="mt-2.5 flex justify-center gap-1 text-muted-foreground" aria-label="Redes">
              {activa.plataformas.map((p) => (
                <PlatformIcon key={p} platform={p} className="h-3.5 w-3.5" />
              ))}
            </div>
          )}
        </div>

        <div className="min-w-0">
          {esAdaptacion && (
            <p className="mb-4 flex items-center gap-2 rounded-xl bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
              <FormatIcon formato="historia" className="h-3.5 w-3.5" />
              Adaptación a historia del {FORMATOS[pieza.formato].label.toLowerCase()}. Sin material propio, se ve la publicación compartida.
            </p>
          )}
          {rol === "redaccion" && (
            <PanelRedaccion
              pieza={activa}
              update={set}
              onAdaptar={!esAdaptacion && !adaptaciones.length ? () => onAdaptar(pieza.id) : undefined}
              onRedactar={() => setCopyOpen(true)}
            />
          )}
          {rol === "diseno" && (
            <PanelDiseno pieza={activa} brand={brand} update={set} stickerSel={stickerSel} onStickerSel={setStickerSel} adaptaDe={esAdaptacion ? pieza : null} />
          )}
          {rol === "cm" && <PanelCM pieza={activa} titulo={pieza.titulo} update={set} />}
        </div>
      </div>

      {copyOpen && (
        <CopyDialog open onOpenChange={(o) => !o && setCopyOpen(false)} pieza={activa} brand={brand} otrosCopys={otrosCopys} update={set} />
      )}
    </article>
  );
}

function AprobacionMenu({ quien, value, onChange }: { quien: string; value: Aprobacion; onChange: (v: Aprobacion) => void }) {
  const a = APROBACION[value];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`${quien}: ${a.label}`}
          className={cn("inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-[11px] font-semibold transition-opacity hover:opacity-80", a.className)}
        >
          <span className="hidden sm:inline">{quien}:&nbsp;</span>
          {a.label}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>{quien}</DropdownMenuLabel>
        {(Object.keys(APROBACION) as Aprobacion[]).map((k) => (
          <DropdownMenuItem key={k} onSelect={() => onChange(k)}>
            <span className={cn("h-2 w-2 rounded-full", k === "aprobada" ? "bg-emerald-600" : k === "cambios" ? "bg-destructive" : "bg-muted-foreground/40")} />
            {APROBACION[k].label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
