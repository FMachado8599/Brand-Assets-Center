import type { Rendimiento } from "./tipos";

/**
 * Cuentas sobre la vista inf_rendimiento (una fila por influencer, cliente, mes y red). Los totales
 * suman solo las filas principales (el autor): una colaboración de dos influencers es una sola
 * publicación. Lo de cada influencer suma todas las suyas, colaboraciones incluidas.
 */

export type Periodo = "todo" | "3m" | "12m" | `a${number}`;

export type Filtro = { periodo: Periodo; clientes: string[]; redes: string[] };

/** "Sin cliente" en los filtros. */
export const SIN_CLIENTE = "sin-cliente";

function mesDesde(meses: number) {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - (meses - 1));
  return d.toISOString().slice(0, 7);
}

export function enPeriodo(mes: string | null, periodo: Periodo) {
  if (periodo === "todo") return true;
  if (!mes) return false;
  if (periodo === "3m") return mes.slice(0, 7) >= mesDesde(3);
  if (periodo === "12m") return mes.slice(0, 7) >= mesDesde(12);
  return mes.startsWith(periodo.slice(1));
}

export function filtrar(filas: Rendimiento[], f: Filtro) {
  return filas.filter(
    (r) =>
      enPeriodo(r.mes, f.periodo) &&
      (!f.clientes.length || f.clientes.includes(r.brand_id ?? SIN_CLIENTE)) &&
      (!f.redes.length || (r.red != null && f.redes.includes(r.red)))
  );
}

export type Stats = {
  publicaciones: number;
  views: number;
  likes: number;
  comentarios: number;
  compartidos: number;
  guardados: number;
  alcance: number;
  impresiones: number;
  interacciones: number;
  /** Engagement promedio por publicación, en %; null sin datos. */
  engagement: number | null;
  patrocinadas: number;
  primera: string | null;
  ultima: string | null;
  clientes: string[];
  perfiles: string[];
  redes: string[];
};

export function sumar(filas: Rendimiento[]): Stats {
  let eSuma = 0;
  let eN = 0;
  const clientes = new Set<string>();
  const perfiles = new Set<string>();
  const redes = new Set<string>();
  const s: Stats = {
    publicaciones: 0,
    views: 0,
    likes: 0,
    comentarios: 0,
    compartidos: 0,
    guardados: 0,
    alcance: 0,
    impresiones: 0,
    interacciones: 0,
    engagement: null,
    patrocinadas: 0,
    primera: null,
    ultima: null,
    clientes: [],
    perfiles: [],
    redes: [],
  };
  for (const r of filas) {
    s.publicaciones += r.publicaciones;
    s.views += r.views;
    s.likes += r.likes;
    s.comentarios += r.comentarios;
    s.compartidos += r.compartidos;
    s.guardados += r.guardados;
    s.alcance += r.alcance;
    s.impresiones += r.impresiones;
    s.interacciones += r.interacciones;
    s.patrocinadas += r.patrocinadas;
    eSuma += r.engagement_suma;
    eN += r.engagement_n;
    if (r.primera && (!s.primera || r.primera < s.primera)) s.primera = r.primera;
    if (r.ultima && (!s.ultima || r.ultima > s.ultima)) s.ultima = r.ultima;
    if (r.brand_id) clientes.add(r.brand_id);
    perfiles.add(r.perfil_id);
    if (r.red) redes.add(r.red);
  }
  s.engagement = eN ? eSuma / eN : null;
  s.clientes = [...clientes];
  s.perfiles = [...perfiles];
  s.redes = [...redes];
  return s;
}

/** Totales sin contar dos veces las colaboraciones. */
export const totales = (filas: Rendimiento[]) => sumar(filas.filter((r) => r.principal));

function agrupar(filas: Rendimiento[], clave: (r: Rendimiento) => string) {
  const grupos = new Map<string, Rendimiento[]>();
  for (const r of filas) {
    const k = clave(r);
    const g = grupos.get(k);
    if (g) g.push(r);
    else grupos.set(k, [r]);
  }
  return grupos;
}

/** Lo de cada influencer (con sus colaboraciones). */
export function porPerfil(filas: Rendimiento[]) {
  return new Map([...agrupar(filas, (r) => r.perfil_id)].map(([k, g]) => [k, sumar(g)]));
}

/** Lo de cada cliente ("" = sin cliente): publicaciones sin repetir y todos los influencers que trabajaron. */
export function porCliente(filas: Rendimiento[]) {
  return new Map(
    [...agrupar(filas, (r) => r.brand_id ?? "")].map(([k, g]) => {
      const s = totales(g);
      s.perfiles = [...new Set(g.map((r) => r.perfil_id))];
      return [k, s];
    })
  );
}

/** Años con datos, del más nuevo al más viejo (para el filtro de período). */
export function anios(filas: Rendimiento[]) {
  return [...new Set(filas.map((r) => r.mes?.slice(0, 4)).filter((a): a is string => Boolean(a)))].sort().reverse();
}

export const PERIODOS: { value: Periodo; label: string }[] = [
  { value: "todo", label: "Todo" },
  { value: "12m", label: "Últimos 12 meses" },
  { value: "3m", label: "Últimos 3 meses" },
];
