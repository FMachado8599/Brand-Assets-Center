import { NextResponse } from "next/server";
import type { BoardResumen, ProyectoResumen } from "@/lib/board/tipos";
import { createSupabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/** Supabase devuelve de a 1000 filas como mucho: las tablas grandes (tareas, columnas) se leen por páginas. */
const PAGINA = 1000;

type Respuesta<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

async function todas<T>(pagina: (desde: number, hasta: number) => Respuesta<T>) {
  const filas: T[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await pagina(desde, desde + PAGINA - 1);
    if (error) throw new Error(error.message);
    filas.push(...(data ?? []));
    if (!data || data.length < PAGINA) return filas;
  }
}

const sinTabla = (message: string) => /does not exist|schema cache|42P01/i.test(message);

const ETAPAS_CERRADAS = new Set(["done", "not_now"]);

/**
 * Lo que hay de Basecamp en la base, contado por proyecto (Board, paso 1: ver que se trajo todo).
 * Se lee con la sesión de quien pide, así que las tablas siguen protegidas por RLS.
 */
export async function GET() {
  const db = createSupabaseServer();
  try {
    const [proyectos, brands, personas, tableros, columnas, tareas] = await Promise.all([
      todas<{ id: number; nombre: string; estado: string; app_url: string | null; ignorado: boolean; brand_id: string | null }>((a, b) =>
        db.from("bc_proyectos").select("id, nombre, estado, app_url, ignorado, brand_id").order("id").range(a, b)
      ),
      todas<{ id: string; name: string }>((a, b) => db.from("brands").select("id, name").order("id").range(a, b)),
      db.from("bc_personas").select("id", { count: "exact", head: true }),
      todas<{ id: number; proyecto_id: number }>((a, b) => db.from("bc_tableros").select("id, proyecto_id").order("id").range(a, b)),
      todas<{ id: number; estado: string | null }>((a, b) => db.from("bc_columnas").select("id, estado").order("id").range(a, b)),
      todas<{ proyecto_id: number; columna_id: number | null; completada: boolean }>((a, b) =>
        db.from("bc_tareas").select("proyecto_id, columna_id, completada").order("id").range(a, b)
      ),
    ]);
    if (personas.error) throw new Error(personas.error.message);

    let miembros: { proyecto_id: number }[] | null = null;
    try {
      miembros = await todas<{ proyecto_id: number }>((a, b) =>
        db.from("bc_proyecto_personas").select("proyecto_id").order("proyecto_id").order("persona_id").range(a, b)
      );
    } catch (e) {
      if (!sinTabla((e as Error).message)) throw e;
    }

    const contar = <T,>(filas: T[], clave: (f: T) => number) => {
      const m = new Map<number, number>();
      for (const f of filas) m.set(clave(f), (m.get(clave(f)) ?? 0) + 1);
      return m;
    };
    const etapa = new Map(columnas.map((c) => [c.id, c.estado]));
    const abierta = (t: (typeof tareas)[number]) => !t.completada && !ETAPAS_CERRADAS.has(etapa.get(t.columna_id ?? 0) ?? "");
    const porTableros = contar(tableros, (t) => t.proyecto_id);
    const porTareas = contar(tareas, (t) => t.proyecto_id);
    const porAbiertas = contar(tareas.filter(abierta), (t) => t.proyecto_id);
    const porMiembros = miembros ? contar(miembros, (m) => m.proyecto_id) : null;
    const brandPorId = new Map(brands.map((b) => [b.id, b]));

    const lista: ProyectoResumen[] = proyectos
      .map((p) => ({
        id: p.id,
        nombre: p.nombre,
        estado: p.estado,
        app_url: p.app_url,
        ignorado: p.ignorado,
        cliente: p.brand_id ? (brandPorId.get(p.brand_id) ?? null) : null,
        tableros: porTableros.get(p.id) ?? 0,
        tareas: porTareas.get(p.id) ?? 0,
        abiertas: porAbiertas.get(p.id) ?? 0,
        miembros: porMiembros ? (porMiembros.get(p.id) ?? 0) : null,
      }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

    const activos = lista.filter((p) => p.estado === "active");
    const body: BoardResumen = {
      proyectos: lista,
      totales: {
        proyectos: activos.length,
        archivados: lista.length - activos.length,
        personas: personas.count ?? 0,
        tableros: tableros.length,
        tareas: tareas.length,
        abiertas: tareas.filter(abierta).length,
        miembros: miembros ? miembros.length : null,
      },
    };
    return NextResponse.json(body);
  } catch (e) {
    const message = (e as Error).message;
    const sinMigracion = sinTabla(message);
    return NextResponse.json(
      { error: sinMigracion ? "Falta correr supabase/migracion-integraciones.sql en Supabase" : message, sinMigracion },
      { status: sinMigracion ? 503 : 500 }
    );
  }
}
