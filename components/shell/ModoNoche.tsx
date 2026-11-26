"use client";

import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useStoredState } from "@/hooks/useStoredState";
import { aplicarModoNoche, MODO_NOCHE_KEY, siempreDeDia } from "@/lib/tema";

type ModoNoche = { noche: boolean; setNoche: (noche: boolean) => void };

const ModoNocheContext = createContext<ModoNoche | null>(null);

/**
 * El modo noche de toda la app, menos lo que ve el cliente (lib/tema.ts). Va adentro de AccountProvider:
 * con sesión se guarda en la cuenta y te sigue a cualquier computadora.
 */
export function ModoNocheProvider({ children }: { children: ReactNode }) {
  const [noche, setNoche, loaded] = useStoredState<boolean>(MODO_NOCHE_KEY, false);
  const deDia = siempreDeDia(usePathname());

  // Hasta leer lo guardado no se toca nada: el script del <head> ya lo puso antes de pintar.
  useEffect(() => {
    if (loaded) aplicarModoNoche(noche === true && !deDia);
  }, [noche, loaded, deDia]);

  const value = useMemo(() => ({ noche: noche === true, setNoche }), [noche, setNoche]);
  return <ModoNocheContext.Provider value={value}>{children}</ModoNocheContext.Provider>;
}

export function useModoNoche() {
  return useContext(ModoNocheContext);
}
