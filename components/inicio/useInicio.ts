"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount } from "@/components/shell/AccountProvider";
import { useClients } from "@/hooks/useClients";
import { useEquipo } from "@/hooks/useEquipo";
import { useFlujo } from "@/hooks/useFlujo";
import { useMiPerfil } from "@/hooks/useMiPerfil";
import { useNotificaciones } from "@/hooks/useNotificaciones";
import { armarContexto, claveOrden, etapaDe, fechaDe, responsableDe, tonoDe, validadoresDe, type TareaFlujo, type Tono } from "@/lib/board/flujo";
import type { Persona } from "@/lib/board/equipo";
import { hoyISO, sumarDias, aISO } from "@/lib/inicio/fechas";
import { fechasDeMarcas, proximaVez, usoHerramientas, type FechaMarca } from "@/lib/inicio/repo";
import type { UsoModulo } from "@/lib/inicio/herramientas";
import { mesDia } from "@/lib/inicio/saludo";
import { fueraDeOficina, nombreDe } from "@/lib/perfil";
import type { Brand } from "@/lib/types";
import { useAjustesInicio } from "./piezas";

/** Una tarea tuya, lista para mostrar: su tono (lo urgente) y si te toca hacerla o validarla. */
export type MiTarea = { t: TareaFlujo; tono: Tono; fecha: string | null; valida: boolean };

/** Una de tus marcas: por qué es tuya y lo que tiene encima. */
export type MiMarca = {
  brand: Brand;
  /** Los sectores donde sos designado (vacío: la sumaste a mano). */
  sectores: string[];
  fijada: boolean;
  tareas: MiTarea[];
  vencidas: number;
  pronto: number;
  avisos: number;
  proximaFecha: (FechaMarca & { cuando: string }) | null;
  companeros: { persona: Persona; sector: string }[];
  /** Cuánto movimiento tiene hoy: con eso se elige la marca en foco. */
  puntaje: number;
};

export type Celebracion = { persona: Persona; tipo: "cumple" | "aniversario" | "bienvenida"; anios?: number; dias: number };

const URGENTE: Tono[] = ["vencida", "pronto"];

