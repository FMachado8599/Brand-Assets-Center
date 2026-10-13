"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Check, Loader2, ThumbsUp, Trash2, UserRound, X } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import type { Suggestion, SuggestionKind, SuggestionStatus } from "@/hooks/useSuggestionBoard";
import { timeAgo } from "@/lib/redaccion/text";
import { cn } from "@/lib/utils";

/** Amarillo para las ideas, rojo para los errores: se distinguen de lejos. */
export const NOTE_COLORS: Record<SuggestionKind, { bg: string; label: string }> = {
  idea: { bg: "#FFE36E", label: "Idea" },
  error: { bg: "#FF8A7A", label: "Error" },
};

const STATUS_LABEL: Record<SuggestionStatus, string> = {
  abierta: "Abierta",
  en_camino: "En camino",
  hecha: "Hecha",
};

type Filter = "todas" | SuggestionKind;

/** Un número estable a partir del id: cada post-it tiene siempre la misma inclinación y altura. */
function seed(id: string, salt: number) {
  let h = salt;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((h >>> 0) % 1000) / 1000;
}

/** Un poco más arriba o más abajo: sin filas perfectas, como pegados a mano. */
const offset = (id: string): CSSProperties => ({
  transform: `translate(calc(var(--scatter-x, 1) * ${Math.round((seed(id, 13) - 0.5) * 26)}px), ${Math.round((seed(id, 7) - 0.5) * 40)}px)`,
});

/** La inclinación va en el post-it mismo: al pasar el mouse se endereza. */
const tilt = (id: string): CSSProperties => ({ ["--tilt" as string]: `${((seed(id, 3) - 0.5) * 10).toFixed(2)}deg` });

/** Entran de a uno al cargar (con un tope, para que el último no tarde). Sin animaciones que sigan después. */
const enter = (i: number): CSSProperties => ({ animationDelay: `${Math.min(i, 12) * 45}ms` });

/**
 * El tablero: las ideas y los errores como post-its sueltos, inclinados y
 * flotando, sin un lienzo que los encierre. Cada uno muestra el principio
 * (todos del mismo tamaño) y al tocarlo se abre entero.
 */
export function SuggestionBoard({
  items,
  loading,
  failed,
  fresh,
  onVote,
  onStatus,
  onRemove,
}: {
  items: Suggestion[];
  loading: boolean;
  failed: boolean;
  /** La que se acaba de mandar: entra con un salto. */
  fresh: string | null;
  onVote: (id: string) => void;
  onStatus: (id: string, status: SuggestionStatus) => void;
  onRemove: (id: string) => Promise<boolean>;
}) {
  const [filter, setFilter] = useState<Filter>("todas");
  const [openId, setOpenId] = useState<string | null>(null);

  const counts = useMemo(
    () => ({
      todas: items.length,
      idea: items.filter((s) => s.kind === "idea").length,
      error: items.filter((s) => s.kind === "error").length,
    }),
    [items]
  );

  // Las hechas van al final: el tablero muestra primero lo que sigue pendiente.
  const shown = useMemo(() => {
    const list = filter === "todas" ? items : items.filter((s) => s.kind === filter);
    return [...list].sort((a, b) => Number(a.status === "hecha") - Number(b.status === "hecha"));
  }, [items, filter]);

  const open = items.find((s) => s.id === openId) ?? null;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="site-label text-ink/50">El tablero</p>
          <p className="mt-2 text-[15px] text-ink/60">
            Lo que el equipo propone y lo que hay que arreglar. Tocá un post-it para leerlo entero o sumarte.
          </p>
        </div>
        <div role="radiogroup" aria-label="Mostrar" className="inline-flex rounded-full border border-ink/20 p-1">
          {(
            [
              ["todas", "Todo"],
              ["idea", "Ideas"],
              ["error", "Errores"],
            ] as [Filter, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={filter === value}
              onClick={() => setFilter(value)}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium text-ink/60 transition-colors hover:text-ink",
                filter === value && "bg-ink text-cream hover:text-cream"
              )}
            >
              {value !== "todas" && (
                <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: NOTE_COLORS[value].bg }} />
              )}
              {label}
              <span className="tabular-nums opacity-55">{counts[value]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-12 flex flex-wrap justify-center gap-x-3 gap-y-10 [--scatter-x:0.3] sm:gap-x-9 sm:gap-y-14 sm:[--scatter-x:1]">
        {loading ? (
          Array.from({ length: 6 }, (_, i) => (
            <div key={i} style={offset(`cargando-${i}`)}>
              <div className="skeleton h-[9.5rem] w-[9.5rem] rotate-[var(--tilt)] rounded-[3px] sm:h-52 sm:w-52" style={tilt(`cargando-${i}`)} />
            </div>
          ))
        ) : failed ? (
          <p className="py-10 text-sm text-ink/55">No se pudo cargar el tablero. Recargá la página en un rato.</p>
        ) : shown.length === 0 ? (
          <div className="grid h-[9.5rem] w-[9.5rem] rotate-[-2deg] place-items-center rounded-[3px] border-2 border-dashed border-ink/20 p-5 text-center text-sm text-ink/50 sm:h-52 sm:w-52">
            {items.length ? "No hay nada de este tipo todavía." : "Todavía no hay nada en el tablero. ¡Estrenalo!"}
          </div>
        ) : (
          shown.map((s, i) => <Note key={s.id} s={s} index={i} fresh={s.id === fresh} onOpen={() => setOpenId(s.id)} />)
        )}
      </div>

      <NoteDialog
        s={open}
        onClose={() => setOpenId(null)}
        onVote={onVote}
        onStatus={onStatus}
        onRemove={async (id) => {
          const ok = await onRemove(id);
          if (ok) setOpenId(null);
        }}
      />
    </div>
  );
}

