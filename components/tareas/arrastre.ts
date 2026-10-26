"use client";

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";

/** Dónde se soltó: en qué lista y en qué lugar (contando sin la tarjeta que se arrastra). */
export type Destino = { lista: string; indice: number };

export type Arrastre = { id: string; lista: string; ancho: number; dx: number; dy: number; x: number; y: number };

type Inicio = { id: string; lista: string; x: number; y: number; pointerId: number; tipo: string; rect: DOMRect };

const BORDE = 72;
const VELOCIDAD = 18;
const ESPERA_DEDO = 260;

/**
 * Arrastrar tarjetas entre listas y dentro de una lista, con mouse o con el dedo (sin librerías):
 * - mouse: arranca al moverse unos píxeles; un clic sin mover sigue siendo un clic;
 * - dedo: arranca al mantener apretado un instante, así deslizar sigue scrolleando;
 * - cerca de los bordes scrollea solo: el tablero de costado ([data-scroll-x]) y cada columna
 *   para arriba y abajo ([data-scroll-y]);
 * - Escape cancela.
 * Las listas llevan propsLista(clave) y las tarjetas propsTarjeta(id, clave).
 */
export function useArrastre(onSoltar: (id: string, desde: string, hacia: Destino) => void) {
  const [arrastre, setArrastre] = useState<Arrastre | null>(null);
  const [destino, setDestino] = useState<Destino | null>(null);
  const fantasma = useRef<HTMLDivElement | null>(null);

  // Todo lo que usan los eventos de la ventana vive en refs: los eventos se registran una vez por
  // arrastre y tienen que leer siempre lo último.
  const r = useRef({
    inicio: null as Inicio | null,
    activo: null as Arrastre | null,
    destino: null as Destino | null,
    puntero: { x: 0, y: 0 },
    timer: 0,
    raf: 0,
    soltadoEn: 0,
    onSoltar,
  }).current;
  r.onSoltar = onSoltar;

  // Las funciones se crean una sola vez (mismas referencias para agregar y sacar los eventos).
  const f = useRef<{
    move: (e: PointerEvent) => void;
    up: (e: PointerEvent) => void;
    cancel: () => void;
    key: (e: KeyboardEvent) => void;
    touch: (e: TouchEvent) => void;
    empezar: () => void;
    terminar: (soltar: boolean) => void;
    limpiar: () => void;
    loop: () => void;
  } | null>(null);

  if (!f.current) {
    const calcularDestino = (x: number, y: number): Destino | null => {
      const el = document.elementFromPoint(x, y) as HTMLElement | null;
      const lista = el?.closest<HTMLElement>("[data-lista]");
      if (!lista) return null;
      const tarjetas = [...lista.querySelectorAll<HTMLElement>("[data-arrastre-id]")].filter((t) => t.dataset.arrastreId !== r.activo?.id);
      let indice = tarjetas.length;
      for (let i = 0; i < tarjetas.length; i++) {
        const b = tarjetas[i].getBoundingClientRect();
        if (y < b.top + b.height / 2) {
          indice = i;
          break;
        }
      }
      return { lista: lista.dataset.lista!, indice };
    };

    const autoScroll = (x: number, y: number) => {
      const el = document.elementFromPoint(x, y) as HTMLElement | null;
      const horizontal = el?.closest<HTMLElement>("[data-scroll-x]") ?? document.querySelector<HTMLElement>("[data-scroll-x]");
      if (horizontal) {
        const b = horizontal.getBoundingClientRect();
        if (x < b.left + BORDE) horizontal.scrollLeft -= VELOCIDAD;
        else if (x > b.right - BORDE) horizontal.scrollLeft += VELOCIDAD;
      }
      const vertical = el?.closest<HTMLElement>("[data-scroll-y]");
      if (vertical) {
        const b = vertical.getBoundingClientRect();
        if (y < b.top + BORDE / 2) vertical.scrollTop -= VELOCIDAD / 2;
        else if (y > b.bottom - BORDE / 2) vertical.scrollTop += VELOCIDAD / 2;
      }
    };

    const api = {
      loop: () => {
        const a = r.activo;
        if (!a) return;
        const { x, y } = r.puntero;
        if (fantasma.current) fantasma.current.style.transform = `translate3d(${x - a.dx}px, ${y - a.dy}px, 0) rotate(1.5deg)`;
        autoScroll(x, y);
        const d = calcularDestino(x, y);
        if (d?.lista !== r.destino?.lista || d?.indice !== r.destino?.indice) {
          r.destino = d;
          setDestino(d);
        }
        r.raf = requestAnimationFrame(api.loop);
      },
      limpiar: () => {
        window.clearTimeout(r.timer);
        cancelAnimationFrame(r.raf);
        r.inicio = null;
        r.activo = null;
        r.destino = null;
        setArrastre(null);
        setDestino(null);
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
        window.removeEventListener("pointermove", api.move);
        window.removeEventListener("pointerup", api.up);
        window.removeEventListener("pointercancel", api.cancel);
        window.removeEventListener("keydown", api.key);
        document.removeEventListener("touchmove", api.touch);
      },
      terminar: (soltar: boolean) => {
        const a = r.activo;
        const d = r.destino;
        if (a) r.soltadoEn = Date.now();
        api.limpiar();
        if (a && soltar && d) r.onSoltar(a.id, a.lista, d);
      },
      empezar: () => {
        const i = r.inicio;
        if (!i || r.activo) return;
        const a: Arrastre = { id: i.id, lista: i.lista, ancho: i.rect.width, dx: i.x - i.rect.left, dy: i.y - i.rect.top, x: r.puntero.x, y: r.puntero.y };
        r.activo = a;
        setArrastre(a);
        document.body.style.userSelect = "none";
        document.body.style.cursor = "grabbing";
        r.raf = requestAnimationFrame(api.loop);
      },
      move: (e: PointerEvent) => {
        const i = r.inicio;
        if (!i || e.pointerId !== i.pointerId) return;
        r.puntero = { x: e.clientX, y: e.clientY };
        if (r.activo) return;
        const distancia = Math.hypot(e.clientX - i.x, e.clientY - i.y);
        // Con el dedo, moverse antes de que arranque es scrollear: se suelta.
        if (i.tipo === "touch") {
          if (distancia > 10) api.limpiar();
          return;
        }
        if (distancia > 5) api.empezar();
      },
      up: (e: PointerEvent) => {
        if (!r.inicio || e.pointerId !== r.inicio.pointerId) return;
        api.terminar(true);
      },
      cancel: () => api.terminar(false),
      key: (e: KeyboardEvent) => {
        if (e.key === "Escape") api.terminar(false);
      },
      // Mientras se arrastra con el dedo, la página no scrollea.
      touch: (e: TouchEvent) => {
        if (r.activo) e.preventDefault();
      },
    };
    f.current = api;
  }
  const api = f.current;

  useEffect(() => api.limpiar, [api]);

  const propsTarjeta = (id: string, lista: string) => ({
    "data-arrastre-id": id,
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.button !== 0 || r.inicio) return;
      if ((e.target as HTMLElement).closest("a, button, input, select, textarea, [data-no-arrastrar]")) return;
      r.inicio = { id, lista, x: e.clientX, y: e.clientY, pointerId: e.pointerId, tipo: e.pointerType, rect: e.currentTarget.getBoundingClientRect() };
      r.puntero = { x: e.clientX, y: e.clientY };
      window.addEventListener("pointermove", api.move);
      window.addEventListener("pointerup", api.up);
      window.addEventListener("pointercancel", api.cancel);
      window.addEventListener("keydown", api.key);
      document.addEventListener("touchmove", api.touch, { passive: false });
      if (e.pointerType === "touch") {
        r.timer = window.setTimeout(() => {
          navigator.vibrate?.(12);
          api.empezar();
        }, ESPERA_DEDO);
      }
    },
    // El clic que llega justo después de soltar no abre la tarjeta.
    onClickCapture: (e: ReactMouseEvent) => {
      if (Date.now() - r.soltadoEn < 250) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    onContextMenu: (e: ReactMouseEvent) => {
      if (r.activo || r.inicio?.tipo === "touch") e.preventDefault();
    },
  });

  const propsLista = (lista: string) => ({ "data-lista": lista });

  return { arrastre, destino, fantasma, propsTarjeta, propsLista };
}
