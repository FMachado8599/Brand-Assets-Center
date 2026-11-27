import type { UsoModulo } from "./herramientas";

/**
 * Lo que el Inicio le pide a la base (supabase/migracion-inicio.sql). Todo se lee con la sesión de
 * quien entra; lo que no se puede leer directo (las visitas, lo del estudio) pasa por funciones que
 * cuentan solo lo que corresponde. Sin la migración, cada lectura devuelve vacío y el Inicio igual anda.
 */

const loadClient = () => import("@/lib/supabase").then((m) => m.supabase);
const configurada = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/** Falta correr supabase/migracion-inicio.sql. */
export const faltaMigracionInicio = (message: string) =>
  /inicio_|marca_fechas|uso_herramientas|cumple|ingreso|schema cache|does not exist|PGRST202|42883|42P01|42703/i.test(message);

type Res<T> = PromiseLike<{ data: T | null; error: { message: string } | null }>;

async function leer<T>(q: (s: Awaited<ReturnType<typeof loadClient>>) => Res<T>, vacio: T): Promise<T> {
  if (!configurada) return vacio;
  try {
    const supabase = await loadClient();
    const { data, error } = await q(supabase);
    if (error) {
      if (!faltaMigracionInicio(error.message)) console.warn("[inicio]", error.message);
      return vacio;
    }
    return (data ?? vacio) as T;
  } catch {
    return vacio;
  }
}

/* ───────────── Herramientas y números ───────────── */

export const usoHerramientas = () =>
  leer<UsoModulo[] | null>((s) => s.rpc("inicio_herramientas", { p_dias: 60 }), null).then((filas) =>
    filas ? filas.map((f) => ({ ...f, visitas: Number(f.visitas) })) : null
  );

export type Numeros = {
  emojis: number;
  emoji_favorito: string | null;
  gifs: number;
  iconos: number;
  conversiones: number;
  compresiones: number;
  bytes_convertidos: number;
  retoques: number;
  banners: number;
  tarjetas: number;
  redacciones: number;
  descargas: number;
  bytes_bajados: number;
  partidas: number;
  visitas: number;
  dias: number;
};

export const misNumeros = (desde: Date) => leer<Numeros | null>((s) => s.rpc("inicio_numeros", { p_desde: desde.toISOString() }), null);

export type EmojiEstudio = { emoji: string; veces: number; personas: number; desde: string };

export const emojiDelEstudio = () =>
  leer<EmojiEstudio[]>((s) => s.rpc("inicio_emoji_del_estudio"), []).then((f) =>
    f[0] ? { ...f[0], veces: Number(f[0].veces), personas: Number(f[0].personas) } : null
  );

/* ───────────── Lo que pasó en el estudio ───────────── */

export type Actividad = {
  tipo: "logos" | "tarjetas" | "cliente" | "nuevo" | "presentacion";
  cuando: string;
  user_id: string | null;
  nombre: string | null;
  avatar: string | null;
  brand_id: string | null;
  cantidad: number;
  ref: string | null;
  titulo: string | null;
  mes?: number | null;
  anio?: number | null;
  tipoPresentacion?: string | null;
};

export async function actividadDelEstudio(): Promise<Actividad[]> {
  const [base, presentaciones] = await Promise.all([
    leer<Actividad[]>((s) => s.rpc("inicio_actividad", { p_dias: 21, p_limite: 14 }), []),
    leer<(Omit<Actividad, "tipo" | "cantidad" | "tipoPresentacion"> & { tipo: string })[]>(
      (s) => s.rpc("inicio_actividad_presentaciones", { p_dias: 21, p_limite: 6 }),
      []
    ),
  ]);
  const todas: Actividad[] = [
    ...base.map((a) => ({ ...a, cantidad: Number(a.cantidad) })),
    ...presentaciones.map((p) => ({ ...p, tipo: "presentacion" as const, tipoPresentacion: p.tipo, cantidad: 1 })),
  ];
  return todas.sort((a, b) => b.cuando.localeCompare(a.cuando)).slice(0, 12);
}

/* ───────────── Saludos ───────────── */

export type Ocasion = "cumple" | "aniversario" | "bienvenida";

/** Le manda el saludo a la campanita de esa persona. Tira el error con el motivo si la base dice que no. */
export async function saludar(personaId: string, ocasion: Ocasion, texto: string) {
  const supabase = await loadClient();
  const { error } = await supabase.rpc("inicio_saludar", { p_persona: personaId, p_ocasion: ocasion, p_texto: texto });
  if (error) throw new Error(error.message);
}

/* ───────────── Fechas de las marcas ───────────── */

export type TipoFecha = "lanzamiento" | "aniversario" | "campana" | "evento" | "otro";

export const TIPOS_FECHA: { id: TipoFecha; label: string; emoji: string }[] = [
  { id: "lanzamiento", label: "Lanzamiento", emoji: "🚀" },
  { id: "campana", label: "Campaña", emoji: "📣" },
  { id: "evento", label: "Evento", emoji: "🎟️" },
  { id: "aniversario", label: "Aniversario", emoji: "🎉" },
  { id: "otro", label: "Otra fecha", emoji: "📌" },
];