function Avatar({ s, size = 22 }: { s: Pick<Suggestion, "author_name" | "author_avatar">; size?: number }) {
  const [broken, setBroken] = useState(false);
  if (s.author_avatar && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={s.author_avatar}
        alt=""
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className="shrink-0 rounded-full object-cover ring-1 ring-ink/15"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full bg-ink/10 text-[10px] font-semibold text-ink/60"
      style={{ width: size, height: size }}
    >
      {s.author_name ? s.author_name.trim()[0]?.toUpperCase() : <UserRound className="h-3 w-3" />}
    </span>
  );
}

function StatusBadge({ status }: { status: SuggestionStatus }) {
  if (status === "abierta") return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]",
        status === "hecha" ? "bg-ink/80 text-cream" : "bg-ink text-primary"
      )}
    >
      {status === "hecha" && <Check className="h-3 w-3" />}
      {STATUS_LABEL[status]}
    </span>
  );
}

function Note({ s, index, fresh, onOpen }: { s: Suggestion; index: number; fresh: boolean; onOpen: () => void }) {
  const done = s.status === "hecha";
  return (
    <div style={offset(s.id)}>
      <div
        className={cn(
          "fill-mode-backwards",
          fresh ? "duration-500 animate-in fade-in-0 zoom-in-50" : "duration-500 animate-in fade-in-0 slide-in-from-bottom-3"
        )}
        style={fresh ? undefined : enter(index)}
      >
        <button
          type="button"
          onClick={onOpen}
          aria-label={`${NOTE_COLORS[s.kind].label} de ${s.author_name ?? "alguien anónimo"}: ${s.body.slice(0, 80)}`}
          className={cn(
            "group relative flex h-[9.5rem] w-[9.5rem] rotate-[var(--tilt)] flex-col rounded-[3px] p-3 text-left text-ink transition-[transform,box-shadow,opacity] duration-300 ease-smooth hover:z-10 hover:-translate-y-1.5 hover:rotate-0 hover:scale-[1.05] focus-visible:z-10 focus-visible:rotate-0 sm:h-52 sm:w-52 sm:p-4",
            "shadow-[0_1px_1px_rgba(0,0,0,0.08),0_12px_20px_-12px_rgba(0,0,0,0.45)] hover:shadow-[0_2px_2px_rgba(0,0,0,0.08),0_22px_32px_-14px_rgba(0,0,0,0.5)]",
            done && "opacity-60 saturate-50 hover:opacity-100 hover:saturate-100"
          )}
          style={{ background: NOTE_COLORS[s.kind].bg, ...tilt(s.id) }}
        >
          {/* La cinta que lo "pega". */}
          <span
            aria-hidden
            className="absolute -top-2.5 left-1/2 h-5 w-14 -translate-x-1/2 -rotate-2 rounded-[2px] bg-white/55 shadow-[0_1px_1px_rgba(0,0,0,0.06)]"
          />
          <span className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/55">
              {NOTE_COLORS[s.kind].label}
            </span>
            <StatusBadge status={s.status} />
          </span>
          <span className="mt-1.5 line-clamp-4 break-words text-[12.5px] font-medium leading-snug sm:mt-2 sm:line-clamp-6 sm:text-[14.5px]">
            {s.body}
          </span>
          <span className="mt-auto flex items-center gap-2 pt-2">
            <Avatar s={s} />
            <span className="min-w-0 flex-1 truncate text-[11.5px] text-ink/65">{s.author_name ?? "Anónimo"}</span>
            {s.votos > 0 && (
              <span
                className={cn(
                  "flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
                  s.votada ? "bg-ink text-cream" : "bg-ink/10 text-ink/70"
                )}
              >
                <ThumbsUp className="h-3 w-3" /> {s.votos}
              </span>
            )}
          </span>
        </button>
      </div>
    </div>
  );
}

