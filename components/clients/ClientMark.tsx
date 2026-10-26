"use client";

import { inkOn, initials } from "@/lib/clients/color";
import type { Brand, LogoBg } from "@/lib/types";
import { cn } from "@/lib/utils";

/** El fondo detrás del logo, según lo que se eligió en la ficha. */
export function logoBackground(brand: Pick<Brand, "color" | "logo_bg">, bg: LogoBg = brand.logo_bg ?? "light") {
  if (bg === "dark") return "#0b0b0e";
  if (bg === "brand") return brand.color;
  return "#ffffff";
}

/**
 * La cara de un cliente: su logo sobre el fondo elegido o, si todavía no
 * tiene, sus iniciales sobre su color. El tamaño y el redondeo los da quien
 * lo usa (className).
 *
 * Si el logo es la foto de perfil de una de sus redes, se muestra como en la
 * red: redonda y sin aire (la foto ya trae su fondo y su margen).
 */
export function ClientMark({
  brand,
  className,
  pad = "p-[14%]",
  photoPad,
}: {
  brand: Pick<Brand, "name" | "color" | "logo_url" | "logo_bg" | "logo_from">;
  className?: string;
  /** Aire alrededor del logo. */
  pad?: string;
  /** Aire alrededor de la foto de perfil; sin nada, ocupa todo el alto. */
  photoPad?: string;
}) {
  if (brand.logo_url) {
    const photo = !!brand.logo_from;
    return (
      <span
        className={cn(
          "grid shrink-0 place-items-center overflow-hidden ring-1 ring-inset ring-black/[0.06]",
          // La fila mide lo que el recuadro: si no, el h-full de la foto toma su alto natural (720 px) y se sale.
          photo && "grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)]",
          photo && photoPad,
          className
        )}
        style={{ background: logoBackground(brand) }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={brand.logo_url}
          alt=""
          draggable={false}
          className={photo ? "aspect-square h-full max-w-full rounded-full object-cover" : cn("h-full w-full object-contain", pad)}
        />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={cn("grid shrink-0 select-none place-items-center overflow-hidden font-display leading-none", className)}
      style={{ background: brand.color, color: inkOn(brand.color) }}
    >
      {initials(brand.name)}
    </span>
  );
}
