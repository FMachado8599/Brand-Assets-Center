"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Plane } from "lucide-react";
import { SocialIcon } from "@/components/clients/SocialIcon";
import { Hint } from "@/components/ui/tooltip";
import { initials } from "@/lib/clients/color";
import { conAlfa, estadoVigente, fueraDeOficina, REDES_PERFIL, textoDeRed, textoFuera, type Perfil, type RedPerfil, type Redes } from "@/lib/perfil";
import { cn } from "@/lib/utils";
import portadaEstudio from "./portada.webp";

/** El fondo de la imagen del estudio: lo que sobra alrededor se pinta igual y no se nota el corte. */
const FONDO_PORTADA = "#E5E5DD";

/**
 * La portada de un perfil: la del estudio (por defecto) o, si eligió "Tu color", un degradé con su
 * acento. La imagen se ve entera (es ancha y tiene texto: recortarla lo cortaría).
 */
export function Portada({ perfil, className }: { perfil: Perfil | null | undefined; className?: string }) {
  const acento = perfil?.acento;
  if (perfil?.portada === "color" && acento) {
    return (
      <div
        aria-hidden
        className={cn("aspect-[1128/191] w-full", className)}
        style={{ background: `linear-gradient(120deg, ${conAlfa(acento, 0.95)}, ${conAlfa(acento, 0.45)} 60%, ${conAlfa(acento, 0.2)})` }}
      />
    );
  }
  return (
    <div aria-hidden className={cn("aspect-[1128/191] w-full overflow-hidden", className)} style={{ background: FONDO_PORTADA }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={portadaEstudio.src} alt="" className="h-full w-full object-contain" />
    </div>
  );
}

/** El puesto, destacado: una píldora por puesto (con su color de acento, si tiene). */
export function PuestoPills({ puestos, acento, className }: { puestos: string[]; acento?: string | null; className?: string }) {
  if (!puestos.length) return null;
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {puestos.map((p) => (
        <span
          key={p}
          className="inline-flex items-center rounded-full bg-foreground px-3 py-1 text-[13px] font-semibold text-background"
          style={acento ? { background: acento, color: "#fff" } : undefined}
        >
          {p}
        </span>
      ))}
    </div>
  );
}

/** El logo de Behance (no está en los íconos de Clientes), relleno con el color del texto. */
function BehanceIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden focusable={false} fill="currentColor" className={cn("h-4 w-4 shrink-0", className)}>
      <path d="M7.8 5.1c.8 0 1.5.1 2.1.2.6.1 1.1.3 1.6.6.4.3.8.7 1 1.2.2.5.3 1.1.3 1.8 0 .8-.2 1.4-.5 1.9-.4.5-.9.9-1.5 1.2.9.3 1.6.7 2 1.4.4.6.7 1.4.7 2.3 0 .7-.1 1.4-.4 1.9-.3.5-.7 1-1.2 1.3-.5.3-1.1.6-1.7.7-.6.2-1.3.2-1.9.2H0V5.1h7.8Zm-.4 5.6c.6 0 1.1-.1 1.5-.4.4-.3.6-.8.6-1.4 0-.4-.1-.7-.2-.9-.1-.2-.3-.4-.5-.5-.2-.1-.5-.2-.8-.3-.3 0-.6-.1-.9-.1H3.3v3.6h4.1Zm.2 5.9c.3 0 .7 0 1-.1.3-.1.6-.2.8-.4.2-.2.4-.4.6-.7.1-.3.2-.7.2-1.1 0-.8-.2-1.4-.7-1.8-.5-.4-1.1-.5-1.9-.5H3.3v4.6h4.3ZM16.6 16.5c.5.5 1.2.7 2.1.7.6 0 1.2-.2 1.6-.5.5-.3.7-.7.8-1h2.7c-.4 1.3-1.1 2.3-2 2.9-.9.6-2 .9-3.2.9-.9 0-1.6-.1-2.3-.4-.7-.3-1.3-.7-1.8-1.2s-.9-1.1-1.1-1.9c-.3-.7-.4-1.5-.4-2.4 0-.8.1-1.6.4-2.3.3-.7.7-1.3 1.2-1.9.5-.5 1.1-.9 1.8-1.2.7-.3 1.5-.5 2.3-.5.9 0 1.7.2 2.4.5.7.4 1.2.8 1.7 1.5.4.6.8 1.3.9 2.1.2.8.3 1.6.2 2.5h-8c0 .9.3 1.6.7 2.1Zm3.4-5.8c-.4-.4-1-.6-1.8-.6-.5 0-.9.1-1.2.3-.3.2-.6.4-.8.6-.2.2-.3.5-.4.8-.1.3-.1.5-.1.7h5c-.2-.8-.4-1.4-.7-1.8ZM15.2 5.9h6.2v1.5h-6.2V5.9Z" />
    </svg>
  );
}

export function RedIcon({ red, className }: { red: RedPerfil; className?: string }) {
  if (red === "behance") return <BehanceIcon className={className} />;
  return <SocialIcon network={red} className={className} />;
}

