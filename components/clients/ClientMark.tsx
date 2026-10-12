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
 */
export function ClientMark({
  brand,
  className,
  pad = "p-[14%]",
}: {
  brand: Pick<Brand, "name" | "color" | "logo_url" | "logo_bg">;
  className?: string;
  /** Aire alrededor del logo. */
  pad?: string;
}) {
  if (brand.logo_url) {
    return (
      <span
        className={cn("grid shrink-0 place-items-center overflow-hidden ring-1 ring-inset ring-black/[0.06]", className)}
        style={{ background: logoBackground(brand) }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={brand.logo_url} alt="" draggable={false} className={cn("h-full w-full object-contain", pad)} />
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
