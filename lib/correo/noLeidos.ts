"use client";

import { useSyncExternalStore } from "react";

/**
 * Cuántos mails sin leer hay en Recibidos, para el número de Correo en la sidebar. No mira la casilla
 * todo el tiempo: se pregunta al abrir la sidebar (o al pasar por el botón que la abre), como mucho una
 * vez por minuto. Estando en /correo, la página ya mira la bandeja y avisa lo que ve.
 */

type Estado = {
  /** null: todavía no se sabe, o no hay casilla conectada. */
  noLeidos: number | null;
  /** Cuándo se supo por última vez (o se probó y falló). */
  cuando: number;
  /** De quién es el número: si entra otra cuenta, no vale. */
  de: string | null;
  /** No hay casilla para mirar (sin conectar, sin sesión o de otro dominio): no se vuelve a preguntar. */
  sinCasilla: boolean;
};

const VACIO: Estado = { noLeidos: null, cuando: 0, de: null, sinCasilla: false };
let estado: Estado = VACIO;
const oyentes = new Set<() => void>();
let enCurso: string | null = null;

/** Cada cuánto, como mucho, se le pregunta al servidor de correo. */
const FRESCO = 60_000;

function cambiar(e: Partial<Estado>) {
  estado = { ...estado, ...e };
  oyentes.forEach((f) => f());
}

/** La página del Correo avisa lo que ve en Recibidos (así el número está al día sin preguntar de nuevo). */
export function publicarNoLeidos(de: string, noLeidos: number) {
  cambiar({ noLeidos, cuando: Date.now(), de, sinCasilla: false });
}

/** La casilla no está conectada (o se desconectó): sin número. */
export function sinCasillaCorreo(de: string | null) {
  cambiar({ noLeidos: null, cuando: Date.now(), de, sinCasilla: true });
}

/** Pregunta cuántos hay sin leer, si hace más de un minuto que no se sabe. */
export function refrescarNoLeidos(de: string | null | undefined) {
  if (!de) return;
  // Otra cuenta: lo de la anterior no vale.
  if (estado.de !== de) cambiar({ ...VACIO, de });
  if (estado.sinCasilla || enCurso === de || Date.now() - estado.cuando < FRESCO) return;
  enCurso = de;
  void (async () => {
    try {
      const r = await fetch("/api/correo/estado?carpeta=INBOX", { cache: "no-store" });
      if (estado.de !== de) return;
      if (r.ok) {
        const j = (await r.json()) as { noLeidos?: number };
        cambiar({ noLeidos: Math.max(0, j.noLeidos ?? 0), cuando: Date.now() });
      } else if (r.status === 401 || r.status === 403 || r.status === 409 || r.status === 503) {
        // Sin casilla, contraseña vieja, otro dominio o falta la migración: hasta que la página del Correo lo arregle.
        sinCasillaCorreo(de);
      } else {
        // El servidor de correo no contestó: se vuelve a probar en un minuto, sin borrar el último número.
        cambiar({ cuando: Date.now() });
      }
    } catch {
      /* sin red: se vuelve a probar la próxima vez */
    } finally {
      if (enCurso === de) enCurso = null;
    }
  })();
}

const suscribir = (f: () => void) => {
  oyentes.add(f);
  return () => oyentes.delete(f);
};

/** El número de sin leer de esa cuenta (null si no se sabe o no hay casilla). */
export function useNoLeidosCorreo(de: string | null | undefined): number | null {
  const e = useSyncExternalStore(suscribir, () => estado, () => VACIO);
  return de && e.de === de ? e.noLeidos : null;
}
