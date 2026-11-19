"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Herramienta } from "@/lib/plani/tipos";

/**
 * Las herramientas de la app que usa la presentación que se está viendo (las de su tipo): con
 * "ads" cada pieza se ve con el mockup del anuncio; con "gif" hay banners y se arma su GIF. La
 * ponen el editor, la presentación del estudio y el link del cliente; las piezas la leen.
 */
const Ctx = createContext<Herramienta[]>([]);

export function HerramientasProvider({ value, children }: { value: Herramienta[]; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useHerramientas() {
  const h = useContext(Ctx);
  return { ads: h.includes("ads"), gif: h.includes("gif") };
}