/** Sus redes, como botoncitos que abren el link en otra pestaña. */
export function RedesLinks({ redes, className, size = "md" }: { redes: Redes | undefined; className?: string; size?: "sm" | "md" }) {
  const cargadas = REDES_PERFIL.filter((r) => redes?.[r.id]);
  if (!cargadas.length) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {cargadas.map((r) => {
        const url = redes![r.id]!;
        return (
          <Hint key={r.id} label={`${r.nombre}: ${textoDeRed(r.id, url)}`}>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${r.nombre}: ${textoDeRed(r.id, url)}`}
              className={cn(
                "grid place-items-center rounded-full border bg-card text-muted-foreground shadow-sm transition-colors hover:border-foreground/30 hover:text-foreground",
                size === "sm" ? "h-8 w-8" : "h-9 w-9"
              )}
            >
              <RedIcon red={r.id} />
            </a>
          </Hint>
        );
      })}
    </div>
  );
}

/**
 * Una foto de perfil: la imagen o, si no hay (o no carga), las iniciales. Con acento, un aro de ese
 * color; fuera de oficina, la marca del avión abajo a la derecha.
 */
export function FotoPerfil({
  nombre,
  url,
  acento,
  fuera,
  size = 40,
  className,
}: {
  nombre: string;
  url?: string | null;
  acento?: string | null;
  fuera?: boolean;
  size?: number;
  className?: string;
}) {
  const [rota, setRota] = useState(false);
  useEffect(() => setRota(false), [url]);
  const aro = acento ? { boxShadow: `0 0 0 ${Math.max(2, Math.round(size / 28))}px hsl(var(--card)), 0 0 0 ${Math.max(4, Math.round(size / 14))}px ${acento}` } : undefined;
  return (
    <span className={cn("relative inline-block shrink-0 rounded-full", className)} style={{ width: size, height: size, ...aro }}>
      {url && !rota ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setRota(true)}
          className="h-full w-full rounded-full bg-secondary object-cover"
        />
      ) : (
        <span
          className="grid h-full w-full place-items-center rounded-full font-semibold"
          style={{
            fontSize: size * 0.36,
            background: acento ?? "hsl(var(--secondary))",
            color: acento ? "#fff" : "hsl(var(--muted-foreground))",
          }}
        >
          {initials(nombre)}
        </span>
      )}
      {fuera && (
        <span
          title="Fuera de oficina"
          className="absolute -bottom-0.5 -right-0.5 grid place-items-center rounded-full bg-amber-400 text-amber-950 ring-2 ring-card"
          style={{ width: Math.max(14, size * 0.34), height: Math.max(14, size * 0.34) }}
        >
          <Plane style={{ width: "60%", height: "60%" }} strokeWidth={2.5} />
        </span>
      )}
    </span>
  );
}

/** El estado de alguien en una línea: "🎧 En foco". Fuera de oficina va primero y en ámbar. */
export function EstadoLinea({ perfil, className, vacio }: { perfil: Perfil | null | undefined; className?: string; vacio?: ReactNode }) {
  const estado = estadoVigente(perfil);
  const fuera = fueraDeOficina(perfil);
  if (!estado && !fuera) return vacio ? <p className={cn("text-sm text-muted-foreground", className)}>{vacio}</p> : null;
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {fuera && <FueraChip hasta={fuera} />}
      {estado && (
        <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-[13px] font-medium">
          {estado.emoji && <span className="text-base leading-none">{estado.emoji}</span>}
          {estado.texto && <span className="truncate">{estado.texto}</span>}
        </span>
      )}
    </div>
  );
}

export function FueraChip({ hasta, className }: { hasta: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-[13px] font-medium text-amber-900", className)}>
      <Plane className="h-3.5 w-3.5" /> {textoFuera(hasta)}
    </span>
  );
}

/**
 * El estado en chico, para el Board (al lado del nombre en cada fila): solo si hay algo que decir.
 * Fuera de oficina gana: es lo que importa antes de pasarle una tarea.
 */
export function EstadoChip({ perfil, className }: { perfil: Perfil | null | undefined; className?: string }) {
  const fuera = fueraDeOficina(perfil);
  const estado = estadoVigente(perfil);
  if (fuera) {
    return (
      <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900", className)}>
        <Plane className="h-3 w-3" /> {textoFuera(fuera).replace("Fuera de oficina", "Fuera")}
      </span>
    );
  }
  if (!estado) return null;
  return (
    <span
      title={[estado.emoji, estado.texto].filter(Boolean).join(" ")}
      className={cn("inline-flex min-w-0 max-w-[14rem] shrink items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-foreground/80", className)}
    >
      {estado.emoji && <span className="text-[13px] leading-none">{estado.emoji}</span>}
      {estado.texto && <span className="truncate">{estado.texto}</span>}
    </span>
  );
}

/** Una persona chiquita y tocable (jefes, compañeros): foto + nombre. */
export function PersonaChip({
  nombre,
  url,
  fuera,
  detalle,
  onClick,
}: {
  nombre: string;
  url?: string | null;
  fuera?: boolean;
  detalle?: string;
  onClick?: () => void;
}) {
  const cuerpo = (
    <>
      <FotoPerfil nombre={nombre} url={url} fuera={fuera} size={24} />
      <span className="min-w-0 text-left">
        <span className="block truncate text-[13px] font-medium leading-tight">{nombre}</span>
        {detalle && <span className="block truncate text-[11px] leading-tight text-muted-foreground">{detalle}</span>}
      </span>
    </>
  );
  const cls = "inline-flex max-w-full items-center gap-2 rounded-full border bg-card py-1 pl-1 pr-3";
  if (!onClick) return <span className={cls}>{cuerpo}</span>;
  return (
    <button type="button" onClick={onClick} className={cn(cls, "transition-colors hover:border-foreground/30 hover:bg-secondary/50")}>
      {cuerpo}
    </button>
  );
}
