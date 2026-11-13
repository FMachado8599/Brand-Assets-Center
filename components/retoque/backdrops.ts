import type { CSSProperties } from "react";

/** Sobre qué se ve el PNG sin fondo: el cuadriculado muestra la transparencia; blanco y negro, los bordes. */
export type Backdrop = "checker" | "light" | "dark";

export const BACKDROPS: { value: Backdrop; label: string; style: CSSProperties }[] = [
  {
    value: "checker",
    label: "cuadriculado",
    style: {
      backgroundColor: "#ffffff",
      backgroundImage: "conic-gradient(#e6e2d8 25%, transparent 0 50%, #e6e2d8 0 75%, transparent 0)",
      backgroundSize: "18px 18px",
    },
  },
  { value: "light", label: "blanco", style: { backgroundColor: "#ffffff" } },
  { value: "dark", label: "negro", style: { backgroundColor: "#0b0b0e" } },
];

export const backdropStyle = (value: Backdrop) => (BACKDROPS.find((b) => b.value === value) ?? BACKDROPS[0]).style;
