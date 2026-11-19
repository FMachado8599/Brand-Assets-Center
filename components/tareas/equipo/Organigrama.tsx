"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import { cambiarEquipo } from "@/hooks/useEquipo";
import { equipoRepo, type EquipoData, type Hub, type Nivel, type Persona } from "@/lib/board/equipo";
import { fold } from "@/lib/redaccion/text";
import { cn } from "@/lib/utils";
import { useArrastre, type Destino } from "../arrastre";
import { Avatar } from "../comun";
import { PersonaDialog } from "./PersonaDialog";

/* ───────────── Medidas ───────────── */

const W = 216; // ancho de una tarjeta
const H = 76; // alto de una tarjeta
const GAP_X = 22; // entre tarjetas de una misma fila
const GAP_Y = 64; // entre filas
const GAP_PILA = 10; // entre tarjetas apiladas
const PAD = 12; // relleno del recuadro de un equipo de cliente
const CABEZA = 30; // título del recuadro

const SIN = "__sin";
const RAIZ = "__raiz";
const ARBOL = "__arbol";
const EQUIPO = "equipo:";

/** Un color por sector, para ver de un vistazo de qué es cada uno. */
export const COLOR_SECTOR: Record<string, string> = {
  redaccion: "#E0A100",
  diseno_digital: "#5696F4",
  cm: "#15BD99",
  cuentas: "#9C87F5",
  creatividad: "#F73E12",
  arte: "#E2549E",
  produccion: "#7C7A73",
  medios: "#0EA5E9",
};

/** En qué fila va cada nivel (si alguien depende de otro del mismo nivel, su jefe sube una fila). */
const FILA_NIVEL: Record<Nivel | "ninguno", number> = { direccion: 0, coordinacion: 1, operativo: 2, ninguno: 2 };

type Unidad = {
  id: string;
  tipo: "persona" | "pila" | "equipo";
  /** Las personas que muestra: una, una columna apilada o la gente del equipo. */
  personas: Persona[];
  hub?: Hub;
  /** De quiénes cuelga (personas): el primero es el jefe principal. */
  padres: string[];
  fila: number;
  w: number;
  h: number;
  x: number;
  y: number;
};

/**
 * El organigrama. Las filas son niveles (dirección, coordinación, operativo): un social media
 * manager sin coordinador queda a la misma altura que un diseñador con coordinador. Una persona
 * puede depender de más de una (las líneas a los jefes que no son el principal van punteadas).
 * Los equipos de un cliente (ej: Equipo BBVA) se ven como un recuadro unido a sus directores.
 * Un admin lo arma arrastrando: sobre otra persona (queda debajo de ella, con ese único jefe), a un
 * equipo de cliente (pasa a integrarlo), a la franja de arriba (no depende de nadie) o a "Sin
 * ubicar" (sale). Los jefes extra se eligen en la ficha de la persona.
 */
