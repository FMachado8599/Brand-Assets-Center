"use client";

import { useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { AtSign, Hash, Link2, MapPin } from "lucide-react";
import { imageUrl } from "@/lib/emojis/types";
import { aDate } from "@/lib/plani/fechas";
import type { Sticker } from "@/lib/plani/types";
import { cn } from "@/lib/utils";

/**
 * Los stickers de una historia de Instagram, dibujados a mano para que se vean como en la app
 * (link, encuesta, pregunta, cuenta regresiva, mención, ubicación, hashtag y slider). Se dibujan
 * a un tamaño fijo y se escalan con la pieza: todo se mide en "em" sobre el ancho del mockup.
 */

const GRADIENTE = "linear-gradient(90deg, #8a3ab9, #e95950 45%, #fccc63)";

function Pill({ children, className, style }: { children: React.ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <span
      className={cn("inline-flex items-center gap-[0.35em] whitespace-nowrap rounded-[0.5em] bg-white px-[0.6em] py-[0.38em] font-bold uppercase shadow-[0_0.1em_0.4em_rgba(0,0,0,0.18)]", className)}
      style={style}
    >
      {children}
    </span>
  );
}

const textoGradiente: CSSProperties = { backgroundImage: GRADIENTE, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" };

/** Días, horas y minutos entre la fecha de la historia y la del evento. */
function faltan(desde: string, hasta?: string) {
  if (!hasta) return { d: 0, h: 0, m: 0 };
  const ms = Math.max(0, aDate(hasta).getTime() - aDate(desde).getTime());
  const d = Math.floor(ms / 86_400_000);
  return { d, h: 0, m: 0 };
}

/** El emoji del sticker con la imagen de Apple (la misma del módulo Emojis); si no hay id, el carácter. */
function Emoji({ s, fallback, className }: { s: Sticker; fallback: string; className?: string }) {
  if (s.emojiId) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={imageUrl(s.emojiId)} alt={s.emoji ?? ""} draggable={false} className={cn("inline-block h-[1em] w-[1em]", className)} />;
  }
  return <span className={className}>{s.emoji || fallback}</span>;
}

export function StickerBody({ s, fechaPieza, usuario }: { s: Sticker; fechaPieza: string; usuario: string }) {
  switch (s.tipo) {
    case "reaccion":
      return (
        <span className="flex flex-col items-center gap-[0.35em] rounded-[1em] bg-white px-[0.7em] pb-[0.5em] pt-[0.6em] text-[0.6em] shadow-[0_0.15em_0.6em_rgba(0,0,0,0.2)]">
          <Emoji s={s} fallback="😍" className="text-[3.2em] leading-none" />
          {s.texto && <span className="max-w-[9em] text-center text-[0.95em] font-bold leading-tight text-black">{s.texto}</span>}
        </span>
      );
    case "link":
      return (
        <Pill className="text-[0.62em] text-[#3a7bfd]">
          <Link2 className="h-[1.2em] w-[1.2em]" strokeWidth={2.6} />
          {s.texto || (s.url ? s.url.replace(/^https?:\/\/(www\.)?/, "").split("/")[0] : "Link")}
        </Pill>
      );
    case "mencion":
      return (
        <Pill className="text-[0.62em]">
          <span style={textoGradiente} className="flex items-center gap-[0.2em]">
            <AtSign className="h-[1.1em] w-[1.1em] text-[#d6249f]" strokeWidth={2.8} />
            {(s.texto || usuario).replace(/^@/, "")}
          </span>
        </Pill>
      );
    case "ubicacion":
      return (
        <Pill className="text-[0.62em] text-[#8a3ab9]">
          <MapPin className="h-[1.15em] w-[1.15em]" strokeWidth={2.6} />
          <span style={textoGradiente}>{s.texto || "Montevideo"}</span>
        </Pill>
      );
    case "hashtag":
      return (
        <Pill className="text-[0.62em]">
          <Hash className="h-[1.1em] w-[1.1em] text-[#e95950]" strokeWidth={2.8} />
          <span style={textoGradiente}>{(s.texto || "hashtag").replace(/^#/, "")}</span>
        </Pill>
      );
    case "encuesta": {
      const opciones = s.opciones?.length ? s.opciones : ["Sí", "No"];
      return (
        <span className="flex w-[11em] flex-col gap-[0.4em] rounded-[0.8em] bg-white p-[0.6em] text-[0.6em] shadow-[0_0.15em_0.6em_rgba(0,0,0,0.2)]">
          {s.texto && <span className="px-[0.2em] text-center text-[1.1em] font-bold leading-tight text-black">{s.texto}</span>}
          {opciones.slice(0, 4).map((o, i) => (
            <span key={i} className="rounded-full bg-[#efefef] px-[0.8em] py-[0.45em] text-center font-semibold text-black">
              {o || `Opción ${i + 1}`}
            </span>
          ))}
        </span>
      );
    }
    case "pregunta":
      return (
        <span className="flex w-[11em] flex-col overflow-hidden rounded-[0.8em] text-[0.6em] shadow-[0_0.15em_0.6em_rgba(0,0,0,0.2)]">
          <span className="px-[0.8em] pb-[0.6em] pt-[0.8em] text-center text-[1.05em] font-bold leading-tight text-white" style={{ background: GRADIENTE }}>
            {s.texto || "Hacenos una pregunta"}
          </span>
          <span className="bg-white px-[0.8em] py-[0.7em] text-center text-[0.95em] text-black/40">Escribí algo…</span>
        </span>
      );
    case "cuenta": {
      const f = faltan(fechaPieza, s.fecha);
      const dig = (n: number) => String(n).padStart(2, "0").split("");
      const grupos = [dig(f.d), dig(f.h), dig(f.m)];
      return (
        <span className="flex w-[12em] flex-col gap-[0.4em] rounded-[0.8em] bg-white p-[0.6em] text-[0.6em] shadow-[0_0.15em_0.6em_rgba(0,0,0,0.2)]">
          <span className="text-[0.95em] font-bold uppercase tracking-wide text-black">{s.texto || "Cuenta regresiva"}</span>
          <span className="flex items-center justify-center gap-[0.25em]">
            {grupos.map((g, gi) => (
              <span key={gi} className="flex items-center gap-[0.15em]">
                {gi > 0 && <span className="px-[0.1em] font-bold text-black">:</span>}
                {g.map((d, di) => (
                  <span key={di} className="grid h-[1.9em] w-[1.35em] place-items-center rounded-[0.25em] bg-[#efefef] text-[1.1em] font-bold text-black">
                    {d}
                  </span>
                ))}
              </span>
            ))}
          </span>
          <span className="flex justify-around text-[0.7em] text-black/50">
            <span>días</span>
            <span>horas</span>
            <span>minutos</span>
          </span>
        </span>
      );
    }
    case "slider":
      return (
        <span className="flex w-[11em] flex-col gap-[0.6em] rounded-[0.8em] bg-white p-[0.7em] text-[0.6em] shadow-[0_0.15em_0.6em_rgba(0,0,0,0.2)]">
          <span className="text-center text-[1.05em] font-bold leading-tight text-black">{s.texto || "¿Cuánto te gusta?"}</span>
          <span className="relative h-[0.45em] rounded-full" style={{ background: GRADIENTE }}>
            <Emoji s={s} fallback="😍" className="absolute left-[60%] top-1/2 -translate-x-1/2 -translate-y-1/2 text-[1.9em] leading-none" />
          </span>
        </span>
      );
  }
}

/**
 * La capa de stickers sobre una historia. Con `onChange`, se pueden arrastrar (y `selected`
 * marca el que se está editando); sin él, solo se muestran.
 */
export function StickerLayer({
  stickers,
  fechaPieza,
  usuario,
  onChange,
  selected,
  onSelect,
}: {
  stickers: Sticker[];
  fechaPieza: string;
  usuario: string;
  onChange?: (next: Sticker[]) => void;
  selected?: string | null;
  onSelect?: (id: string | null) => void;
}) {
  const layer = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);

  const start = (e: ReactPointerEvent, s: Sticker) => {
    if (!onChange || !layer.current) return;
    e.preventDefault();
    e.stopPropagation();
    onSelect?.(s.id);
    const r = layer.current.getBoundingClientRect();
    drag.current = { id: s.id, dx: e.clientX - (r.left + (s.x / 100) * r.width), dy: e.clientY - (r.top + (s.y / 100) * r.height) };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const move = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d || !layer.current || !onChange) return;
    const r = layer.current.getBoundingClientRect();
    const x = Math.min(98, Math.max(2, ((e.clientX - d.dx - r.left) / r.width) * 100));
    const y = Math.min(98, Math.max(2, ((e.clientY - d.dy - r.top) / r.height) * 100));
    onChange(stickers.map((s) => (s.id === d.id ? { ...s, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 } : s)));
  };

  const end = () => {
    drag.current = null;
  };

  return (
    <div
      ref={layer}
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
      // El tamaño de letra sigue al ancho de la pieza: los stickers escalan con el mockup.
      style={{ containerType: "inline-size" }}
    >
      {stickers.map((s) => (
        <div
          key={s.id}
          role={onChange ? "button" : undefined}
          aria-label={onChange ? `Sticker ${s.tipo}: arrastrá para moverlo` : undefined}
          onPointerDown={(e) => start(e, s)}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          className={cn(
            "absolute select-none leading-none",
            onChange && "pointer-events-auto",
            onChange && "cursor-grab touch-none active:cursor-grabbing",
            onChange && selected === s.id && "outline outline-2 outline-offset-4 outline-primary [border-radius:0.6em]"
          )}
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            fontSize: "clamp(8px, 5.6cqw, 36px)",
            transform: `translate(-50%, -50%) scale(${s.escala}) rotate(${s.rotacion ?? 0}deg)`,
          }}
        >
          <StickerBody s={s} fechaPieza={fechaPieza} usuario={usuario} />
        </div>
      ))}
    </div>
  );
}

/** Un sticker nuevo en el medio de la pieza, con textos de ejemplo. */
export function stickerNuevo(tipo: Sticker["tipo"]): Sticker {
  const base = { id: crypto.randomUUID(), tipo, x: 50, y: 62, escala: 1 };
  switch (tipo) {
    case "link":
      return { ...base, texto: "Comprá acá", url: "" };
    case "encuesta":
      return { ...base, texto: "¿Vos qué preferís?", opciones: ["Sí", "No"] };
    case "pregunta":
      return { ...base, texto: "Hacenos una pregunta" };
    case "cuenta":
      return { ...base, texto: "Cuenta regresiva", fecha: "" };
    case "slider":
      return { ...base, texto: "¿Cuánto te gusta?", emoji: "😍", emojiId: "1f60d" };
    case "reaccion":
      return { ...base, texto: "", emoji: "😍", emojiId: "1f60d" };
    default:
      return { ...base, texto: "" };
  }
}