export const tipoFecha = (id: string) => TIPOS_FECHA.find((t) => t.id === id) ?? TIPOS_FECHA[TIPOS_FECHA.length - 1];

export type FechaMarca = { id: string; brand_id: string; fecha: string; titulo: string; tipo: TipoFecha; anual: boolean };

export const fechasDeMarcas = (brandIds?: string[]) =>
  leer<FechaMarca[]>((s) => {
    let q = s.from("marca_fechas").select("id, brand_id, fecha, titulo, tipo, anual").order("fecha");
    if (brandIds) q = q.in("brand_id", brandIds.length ? brandIds : ["00000000-0000-0000-0000-000000000000"]);
    return q;
  }, []);

export async function crearFecha(f: Omit<FechaMarca, "id">) {
  const supabase = await loadClient();
  const { error } = await supabase.from("marca_fechas").insert(f);
  if (error) throw new Error(error.message);
}

export async function borrarFecha(id: string) {
  const supabase = await loadClient();
  const { error } = await supabase.from("marca_fechas").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** La próxima vez que cae una fecha (las anuales, este año o el que viene), como AAAA-MM-DD. */
export function proximaVez(f: Pick<FechaMarca, "fecha" | "anual">, hoy: string): string | null {
  if (!f.anual) return f.fecha >= hoy ? f.fecha : null;
  const y = Number(hoy.slice(0, 4));
  const esteAnio = `${y}${f.fecha.slice(4)}`;
  return esteAnio >= hoy ? esteAnio : `${y + 1}${f.fecha.slice(4)}`;
}

/* ───────────── Seguir donde dejaste ───────────── */

export type UltimaTarjeta = { id: string; title: string; content_text: string; brand_id: string | null; updated_at: string };
export type UltimaPresentacion = { id: string; titulo: string; tipo: string; brand_id: string; mes: number; anio: number; updated_at: string };
export type UltimoBanner = { cantidad: number; creado: string };

export async function dondeDejaste(userId: string) {
  const [tarjeta, presentacion, banner] = await Promise.all([
    leer<UltimaTarjeta[]>(
      (s) => s.from("cards").select("id, title, content_text, brand_id, updated_at").eq("owner_id", userId).order("updated_at", { ascending: false }).limit(1),
      []
    ),
    leer<UltimaPresentacion[]>(
      (s) =>
        s.from("presentaciones").select("id, titulo, tipo, brand_id, mes, anio, updated_at").eq("creada_por", userId).order("updated_at", { ascending: false }).limit(1),
      []
    ),
    leer<UltimoBanner[]>((s) => s.from("uso_herramientas").select("cantidad, creado").eq("tipo", "banner").order("creado", { ascending: false }).limit(1), []),
  ]);
  return { tarjeta: tarjeta[0] ?? null, presentacion: presentacion[0] ?? null, banner: banner[0] ?? null };
}

/* ───────────── Tu semana ───────────── */

/** Las tareas que moviste esta semana en el Board: cuántas cerraste y cuántas hiciste avanzar. */
export async function tuSemana(equipoId: string, desde: Date) {
  const filas = await leer<{ tarea_id: number; a: string | null }[]>(
    (s) => s.from("tarea_movimientos").select("tarea_id, a").eq("autor_id", equipoId).eq("tipo", "etapa").gte("creado", desde.toISOString()).limit(2000),
    []
  );
  const cerradas = new Set(filas.filter((f) => f.a === "finalizada").map((f) => Number(f.tarea_id)));
  const movidas = new Set(filas.map((f) => Number(f.tarea_id)));
  return { cerradas: cerradas.size, movidas: movidas.size };
}

/* ───────────── Wrapped ───────────── */

export type Wrapped = {
  anio: number;
  yo: {
    visitas: number;
    dias: number;
    primera: string | null;
    racha: number;
    hora: number | null;
    dia_semana: number | null;
    herramientas: { modulo: string; visitas: number }[];
    emojis: number;
    gifs: number;
    iconos: number;
    conversiones: number;
    bytes_convertidos: number;
    retoques: number;
    banners: number;
    tarjetas_copiadas: number;
    redacciones_copiadas: number;
    top_emojis: { emoji: string; veces: number }[];
    tarjetas_creadas: number;
    redacciones_creadas: number;
    descargas?: number;
    bytes_bajados?: number;
    plataforma?: string | null;
    partidas?: number;
    juego?: string | null;
    tareas?: number;
    marca?: string | null;
    percentil: number | null;
  };
  estudio: {
    visitas: number;
    personas: number;
    herramienta: string | null;
    emoji: string | null;
    emojis: number;
    partidas?: number;
    gamer?: { nombre: string; avatar: string | null; partidas: number } | null;
    descargas?: number;
  };
};

export const wrappedDe = (anio: number) => leer<Wrapped | null>((s) => s.rpc("inicio_wrapped", { p_anio: anio }), null);
