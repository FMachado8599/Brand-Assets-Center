"use client";

import { createContext, useCallback, useContext } from "react";
import { Clapperboard, CircleDashed, GalleryHorizontalEnd, RectangleHorizontal, Square, type LucideIcon } from "lucide-react";
import { APROBACION, FORMATOS, estadoInfo } from "@/lib/plani/config";
import type { Aprobacion, Formato, Medio, PlaniEstado } from "@/lib/plani/types";
import { cn } from "@/lib/utils";

export const FORMAT_ICONS: Record<Formato, LucideIcon> = {
  post: Square,
  carrusel: GalleryHorizontalEnd,
  reel: Clapperboard,
  historia: CircleDashed,
  banner: RectangleHorizontal,
};

export function FormatIcon({ formato, className }: { formato: Formato; className?: string }) {
  const Icon = FORMAT_ICONS[formato];
  return <Icon className={cn("h-3.5 w-3.5 shrink-0", className)} />;
}

/** El punto de color de cada formato, como en el calendario de la plani de siempre. */
export function FormatDot({ formato, className }: { formato: Formato; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10", className)}
      style={{ background: FORMATOS[formato].color }}
    />
  );
}

export function EstadoPill({ estado, className }: { estado: PlaniEstado; className?: string }) {
  const e = estadoInfo(estado);
  return (
    <span className={cn("inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full bg-secondary px-2.5 text-[11px] font-semibold", className)}>
      <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: e.color }} />
      {e.label}
    </span>
  );
}

export function AprobacionChip({ value, quien, className }: { value: Aprobacion; quien?: string; className?: string }) {
  const a = APROBACION[value];
  return (
    <span className={cn("inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-[11px] font-semibold", a.className, className)}>
      {quien ? `${quien}: ` : ""}
      {a.label}
    </span>
  );
}

const BASE_ESTUDIO = "/api/drive/archivo";

/** La URL de un archivo del Drive del estudio, servido por la app. Con `w`, una miniatura de ese ancho. */
export function medioUrl(medio: Pick<Medio, "drive_id">, w?: number, base = BASE_ESTUDIO) {
  return `${base}/${encodeURIComponent(medio.drive_id)}${w ? `?w=${w}` : ""}`;
}

/**
 * Desde dónde se sirven los archivos: en la app, la ruta del estudio (con sesión); en la página
 * del cliente, la de su link (/api/p/<token>/archivo). Los mockups y el feed la toman de acá.
 */
const MedioBase = createContext(BASE_ESTUDIO);
export const MedioBaseProvider = MedioBase.Provider;

export function useMedioUrl() {
  const base = useContext(MedioBase);
  return useCallback((medio: Pick<Medio, "drive_id">, w?: number) => medioUrl(medio, w, base), [base]);
}

/** La vista es la del cliente: sin indicaciones internas (lo que falta diseñar dice "En diseño"). */
const VistaCliente = createContext(false);
export const VistaClienteProvider = VistaCliente.Provider;
export const useVistaCliente = () => useContext(VistaCliente);

export const esVideo = (m: Pick<Medio, "mime">) => m.mime.startsWith("video/");

export function pesoLegible(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

/** Un nombre de usuario de Instagram plausible a partir del nombre del cliente ("Banco Nación" → "banconacion"). */
export function usuarioDe(nombre: string) {
  return (
    nombre
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9._]+/g, "")
      .slice(0, 28) || "cliente"
  );
}
