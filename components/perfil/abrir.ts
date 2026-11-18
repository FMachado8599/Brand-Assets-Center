"use client";

import { useSyncExternalStore } from "react";

/**
 * Qué perfil de compañero está abierto (el id de su fila del equipo). Cualquier parte del Board o de
 * /perfil lo abre con abrirPerfil(id); el diálogo lo dibuja <PerfilHost />, uno solo por página.
 */
let abierto: string | null = null;
const listeners = new Set<() => void>();

function set(next: string | null) {
  abierto = next;
  listeners.forEach((l) => l());
}

export const abrirPerfil = (personaId: string) => set(personaId);
export const cerrarPerfil = () => set(null);

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function usePerfilAbierto() {
  return useSyncExternalStore(subscribe, () => abierto, () => null);
}