/** El post-it abierto: el texto entero, quién y cuándo, sumarse y (si podés) estado y borrar. */
function NoteDialog({
  s,
  onClose,
  onVote,
  onStatus,
  onRemove,
}: {
  s: Suggestion | null;
  onClose: () => void;
  onVote: (id: string) => void;
  onStatus: (id: string, status: SuggestionStatus) => void;
  onRemove: (id: string) => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setConfirming(false);
    setRemoving(false);
    setNow(Date.now());
  }, [s?.id]);

  return (
    <DialogPrimitive.Root open={!!s} onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/40 duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        {s && (
          <DialogPrimitive.Content
            className="fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-[4px] p-6 text-ink shadow-[0_30px_60px_-20px_rgba(0,0,0,0.55)] outline-none duration-300 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-90 sm:p-7"
            style={{ background: NOTE_COLORS[s.kind].bg }}
          >
            <span
              aria-hidden
              className="absolute -top-3 left-1/2 h-6 w-20 -translate-x-1/2 -rotate-2 rounded-[2px] bg-white/55"
            />
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/55">
                {NOTE_COLORS[s.kind].label}
              </span>
              <StatusBadge status={s.status} />
              <DialogPrimitive.Close
                aria-label="Cerrar"
                className="ml-auto grid h-8 w-8 place-items-center rounded-full text-ink/60 transition-colors hover:bg-ink/10 hover:text-ink"
              >
                <X className="h-4 w-4" />
              </DialogPrimitive.Close>
            </div>

            <DialogPrimitive.Title className="sr-only">
              {NOTE_COLORS[s.kind].label} de {s.author_name ?? "alguien anónimo"}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description asChild>
              <p className="mt-3 min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap break-words text-[16px] font-medium leading-relaxed">
                {s.body}
              </p>
            </DialogPrimitive.Description>

            <div className="mt-5 flex items-center gap-2.5 border-t border-ink/15 pt-4">
              <Avatar s={s} size={30} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{s.author_name ?? "Anónimo"}</p>
                <p className="text-xs text-ink/55">{timeAgo(s.created_at, now)}</p>
              </div>
              <button
                type="button"
                onClick={() => onVote(s.id)}
                aria-pressed={s.votada}
                className={cn(
                  "flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition",
                  s.votada ? "bg-ink text-cream hover:bg-ink/85" : "bg-ink/10 hover:bg-ink/15"
                )}
              >
                <ThumbsUp className="h-4 w-4" />
                {s.kind === "error" ? "Me pasa también" : "Me sumo"}
                {s.votos > 0 && <span className="tabular-nums opacity-70">· {s.votos}</span>}
              </button>
            </div>

            {(s.can_manage || s.mine) && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {s.can_manage && (
                  <div role="radiogroup" aria-label="Estado" className="inline-flex rounded-full bg-ink/10 p-0.5">
                    {(Object.keys(STATUS_LABEL) as SuggestionStatus[]).map((status) => (
                      <button
                        key={status}
                        type="button"
                        role="radio"
                        aria-checked={s.status === status}
                        onClick={() => onStatus(s.id, status)}
                        className={cn(
                          "h-7 rounded-full px-3 text-xs font-medium text-ink/65 transition-colors hover:text-ink",
                          s.status === status && "bg-ink text-cream hover:text-cream"
                        )}
                      >
                        {STATUS_LABEL[status]}
                      </button>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  disabled={removing}
                  onClick={async () => {
                    if (!confirming) return setConfirming(true);
                    setRemoving(true);
                    await onRemove(s.id);
                    setRemoving(false);
                  }}
                  className={cn(
                    "ml-auto flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors",
                    confirming ? "bg-destructive text-destructive-foreground" : "text-ink/65 hover:bg-ink/10 hover:text-ink"
                  )}
                >
                  {removing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  {confirming ? "¿Seguro? Borrar" : "Borrar"}
                </button>
              </div>
            )}
          </DialogPrimitive.Content>
        )}
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