export function useInicio() {
  const account = useAccount();
  const userId = account?.user?.id ?? null;
  const { perfil } = useMiPerfil();
  const equipo = useEquipo();
  const { clients, loading: cargandoClientes } = useClients();
  const flujo = useFlujo({ reconciliar: false });
  const avisos = useNotificaciones({ activo: true });
  const { ajustes } = useAjustesInicio();
  const [uso, setUso] = useState<UsoModulo[] | null>(null);
  const [fechas, setFechas] = useState<FechaMarca[]>([]);
  const [fechasListas, setFechasListas] = useState(false);

  useEffect(() => {
    if (!userId) return;
    usoHerramientas().then(setUso);
    fechasDeMarcas().then((f) => {
      setFechas(f);
      setFechasListas(true);
    });
  }, [userId]);

  const data = equipo.data;
  const ctx = useMemo(() => (data ? armarContexto(data) : null), [data]);
  const yo: Persona | null = useMemo(() => (data?.yo?.equipo_id ? (data.personas.find((p) => p.id === data.yo!.equipo_id) ?? null) : null), [data]);
  const sectoresSector = useMemo(() => new Map((data?.sectores ?? []).map((s) => [s.id, s.nombre])), [data]);
  const misSectores = useMemo(() => (yo && ctx ? [...(ctx.sectoresDe.get(yo.id) ?? [])] : []), [yo, ctx]);

  // Tus tareas: las que tenés vos y las que te toca validar, sin las terminadas ni las pausadas.
  const misTareas = useMemo<MiTarea[]>(() => {
    if (!ctx || !yo) return [];
    const hoy = new Date();
    const out: MiTarea[] = [];
    for (const t of flujo.tareas) {
      const etapa = etapaDe(t);
      if (etapa === "finalizada" || t.pausada) continue;
      const mia = responsableDe(t, ctx).persona?.id === yo.id;
      const valida = !mia && etapa === "validacion" && validadoresDe(t, ctx).some((p) => p.id === yo.id);
      if (!mia && !valida) continue;
      const f = fechaDe(t, hoy);
      out.push({ t, tono: tonoDe(t, hoy), fecha: f.vieja ? null : f.fecha, valida });
    }
    const peso = (m: MiTarea) => (m.tono === "vencida" ? 0 : m.tono === "pronto" ? 1 : 2);
    return out.sort((a, b) => peso(a) - peso(b) || claveOrden(a.t) - claveOrden(b.t));
  }, [flujo.tareas, ctx, yo]);

  const marcaPorId = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  // Tus marcas: las designadas, más las que sumaste, menos las que sacaste. En tu orden o alfabéticas.
  const misMarcas = useMemo<MiMarca[]>(() => {
    if (!clients.length) return [];
    const hoy = hoyISO();
    const sectores = new Map<string, string[]>();
    if (yo && data) {
      for (const d of data.designaciones) {
        if (d.persona_id !== yo.id) continue;
        sectores.set(d.brand_id, [...(sectores.get(d.brand_id) ?? []), sectoresSector.get(d.sector_id) ?? d.sector_id]);
      }
    }
    const ids = [...new Set([...sectores.keys(), ...ajustes.marcasFijadas])].filter((id) => !ajustes.marcasOcultas.includes(id) && marcaPorId.has(id));
    const avisosPorMarca = new Map<string, number>();
    for (const g of avisos.grupos) {
      const b = g.ultima.brand_id;
      if (b && g.noLeidas) avisosPorMarca.set(b, (avisosPorMarca.get(b) ?? 0) + 1);
    }
    const lista = ids.map<MiMarca>((id) => {
      const brand = marcaPorId.get(id)!;
      const tareas = misTareas.filter((m) => m.t.brand_id === id);
      const vencidas = tareas.filter((m) => m.tono === "vencida").length;
      const pronto = tareas.filter((m) => m.tono === "pronto").length;
      const proximas = fechas
        .filter((f) => f.brand_id === id)
        .map((f) => ({ ...f, cuando: proximaVez(f, hoy) }))
        .filter((f): f is FechaMarca & { cuando: string } => Boolean(f.cuando))
        .sort((a, b) => a.cuando.localeCompare(b.cuando));
      const proximaFecha = proximas[0] ?? null;
      const enUnaSemana = proximaFecha && proximaFecha.cuando <= aISO(sumarDias(new Date(), 7));
      const companeros =
        data && yo
          ? data.designaciones
              .filter((d) => d.brand_id === id && d.persona_id !== yo.id)
              .map((d) => ({ persona: data.personas.find((p) => p.id === d.persona_id), sector: sectoresSector.get(d.sector_id) ?? d.sector_id }))
              .filter((x): x is { persona: Persona; sector: string } => Boolean(x.persona?.activo))
          : [];
      const nAvisos = avisosPorMarca.get(id) ?? 0;
      return {
        brand,
        sectores: sectores.get(id) ?? [],
        fijada: !sectores.has(id),
        tareas,
        vencidas,
        pronto,
        avisos: nAvisos,
        proximaFecha,
        companeros,
        puntaje: vencidas * 3 + pronto * 2 + tareas.length * 0.5 + nAvisos * 1.5 + (enUnaSemana ? 2 : 0),
      };
    });
    const orden = ajustes.marcasOrden;
    const pos = (m: MiMarca) => (orden.includes(m.brand.id) ? orden.indexOf(m.brand.id) : orden.length);
    return lista.sort((a, b) => pos(a) - pos(b) || a.brand.name.localeCompare(b.brand.name, "es"));
  }, [clients.length, marcaPorId, yo, data, sectoresSector, ajustes.marcasFijadas, ajustes.marcasOcultas, ajustes.marcasOrden, avisos.grupos, misTareas, fechas]);

  // La marca en foco: la de más movimiento hoy; si ninguna tiene, una distinta cada día.
  const foco = useMemo<{ marca: MiMarca; motivo: string } | null>(() => {
    if (!misMarcas.length) return null;
    const max = [...misMarcas].sort((a, b) => b.puntaje - a.puntaje)[0];
    if (max.puntaje > 0) {
      const partes = [
        max.vencidas && `${max.vencidas} ${max.vencidas === 1 ? "tarea vencida" : "tareas vencidas"}`,
        max.pronto && `${max.pronto} que ${max.pronto === 1 ? "vence" : "vencen"} pronto`,
        max.avisos && `${max.avisos} ${max.avisos === 1 ? "aviso" : "avisos"} sin leer`,
        !max.vencidas && !max.pronto && max.tareas.length && `${max.tareas.length} ${max.tareas.length === 1 ? "tarea" : "tareas"} en curso`,
        max.proximaFecha && `${max.proximaFecha.titulo} se viene`,
      ].filter(Boolean) as string[];
      return { marca: max, motivo: partes.slice(0, 2).join(" · ") };
    }
    const n = Math.floor(Date.now() / 86_400_000) % misMarcas.length;
    return { marca: misMarcas[n], motivo: "La marca del día" };
  }, [misMarcas]);

  // Cumples, aniversarios en el estudio y bienvenidas (de los perfiles del equipo).
  const celebraciones = useMemo<Celebracion[]>(() => {
    if (!data) return [];
    const hoy = new Date();
    const out: Celebracion[] = [];
    for (const p of data.personas) {
      if (!p.activo || !p.perfil) continue;
      const { cumple, ingreso } = p.perfil;
      if (cumple) {
        for (let n = 0; n <= 14; n++) {
          if (mesDia(sumarDias(hoy, n)) === cumple) {
            out.push({ persona: p, tipo: "cumple", dias: n });
            break;
          }
        }
      }
      if (ingreso) {
        const [y, m, d] = ingreso.split("-").map(Number);
        const desde = (hoy.getTime() - new Date(y, m - 1, d).getTime()) / 86_400_000;
        if (desde >= 0 && desde <= 21) out.push({ persona: p, tipo: "bienvenida", dias: -Math.floor(desde) });
        else if (mesDia(hoy) === ingreso.slice(5) && hoy.getFullYear() > y) out.push({ persona: p, tipo: "aniversario", anios: hoy.getFullYear() - y, dias: 0 });
      }
    }
    return out.sort((a, b) => a.dias - b.dias);
  }, [data]);

  const fuera = useMemo(
    () => (data?.personas ?? []).filter((p) => p.activo && p.id !== yo?.id && fueraDeOficina(p.perfil)).map((p) => ({ persona: p, hasta: fueraDeOficina(p.perfil)! })),
    [data, yo]
  );

  const cumpleHoy = Boolean(perfil?.cumple && perfil.cumple === mesDia());

  return {
    userId,
    nombre: perfil ? nombreDe(perfil, account?.user?.user_metadata?.full_name as string | undefined) : null,
    perfil,
    cumpleHoy,
    equipo,
    yo,
    ctx,
    misSectores,
    clients,
    cargandoClientes,
    marcaPorId,
    flujo,
    misTareas,
    urgentes: misTareas.filter((m) => URGENTE.includes(m.tono)),
    avisos,
    uso,
    fechas,
    fechasListas,
    recargarFechas: () => fechasDeMarcas().then(setFechas),
    misMarcas,
    foco,
    celebraciones,
    fuera,
  };
}

export type DatosInicio = ReturnType<typeof useInicio>;
