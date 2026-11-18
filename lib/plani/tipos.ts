import { CalendarDays, Clapperboard, Gift, Megaphone, MonitorPlay, Presentation, Sparkles, Target, Users, type LucideIcon } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { fold } from "@/lib/redaccion/text";

/**
 * Los tipos de presentación (supabase/migracion-presentaciones.sql): Planificación, Pauta, Leads /
 * Ads, Programática / YouTube y los que el estudio vaya creando. Cada uno tiene su color e ícono,
 * para reconocerlo de un vistazo, y las palabras con las que se lo encuentra en el título de una
 * tarea de Basecamp ("Plani noviembre", "Leads Black Friday"…).
 */
export type TipoPresentacion = {
  id: string;
  nombre: string;
  descripcion: string;
  color: string;
  icono: string;
  palabras: string[];
  orden: number;
  creado_por: string | null;
};

/** Los íconos que puede tener un tipo (se guarda el nombre). */
export const ICONOS: Record<string, { icon: LucideIcon; label: string }> = {
  calendario: { icon: CalendarDays, label: "Calendario" },
  megafono: { icon: Megaphone, label: "Megáfono" },
  objetivo: { icon: Target, label: "Objetivo" },
  pantalla: { icon: MonitorPlay, label: "Pantalla" },
  personas: { icon: Users, label: "Personas" },
  video: { icon: Clapperboard, label: "Video" },
  regalo: { icon: Gift, label: "Regalo" },
  destello: { icon: Sparkles, label: "Destello" },
  presentacion: { icon: Presentation, label: "Presentación" },
};

export const iconoDe = (tipo: Pick<TipoPresentacion, "icono"> | null | undefined) => ICONOS[tipo?.icono ?? ""]?.icon ?? Presentation;

/** Los colores para elegir al crear un tipo (los de los tipos de base, y algunos más). */
export const COLORES_TIPO = ["#7C3AED", "#2563EB", "#DB2777", "#059669", "#EA580C", "#0891B2", "#CA8A04", "#52525B"];

/** Lo que se muestra de un tipo que no se encuentra (borrado, o todavía cargando). */
export const tipoDesconocido = (id: string): TipoPresentacion => ({
  id,
  nombre: id ? id[0].toUpperCase() + id.slice(1).replace(/_/g, " ") : "Presentación",
  descripcion: "",
  color: "#52525B",
  icono: "presentacion",
  palabras: [],
  orden: 999,
  creado_por: null,
});

/** "Programática / YouTube" → "programatica_youtube" (el id: minúsculas, sin tildes ni espacios). */
export function idDeNombre(nombre: string) {
  return (
    fold(nombre)
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "tipo"
  );
}

/** Las palabras, como se guardan: en minúsculas, sin tildes ni repetidas. */
export function normalizarPalabras(texto: string | string[]) {
  const lista = Array.isArray(texto) ? texto : texto.split(",");
  return [...new Set(lista.map((p) => fold(p).replace(/\s+/g, " ").trim()).filter((p) => p.length >= 2))].slice(0, 30);
}

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Si el título nombra esa palabra (entera: "ads" no es "cabezadas"). */
function nombra(titulo: string, palabra: string) {
  return new RegExp(`(^|[^a-z0-9])${escapar(palabra)}($|[^a-z0-9])`).test(titulo);
}

/**
 * El tipo de una tarea de Basecamp, por su título: el que más palabras suyas nombra (si empatan,
 * el que va primero). null si no se parece a ninguno.
 */
export function tipoDeTitulo(titulo: string, tipos: TipoPresentacion[]): TipoPresentacion | null {
  const t = fold(titulo);
  let mejor: TipoPresentacion | null = null;
  let puntos = 0;
  for (const tipo of [...tipos].sort((a, b) => a.orden - b.orden)) {
    const n = tipo.palabras.filter((p) => nombra(t, p)).length;
    if (n > puntos) {
      mejor = tipo;
      puntos = n;
    }
  }
  return mejor;
}

export const tiposRepo = {
  list: () => supabase.from("presentacion_tipos").select("*").order("orden").order("nombre").returns<TipoPresentacion[]>(),

  create: (input: Pick<TipoPresentacion, "id" | "nombre" | "color" | "icono" | "palabras"> & { descripcion?: string }) =>
    supabase.from("presentacion_tipos").insert(input).select().single<TipoPresentacion>(),

  update: (id: string, patch: Partial<Pick<TipoPresentacion, "nombre" | "descripcion" | "color" | "icono" | "palabras">>) =>
    supabase.from("presentacion_tipos").update(patch).eq("id", id).select().single<TipoPresentacion>(),
};