export function Organigrama({ data, admin, buscar }: { data: EquipoData; admin: boolean; buscar: string }) {
  const [abierta, setAbierta] = useState<Persona | null>(null);
  const [filtroSin, setFiltroSin] = useState("");
  const [agregar, setAgregar] = useState(false);

  const puestos = useMemo(() => new Map(data.puestos.map((p) => [p.id, p])), [data.puestos]);
  const nivelDe = (p: Persona): Nivel | "ninguno" =>
    p.puestos.map((id) => puestos.get(id)?.nivel).filter((n): n is Nivel => Boolean(n)).sort((a, b) => FILA_NIVEL[a] - FILA_NIVEL[b])[0] ?? "ninguno";
  const colorDe = (p: Persona) => {
    const primero = p.puestos.map((id) => puestos.get(id)).find(Boolean);
    if (!primero) return "transparent";
    if (primero.nivel === "direccion") return "#202020";
    return COLOR_SECTOR[primero.sectores[0]] ?? "#7C7A73";
  };

  const armado = useMemo(() => {
    const porId = new Map(data.personas.map((p) => [p.id, p]));
    const equipos = data.hubs.filter((h) => h.tipo === "cliente");
    const enEquipo = new Map<string, Hub>();
    for (const p of data.personas) {
      const h = equipos.find((e) => e.id === p.hub_id);
      if (h) enEquipo.set(p.id, h);
    }
    // En el árbol: los ubicados que no están adentro de un equipo de cliente (esos van en su recuadro).
    const arbol = data.personas.filter((p) => p.en_organigrama && !enEquipo.has(p.id));
    const enArbol = new Set(arbol.map((p) => p.id));
    const jefesDe = (p: Persona) => p.jefes.filter((j) => enArbol.has(j));
    const ordenNombre = (a: Persona, b: Persona) => a.nombre.localeCompare(b.nombre, "es");
    const lideres = new Set(equipos.flatMap((e) => e.lideres));

    // Filas: por nivel, y cada jefe por lo menos una fila arriba de su gente.
    const fila = new Map<string, number>();
    for (const p of arbol) fila.set(p.id, FILA_NIVEL[nivelDe(p)]);
    const equiposVisibles = equipos.filter((e) => e.lideres.some((l) => enArbol.has(l)) || data.personas.some((p) => enEquipo.get(p.id)?.id === e.id));
    for (const e of equiposVisibles) fila.set(EQUIPO + e.id, FILA_NIVEL.operativo);
    const aristas: [string, string][] = [
      ...arbol.flatMap((p) => jefesDe(p).map((j) => [p.id, j] as [string, string])),
      ...equiposVisibles.flatMap((e) => e.lideres.filter((l) => enArbol.has(l)).map((l) => [EQUIPO + e.id, l] as [string, string])),
    ];
    for (let vuelta = 0; vuelta < 30; vuelta++) {
      let cambio = false;
      for (const [hijo, jefe] of aristas) {
        if (fila.get(jefe)! >= fila.get(hijo)!) {
          fila.set(jefe, fila.get(hijo)! - 1);
          cambio = true;
        }
      }
      if (!cambio) break;
    }
    const minFila = Math.min(0, ...fila.values());
    fila.forEach((v, k) => fila.set(k, v - minFila));

    // Unidades: tarjetas, columnas apiladas (gente sin nadie a cargo con un solo jefe) y equipos.
    const tieneGente = new Set(aristas.map(([, jefe]) => jefe));
    const unidades: Unidad[] = [];
    const deLaPersona = new Map<string, Unidad>();
    const apilables = new Map<string, Persona[]>();
    for (const p of arbol) {
      const js = jefesDe(p);
      if (!tieneGente.has(p.id) && !lideres.has(p.id) && js.length === 1) {
        const k = `${fila.get(p.id)}|${js[0]}`;
        apilables.set(k, [...(apilables.get(k) ?? []), p]);
      } else {
        const u: Unidad = { id: p.id, tipo: "persona", personas: [p], padres: js, fila: fila.get(p.id)!, w: W, h: H, x: 0, y: 0 };
        unidades.push(u);
        deLaPersona.set(p.id, u);
      }
    }
    for (const [k, gente] of apilables) {
      gente.sort(ordenNombre);
      const [f, jefe] = k.split("|");
      const u: Unidad = gente.length === 1
        ? { id: gente[0].id, tipo: "persona", personas: gente, padres: [jefe], fila: Number(f), w: W, h: H, x: 0, y: 0 }
        : { id: `pila:${k}`, tipo: "pila", personas: gente, padres: [jefe], fila: Number(f), w: W, h: gente.length * (H + GAP_PILA) - GAP_PILA, x: 0, y: 0 };
      unidades.push(u);
      for (const p of gente) deLaPersona.set(p.id, u);
    }
    for (const e of equiposVisibles) {
      const gente = data.personas.filter((p) => enEquipo.get(p.id)?.id === e.id).sort(ordenNombre);
      unidades.push({
        id: EQUIPO + e.id,
        tipo: "equipo",
        personas: gente,
        hub: e,
        padres: e.lideres.filter((l) => enArbol.has(l)),
        fila: fila.get(EQUIPO + e.id)!,
        w: W + PAD * 2,
        h: CABEZA + Math.max(1, gente.length) * (H + GAP_PILA) - GAP_PILA + PAD * 2,
        x: 0,
        y: 0,
      });
    }

    // Posición horizontal: de arriba abajo, cada uno bajo el promedio de sus jefes; después de
    // abajo arriba, cada jefe sobre el promedio de su gente. Sin pisarse dentro de una fila.
    const filas = [...new Set(unidades.map((u) => u.fila))].sort((a, b) => a - b);
    const enFila = (f: number) => unidades.filter((u) => u.fila === f);
    const centro = (u: Unidad) => u.x + u.w / 2;
    const nombreDe = (u: Unidad) => u.hub?.nombre ?? u.personas[0]?.nombre ?? "";
    const acomodar = (lista: Unidad[], deseado: (u: Unidad) => number | null) => {
      const con = lista.map((u) => ({ u, d: deseado(u) }));
      con.sort((a, b) => (a.d ?? Infinity) - (b.d ?? Infinity) || nombreDe(a.u).localeCompare(nombreDe(b.u), "es"));
      let derecha = -Infinity;
      for (const { u, d } of con) {
        const x = d == null ? (derecha === -Infinity ? 0 : derecha + GAP_X) : d - u.w / 2;
        u.x = derecha === -Infinity ? x : Math.max(x, derecha + GAP_X);
        derecha = u.x + u.w;
      }
    };
    const promedio = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
    for (const f of filas) {
      acomodar(enFila(f), (u) => promedio(u.padres.map((id) => deLaPersona.get(id)).filter((p): p is Unidad => Boolean(p) && p!.fila < f).map(centro)));
    }
    for (const f of [...filas].reverse().slice(1)) {
      acomodar(enFila(f), (u) => {
        const ids = new Set(u.personas.map((p) => p.id));
        return promedio(unidades.filter((h) => h.fila > f && h.padres.some((id) => ids.has(id))).map(centro)) ?? centro(u);
      });
    }
    const minX = Math.min(0, ...unidades.map((u) => u.x));
    for (const u of unidades) u.x -= minX;

    // Posición vertical: cada fila arranca debajo de la más alta de la anterior.
    let y = 0;
    const abajoDe = new Map<number, number>();
    for (const f of filas) {
      const us = enFila(f);
      for (const u of us) u.y = y;
      y += Math.max(...us.map((u) => u.h));
      abajoDe.set(f, y);
      y += GAP_Y;
    }

    // Una línea que saltea filas (un director con gente operativa directa) baja por un hueco
    // libre de las filas del medio: si cruzara una tarjeta, parecería que depende de esa persona.
    const libre = (x: number, f: number) => enFila(f).every((o) => x < o.x - 6 || x > o.x + o.w + 6);
    const bajada = (jefe: Unidad, u: Unidad) => {
      const medio = filas.filter((f) => f > jefe.fila && f < u.fila);
      const huecos = medio.flatMap((f) => enFila(f).flatMap((o) => [o.x - GAP_X / 2, o.x + o.w + GAP_X / 2]));
      return [centro(u), centro(jefe), ...huecos]
        .filter((x) => medio.every((f) => libre(x, f)))
        .sort((a, b) => Math.abs(a - centro(u)) + Math.abs(a - centro(jefe)) - (Math.abs(b - centro(u)) + Math.abs(b - centro(jefe))))[0];
    };

    // Líneas: del jefe a cada uno; las de los jefes que no son el principal, punteadas.
    const lineas: { d: string; punteada: boolean }[] = [];
    for (const u of unidades) {
      u.padres.forEach((id, i) => {
        const jefe = deLaPersona.get(id);
        if (!jefe) return;
        const mitad = u.y - GAP_Y / 2;
        const x = u.fila - jefe.fila > 1 ? bajada(jefe, u) : undefined;
        const d =
          x === undefined
            ? `M ${centro(jefe)} ${jefe.y + H} V ${mitad} H ${centro(u)} V ${u.y}`
            : // Un poco más arriba que las líneas de la fila de abajo, para que no se pisen.
              `M ${centro(jefe)} ${jefe.y + H} V ${abajoDe.get(jefe.fila)! + GAP_Y / 3} H ${x} V ${mitad} H ${centro(u)} V ${u.y}`;
        lineas.push({ d, punteada: u.tipo === "persona" && i > 0 });
      });
      if (u.tipo === "pila") lineas.push({ d: `M ${centro(u)} ${u.y + H} V ${u.y + u.h - H}`, punteada: false });
    }

    const sinUbicar = data.personas.filter((p) => p.activo && !p.en_organigrama && !enEquipo.has(p.id)).sort(ordenNombre);
    const ancho = Math.max(0, ...unidades.map((u) => u.x + u.w));
    const alto = Math.max(0, y - GAP_Y);
    const gente = new Map<string, number>();
    for (const [, jefe] of aristas) gente.set(jefe, (gente.get(jefe) ?? 0) + 1);
    return { unidades, lineas, sinUbicar, ancho, alto, enEquipo, gente, jefesDe };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.personas, data.hubs, puestos]);

  /** ¿b depende (directa o indirectamente) de a? */
  const dependeDe = (b: string, a: string) => {
    const vistos = new Set<string>();
    const pila = [b];
    while (pila.length) {
      const x = pila.pop()!;
      if (vistos.has(x)) continue;
      vistos.add(x);
      const p = data.personas.find((q) => q.id === x);
      for (const j of p?.jefes ?? []) {
        if (j === a) return true;
        pila.push(j);
      }
    }
    return false;
  };

  function onSoltar(id: string, desde: string, hacia: Destino) {
    const p = data.personas.find((x) => x.id === id);
    if (!p) return;
    // Si sale de un equipo de cliente hacia el árbol o "Sin ubicar", deja el equipo.
    const dejarEquipo = armado.enEquipo.has(id) && !hacia.lista.startsWith(EQUIPO);
    const conEquipo = (fn: () => Promise<unknown>) => async () => {
      if (dejarEquipo) await equipoRepo.actualizarPersona(id, { hub_id: null });
      await fn();
    };
    if (hacia.lista === SIN) {
      if (desde !== SIN) cambiarEquipo(conEquipo(() => equipoRepo.sacar(id)), `${p.nombre} quedó sin ubicar`);
      return;
    }
    if (hacia.lista === RAIZ) {
      cambiarEquipo(conEquipo(() => equipoRepo.ubicar(id, null)), `${p.nombre} quedó arriba de todo`);
      return;
    }
    if (hacia.lista.startsWith(EQUIPO)) {
      const hubId = hacia.lista.slice(EQUIPO.length);
      const hub = data.hubs.find((h) => h.id === hubId);
      if (!hub || p.hub_id === hubId) return;
      cambiarEquipo(async () => {
        await equipoRepo.actualizarPersona(id, { hub_id: hubId });
        if (!p.en_organigrama) await equipoRepo.ubicar(id, null);
      }, `${p.nombre} ahora está en ${hub.nombre}`);
      return;
    }
    if (hacia.lista === id || (p.jefes.length === 1 && p.jefes[0] === hacia.lista && !dejarEquipo)) return;
    const jefe = data.personas.find((x) => x.id === hacia.lista);
    if (!jefe) return;
    if (dependeDe(hacia.lista, id)) {
      toast(`No se puede: ${jefe.nombre} ya depende de ${p.nombre}.`, "error");
      return;
    }
    cambiarEquipo(conEquipo(() => equipoRepo.ubicar(id, hacia.lista)), `${p.nombre} ahora depende de ${jefe.nombre}`);
  }

  const { arrastre, destino, fantasma, propsTarjeta, propsLista } = useArrastre(onSoltar);
  const arrastrada = arrastre ? data.personas.find((p) => p.id === arrastre.id) : undefined;
  const q = fold(buscar).trim();
  const coincide = (p: Persona) => !q || fold(p.nombre).includes(q) || fold(p.cargo ?? "").includes(q);
  const sinFiltrados = armado.sinUbicar.filter((p) => !filtroSin || fold(p.nombre).includes(fold(filtroSin)));

  const tarjeta = (p: Persona, extra: { modo?: "origen" | "fantasma" | "normal"; resaltada?: boolean } = {}) => {
    const nombres = p.puestos.map((id) => puestos.get(id)?.nombre).filter(Boolean);
    const gente = armado.gente.get(p.id) ?? 0;
    const jefes = armado.jefesDe(p).length;
    return (
      <div
        className={cn(
          "flex h-full w-full items-center gap-2.5 overflow-hidden rounded-[1.1rem] border border-black/[0.06] bg-card/95 py-2.5 pl-3 pr-2.5 text-left shadow-[0_1px_2px_rgba(32,32,32,0.05),0_10px_28px_-12px_rgba(32,32,32,0.14)] backdrop-blur",
          !p.activo && "opacity-50",
          extra.modo === "origen" && "opacity-30",
          extra.modo === "fantasma" && "rotate-[1.5deg] ring-2 ring-primary",
          extra.resaltada && "ring-2 ring-primary"
        )}
        style={{ boxShadow: `inset 4px 0 0 ${colorDe(p)}` }}
      >
        <Avatar nombre={p.nombre} url={p.avatar_url} className="h-9 w-9 text-[11px]" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold leading-tight">{p.nombre}</p>
          <p className="truncate text-[11px] leading-tight text-muted-foreground">{nombres.join(" · ") || p.cargo || "Sin puesto"}</p>
          {(gente > 0 || jefes > 1 || !p.activo || p.bc_persona_id == null) && (
            <p className="mt-0.5 truncate text-[10px] font-medium text-muted-foreground">
              {[
                !p.activo && "Inactivo",
                gente > 0 && `${gente} a cargo`,
                jefes > 1 && `${jefes} jefes`,
                p.bc_persona_id == null && "No está en Basecamp",
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>
      </div>
    );
  };

  /** Una tarjeta del árbol: se arrastra; si `recibe`, se le puede soltar a alguien encima. */
  const nodo = (p: Persona, x: number, y: number, recibe: boolean) => {
    const esta = arrastre?.id === p.id;
    const sobre = Boolean(arrastre && !esta && destino?.lista === p.id);
    return (
      <div
        key={p.id}
        {...(admin ? { ...propsTarjeta(p.id, ARBOL), ...(recibe ? propsLista(p.id) : {}) } : {})}
        role="button"
        tabIndex={0}
        onClick={() => setAbierta(p)}
        onKeyDown={(e) => e.key === "Enter" && setAbierta(p)}
        className={cn("absolute select-none", admin && "cursor-grab active:cursor-grabbing", q && !coincide(p) && "opacity-30")}
        style={{ left: x, top: y, width: W, height: H }}
      >
        {tarjeta(p, { modo: esta ? "origen" : "normal", resaltada: sobre || (Boolean(q) && coincide(p)) })}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      {/* El árbol */}
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-muted-foreground">
          {data.sectores
            .filter((s) => COLOR_SECTOR[s.id])
            .map((s) => (
              <span key={s.id} className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-1 rounded-full" style={{ background: COLOR_SECTOR[s.id] }} />
                {s.nombre}
              </span>
            ))}
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-1 rounded-full bg-ink" />
            Dirección
          </span>
          <span className="inline-flex items-center gap-1.5">
            <svg width="18" height="4" aria-hidden>
              <path d="M0 2 H18" stroke="rgba(32,32,32,0.45)" strokeWidth="1.5" strokeDasharray="3 3" />
            </svg>
            Otro jefe
          </span>
          {admin && <span className="ml-auto">Arrastrá a alguien sobre otra persona para ponerlo debajo; los jefes extra, en su ficha.</span>}
        </div>
        <div className="relative overflow-auto rounded-[1.6rem] border bg-secondary/35" style={{ maxHeight: "calc(100dvh - 15rem)" }} data-scroll-x data-scroll-y>
          {/* Siempre está (para un admin): si apareciera recién al arrastrar, empujaría el árbol. */}
          {admin && (
            <div
              {...propsLista(RAIZ)}
              className={cn(
                "sticky left-0 top-0 z-10 m-3 rounded-2xl border-2 border-dashed px-3 py-2 text-center text-xs font-medium transition-colors",
                arrastre && destino?.lista === RAIZ
                  ? "border-primary bg-primary/15 text-foreground"
                  : arrastre
                    ? "border-foreground/25 bg-card/90 text-foreground"
                    : "border-foreground/10 bg-card/60 text-muted-foreground"
              )}
            >
              Arriba de todo · soltá acá a quien no depende de nadie
            </div>
          )}
          {!armado.unidades.length ? (
            <p className="p-10 text-center text-sm text-muted-foreground">
              {admin ? "El organigrama está vacío. Arrastrá a alguien desde “Sin ubicar” hasta la franja de arriba para empezar." : "Todavía nadie armó el organigrama."}
            </p>
          ) : (
            <div className="relative m-6" style={{ width: armado.ancho, height: armado.alto }}>
              <svg className="pointer-events-none absolute inset-0 overflow-visible" width={armado.ancho} height={armado.alto} aria-hidden>
                {armado.lineas.map((l, i) => (
                  <path
                    key={i}
                    d={l.d}
                    fill="none"
                    stroke={l.punteada ? "rgba(32,32,32,0.35)" : "rgba(32,32,32,0.22)"}
                    strokeWidth={1.5}
                    strokeDasharray={l.punteada ? "5 4" : undefined}
                    strokeLinejoin="round"
                  />
                ))}
              </svg>
              {armado.unidades.map((u) =>
                u.tipo === "persona" ? (
                  nodo(u.personas[0], u.x, u.y, true)
                ) : u.tipo === "pila" ? (
                  u.personas.map((p, i) => nodo(p, u.x, u.y + i * (H + GAP_PILA), true))
                ) : (
                  // Un equipo de cliente: se le suelta gente encima para sumarla.
                  <div
                    key={u.id}
                    {...(admin ? propsLista(u.id) : {})}
                    className={cn(
                      "absolute rounded-[1.4rem] border-2 border-dashed bg-card/40 transition-colors",
                      arrastre && destino?.lista === u.id ? "border-primary bg-primary/10" : "border-foreground/15"
                    )}
                    style={{ left: u.x, top: u.y, width: u.w, height: u.h }}
                  >
                    <p className="truncate px-3 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground" style={{ height: CABEZA }}>
                      {u.hub!.nombre}
                    </p>
                    {u.personas.map((p, i) => nodo(p, PAD, CABEZA + PAD / 2 + i * (H + GAP_PILA), false))}
                    {!u.personas.length && (
                      <p className="px-3 text-xs text-muted-foreground">{admin ? "Soltá acá a quienes lo integran" : "Sin gente todavía"}</p>
                    )}
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </div>

      {/* Sin ubicar */}
      <aside
        {...(admin ? propsLista(SIN) : {})}
        className={cn(
          "flex w-full shrink-0 flex-col rounded-[1.6rem] border bg-card/70 p-3 transition-colors lg:w-72",
          arrastre && destino?.lista === SIN && "border-primary bg-primary/10"
        )}
        style={{ maxHeight: "calc(100dvh - 13.5rem)" }}
      >
        <div className="mb-2 flex items-center gap-2 px-1">
          <h3 className="flex-1 text-sm font-semibold">Sin ubicar</h3>
          <span className="text-xs tabular-nums text-muted-foreground">{armado.sinUbicar.length}</span>
        </div>
        <label className="mb-2 flex h-8 items-center gap-2 rounded-full border bg-card px-3">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input value={filtroSin} onChange={(e) => setFiltroSin(e.target.value)} placeholder="Buscar" className="min-w-0 flex-1 bg-transparent text-xs outline-none" />
        </label>
        <div className="-mr-1 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1" data-scroll-y>
          {sinFiltrados.map((p) => (
            <div
              key={p.id}
              {...(admin ? propsTarjeta(p.id, SIN) : {})}
              role="button"
              tabIndex={0}
              onClick={() => setAbierta(p)}
              onKeyDown={(e) => e.key === "Enter" && setAbierta(p)}
              className={cn("select-none", admin && "cursor-grab active:cursor-grabbing")}
              style={{ height: H }}
            >
              {tarjeta(p, { modo: arrastre?.id === p.id ? "origen" : "normal" })}
            </div>
          ))}
          {!armado.sinUbicar.length && <p className="px-2 py-6 text-center text-xs text-muted-foreground">Ya están todos en el organigrama.</p>}
          {admin && arrastre && destino?.lista === SIN && <p className="px-2 text-center text-xs font-medium">Soltá para sacarlo del organigrama</p>}
        </div>
        {admin && (
          <button
            type="button"
            onClick={() => setAgregar(true)}
            className="mt-2 inline-flex h-9 items-center justify-center gap-1.5 rounded-full border bg-card text-[13px] font-medium hover:border-foreground/30"
          >
            <Plus className="h-4 w-4" /> Agregar a alguien que no está en Basecamp
          </button>
        )}
      </aside>

      {arrastre &&
        arrastrada &&
        createPortal(
          <div
            ref={fantasma}
            className="pointer-events-none fixed left-0 top-0 z-[80]"
            style={{ width: W, height: H, transform: `translate3d(${arrastre.x - arrastre.dx}px, ${arrastre.y - arrastre.dy}px, 0)` }}
          >
            {tarjeta(arrastrada, { modo: "fantasma" })}
          </div>,
          document.body
        )}

      <PersonaDialog persona={abierta} data={data} admin={admin} onClose={() => setAbierta(null)} />
      <AgregarPersona abierto={agregar} onClose={() => setAgregar(false)} onCreada={(p) => setAbierta(p)} data={data} />
    </div>
  );
}

/** Alguien que no está en Basecamp (ej: la dirección de cuentas): nombre y, si tiene, su mail. */
function AgregarPersona({ abierto, onClose, onCreada, data }: { abierto: boolean; onClose: () => void; onCreada: (p: Persona) => void; data: EquipoData }) {
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  async function crear() {
    if (!nombre.trim()) return;
    let id = "";
    const ok = await cambiarEquipo(async () => {
      id = await equipoRepo.crearPersona(nombre, email || null);
    }, `${nombre.trim()} se sumó al equipo`);
    if (!ok) return;
    setNombre("");
    setEmail("");
    onClose();
    // Se abre su ficha para cargarle puestos y jefes (la persona recién creada ya está en data).
    const nueva: Persona = data.personas.find((p) => p.id === id) ?? {
      id, nombre: nombre.trim(), email: email || null, bc_persona_id: null, rol: "empleado", hub_id: null, activo: true, puestos: [],
      avatar_url: null, cargo: null, activo_manual: null, ultima_actividad: null, actividad_medida: false, jefes: [], en_organigrama: false,
    };
    onCreada(nueva);
  }
  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Agregar a alguien</DialogTitle>
          <DialogDescription>Para quien no está en Basecamp (ej: la dirección de cuentas). Si después aparece en Basecamp con ese mail, se vincula solo.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            crear();
          }}
          className="space-y-3"
        >
          <input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre y apellido" className="h-10 w-full rounded-xl border bg-card px-3 text-sm outline-none focus:border-foreground/40" />
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Mail (opcional)" className="h-10 w-full rounded-xl border bg-card px-3 text-sm outline-none focus:border-foreground/40" />
          <button type="submit" disabled={!nombre.trim()} className="inline-flex h-10 w-full items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background disabled:opacity-40">
            Agregar
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
