"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { activeModule, MODULES } from "@/lib/modules";

/**
 * "Volver": la flecha del principio de la barra, en cada herramienta (ver BotonVolver en
 * components/shell/Volver.tsx).
 *
 * - Si a esta pantalla se llegó navegando dentro de la app, vuelve a la anterior (como el "atrás" del
 *   navegador): de la ficha de un cliente a "Nueva tarjeta" y de vuelta a la ficha.
 * - Si se entró directo (un link, una pestaña nueva, la vuelta de Google o de Basecamp), sube un nivel:
 *   al de arriba de las migas (ver BarMigas) o, en una herramienta, a Inicio.
 *
 * Para saber de dónde se vino, cada entrada del historial guarda en su estado la dirección y el nombre
 * de la pantalla anterior. Así no se confunde con un "atrás" que saldría de la app y sobrevive a recargar
 * la página. Se hace envolviendo history.pushState y replaceState, que es lo que usa el router de Next
 * (y lo que ya envuelve él mismo: los dos envoltorios conviven).
 */

export type Destino = { href: string; titulo: string };

/** La clave en history.state. Larga a propósito: que no la pise nadie. */
const CLAVE = "__herramientasVolver";

export const INICIO: Destino = { href: MODULES[0].href, titulo: MODULES[0].label };

/* ───────────── La pantalla abierta: su nombre y su nivel de arriba ───────────── */

type Pagina = { id: number; path: string; titulo?: string; padre?: Destino };
let pagina: Pagina | null = null;
let ultimoId = 0;

const oyentes = new Set<() => void>();
// Los cambios de historial llegan en medio del commit de React (Next empuja en un useInsertionEffect):
// los avisos salen después, para no actualizar nada durante ese commit.
const avisar = () => queueMicrotask(() => oyentes.forEach((f) => f()));
const suscribir = (f: () => void) => {
  oyentes.add(f);
  return () => oyentes.delete(f);
};

/** El nombre de una dirección para "Volver a …": el que dio su pantalla o el de su herramienta. */
function tituloDe(href: string): string {
  const path = new URL(href, window.location.origin).pathname;
  if (pagina?.path === path && pagina.titulo) return pagina.titulo;
  const modulo = activeModule(path);
  // Lo que no es una herramienta (Privacidad, Entrar…) cae en Inicio: ahí no se sabe el nombre.
  return modulo.href !== "/" || path === "/" ? modulo.label : "";
}

/* ───────────── El historial ───────────── */

type Estado = Record<string, unknown> | null | undefined;

function leerAnterior(state: unknown): Destino | null {
  const v = (state as Estado)?.[CLAVE] as Partial<Destino> | undefined;
  return v && typeof v.href === "string" ? { href: v.href, titulo: typeof v.titulo === "string" ? v.titulo : "" } : null;
}

/** Suma la clave al estado (si es un objeto, como el de Next; con otra cosa no se toca). */
function conAnterior(data: unknown, anterior: Destino | null): unknown {
  if (!anterior) return data;
  if (data === null || data === undefined) return { [CLAVE]: anterior };
  return typeof data === "object" ? { ...(data as object), [CLAVE]: anterior } : data;
}

function instalar() {
  const h = window.history as History & { [CLAVE]?: boolean };
  if (h[CLAVE]) return; // al recargar el módulo en desarrollo, que no se envuelva dos veces
  h[CLAVE] = true;
  const push = h.pushState.bind(h);
  const replace = h.replaceState.bind(h);

  h.pushState = function pushState(data, unused, url) {
    const desde = window.location.pathname + window.location.search;
    const hacia = url == null ? null : new URL(url, window.location.href);
    // Una entrada nueva a la misma dirección no es "otra pantalla": conserva a dónde volvía esta.
    const mismo = !hacia || hacia.pathname + hacia.search === desde;
    const anterior = mismo ? leerAnterior(h.state) : { href: desde, titulo: tituloDe(desde) };
    push(conAnterior(data, anterior), unused, url);
    avisar();
  };

  // Reemplazar (Next lo hace a cada rato, y las páginas al limpiar la dirección) no cambia de dónde se vino.
  h.replaceState = function replaceState(data, unused, url) {
    replace(conAnterior(data, leerAnterior(data) ?? leerAnterior(h.state)), unused, url);
    avisar();
  };

  window.addEventListener("popstate", avisar);
}

if (typeof window !== "undefined") instalar();

/* ───────────── Hooks ───────────── */

// El estado de history devuelve un objeto nuevo a cada reemplazo: se guarda uno igual mientras no cambie.
let anteriorGuardado: Destino | null = null;
function anteriorActual(): Destino | null {
  const a = leerAnterior(window.history.state);
  if (a?.href !== anteriorGuardado?.href || a?.titulo !== anteriorGuardado?.titulo) anteriorGuardado = a;
  return anteriorGuardado;
}

/**
 * Lo que dice de sí misma la pantalla abierta: su nombre (para el "Volver a …" de la que sigue) y su nivel
 * de arriba (a dónde lleva la flecha si se entró directo). Lo usa BarMigas; una pantalla sin migas también
 * puede darse un nombre con esto.
 */
export function usePaginaVolver({ titulo, padre }: { titulo?: string; padre?: Destino }) {
  const pathname = usePathname();
  const padreHref = padre?.href;
  const padreTitulo = padre?.titulo;
  useEffect(() => {
    const id = ++ultimoId;
    pagina = { id, path: pathname, titulo, padre: padreHref ? { href: padreHref, titulo: padreTitulo ?? "" } : undefined };
    avisar();
    return () => {
      if (pagina?.id !== id) return;
      pagina = null;
      avisar();
    };
  }, [pathname, titulo, padreHref, padreTitulo]);
}

/** A dónde lleva la flecha de volver en esta pantalla, y la acción. */
export function useVolver() {
  const router = useRouter();
  const pathname = usePathname();
  const anterior = useSyncExternalStore(suscribir, anteriorActual, () => null);
  const actual = useSyncExternalStore(
    suscribir,
    () => pagina,
    () => null
  );
  const padre = actual?.path === pathname && actual.padre ? actual.padre : INICIO;
  return {
    destino: anterior ?? padre,
    volver: () => (anterior ? router.back() : router.push(padre.href)),
  };
}
