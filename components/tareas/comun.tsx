"use client";

import { usePathname, useRouter } from "next/navigation";
import { Columns3, Network, Rows3 } from "lucide-react";
import { BarSegmented } from "@/components/shell/ContextBar";
import { initials } from "@/lib/clients/color";
import { cn } from "@/lib/utils";

/** Las pestañas del Board, en la barra de arriba. */
const PESTANAS = [
  { value: "/board", label: "Mi tablero", icon: Columns3 },
  { value: "/board/equipo", label: "Equipo", icon: Rows3 },
  { value: "/board/organizacion", label: "Organización", icon: Network },
  { value: "/board/basecamp", label: "Basecamp", icon: BasecampGlyph },
] as const;

type Pestana = (typeof PESTANAS)[number]["value"];

export function BoardNav() {
  const router = useRouter();
  const pathname = usePathname();
  const actual = (PESTANAS.find((p) => p.value !== "/board" && pathname.startsWith(p.value))?.value ?? "/board") as Pestana;
  return (
    <BarSegmented<Pestana>
      label="Secciones del Board"
      value={actual}
      onChange={(v) => router.push(v)}
      options={PESTANAS.map((p) => ({ ...p }))}
    />
  );
}

export function hace(iso: string | null | undefined) {
  if (!iso) return "nunca";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  return new Date(iso).toLocaleDateString("es-UY", { day: "numeric", month: "short" });
}

/* El logo oficial de Basecamp (dashboardicons.com/icons/basecamp): la burbuja amarilla y, encima, el
   aro y la montaña. */
const BC_FONDO =
  "M483.7,318.2c-11.6-77.8-65.4-231.6-187-259.4c-1.5-0.3-2.9-0.6-4.4-0.9l-1-0.2C278,55,264.4,54,250.7,54.7c-3.7,0.2-7.4,0.4-11.1,1.1C173.9,63.1,120.9,96.1,82,154c-18.2,27.1-33.4,60-45.2,97.9c-2.4,7.5-4.6,15.4-6.8,23.6c-4,11.8-3,24.8,2.9,36c6.3,12,17.3,20.8,30.4,24.3c2,0.6,4,1.1,6,1.5c-0.1,0.3-0.2,0.6-0.3,0.9l-0.6,2.3c-3.9,18.3,2.4,36.7,16,47.6c13.8,13,29.1,24.5,45.5,34.1c39.3,22.9,83.4,34.3,128.5,33.5l1,1.7l19.1-1.6c94.2-7.9,163.3-43,195.5-99.2l4.2-3.5l1.6-6.5C484,337.9,485.4,328,483.7,318.2z";
const BC_ARO =
  "M449.8,325.1c0,0.1,0,0.2-0.1,0.2c-2.7,4.1-7.2,7.1-12.9,7.6l-0.9,0.4c-9.6,0.8-17.6-6-19.4-15.5c-13.8-90.4-74.3-214-166.1-206.3c-2.7,0.2-5.4,0.5-8.1,0.9c-71.7,9.6-121.5,67-148.9,170.7c-0.7,3.1-2.2,5.9-4.3,8c-4.4,4.7-11.3,6.9-18.1,4.4c-9.8-2.3-16-12.4-12.4-21.4c2.1-8.1,4.3-15.9,6.7-23.5c11-35.2,24.8-65.2,41.4-89.9c34.7-51.7,81.6-80.3,140.5-85.2c1.7-0.1,3.4-0.3,5.1-0.3C370.9,69.7,438,216.2,452.2,312.6C453,317,452.1,321.5,449.8,325.1z";
const BC_MONTANA =
  "M451.6,312.5c0.3,3.1-0.3,7.5-1.3,10.7c-0.2,0.4-0.4,0.7-0.6,1.1c0,0.1,0,0.2-0.1,0.2c-24.8,50.2-86.5,82.6-174.5,89.9c-0.7-1.2-2.6-1-3.8-0.9c-44.2,3.7-88.5-6.4-126.6-28.6c-14.7-8.6-28.4-18.9-41-30.9c-5.6-3.9-7.2-11.2-5.8-17.6c1.6-5.6,3.8-12.6,6.4-20.3c12.1-35.3,34.4-85.4,66.4-88.9c20.1-1.7,36.3,12.9,48.8,24.6c3.5,4.1,9.2,8.9,13.7,11.6c8.8-10.4,24.3-41.3,35.3-73c3.5-9.9,13.8-13.9,23.7-10.4c9.9,3.5,13.9,13.8,10.4,23.7c-34.7,95.4-56.6,97.2-65.3,98c-17,1.4-29.5-10.3-42.3-22c-5.7-4.8-17.2-15.7-21.5-15.3c-9.5,1.7-26.9,36.2-37.6,72.3c37.9,32,86.8,46.9,135.2,41.9c42.4-3.5,116.6-17.2,143.4-65.2c-16-90.2-76-208.5-165.7-201c-2.3,0.2-4.5-0.1-6.6-0.8c-6.8-2.2-12.2-8.4-12.8-15.7c-0.3-3,0.3-6,1.5-8.8l0,0c2.7-6.1,8.5-11,15.7-11.6c1.5-0.1,3-0.2,4.5-0.3C370,69,437.3,215.9,451.6,312.5z";

/** El logo de Basecamp a color: para donde se habla de Basecamp (la tarjeta de la conexión). */
export function BasecampMark({ className }: { className?: string }) {
  return (
    <svg viewBox="16 16 480 480" aria-hidden className={cn("h-4 w-4 shrink-0", className)}>
      <path fill="#FFD60A" d={BC_FONDO} />
      <path fill="#1D2D35" d={BC_ARO} />
      <path fill="#1D2D35" d={BC_MONTANA} />
    </svg>
  );
}

/**
 * El mismo logo en un solo color (el del texto), con el peso de los íconos de lucide: para pestañas,
 * botones y links a Basecamp, donde va al lado de otros íconos.
 */
export function BasecampGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="25 15 460 460" fill="currentColor" aria-hidden className={cn("h-4 w-4 shrink-0", className)}>
      <path d={BC_ARO} />
      <path d={BC_MONTANA} />
    </svg>
  );
}

/** La foto de Basecamp de una persona, o sus iniciales si no tiene. */
export function Avatar({ nombre, url, className }: { nombre: string; url?: string | null; className?: string }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" title={nombre} className={cn("h-7 w-7 shrink-0 rounded-full bg-secondary object-cover", className)} />;
  }
  return (
    <span
      title={nombre}
      className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full bg-secondary text-[10px] font-semibold text-muted-foreground", className)}
    >
      {initials(nombre)}
    </span>
  );
}
