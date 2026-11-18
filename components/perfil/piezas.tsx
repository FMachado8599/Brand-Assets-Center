"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Plane } from "lucide-react";
import { initials } from "@/lib/clients/color";
import { estadoVigente, fueraDeOficina, textoFuera, type Perfil } from "@/lib/perfil";
import { cn } from "@/lib/utils";

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
