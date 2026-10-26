import type { SupabaseClient } from "@supabase/supabase-js";
import { PRESET_COLORS } from "@/lib/clients/color";
import { fold } from "@/lib/redaccion/text";
import type { Basecamp } from "./basecamp";

/**
 * Sincronización con Basecamp, en pasos cortos: cada pedido al servidor hace uno (o un pedazo de
 * uno) y dice cuál sigue. Así nunca pasa el límite de tiempo de una función de Vercel y la app
 * puede mostrar el avance.
 *
 *  personas  → la gente de la cuenta (para ver quién está asignado a qué).
 *  proyectos → cada proyecto activo es un cliente: se vincula al que ya existe con ese nombre o se
 *              crea. Los internos se marcan "no es cliente" (ignorado) y no se tocan más.
 *  miembros  → quién está en cada proyecto (para "mis marcas"). Si falta migracion-board.sql se
 *              saltea sin frenar lo demás.
 *  tareas    → las cards que cambiaron desde la última vez (la primera vez, las de los últimos
 *              120 días), de todos los proyectos en una sola lista. Con `completa`, todas.
 *  columnas  → en qué tablero (sector) y etapa está cada columna nueva.
 *  actividad → lo último que hizo cada persona del equipo en Basecamp (su timeline) y, al final, la
 *              regla de activos: sin actividad en 30 días, inactivo (migracion-actividad.sql; sin
 *              esa migración se saltea).
 */

export type SyncPaso = "personas" | "proyectos" | "miembros" | "tareas" | "columnas" | "actividad" | "listo";

export type SyncResumen = {
  personas?: number;
  proyectos?: number;
  clientesNuevos?: string[];
  vinculados?: string[];
  /** Cuántas personas-en-proyecto; null si falta la tabla (migracion-board.sql). */
  miembros?: number | null;
  tareas?: number;
  columnas?: number;
  requests?: number;
  /** Traer todas las tareas, no solo lo que cambió (y borrar las que ya no están en Basecamp). */
  completa?: boolean;
  /** Mientras se leen los miembros en varios pedidos: el último proyecto leído. */
  miembrosDesde?: number | null;
  /** Mientras se lee la actividad en varios pedidos: la última persona leída. */
  actividadDesde?: number | null;
  /** Lo que cambió la regla de activos al terminar. null si falta migracion-actividad.sql. */
  actividad?: { leidas: number; desactivados: string[]; reactivados: string[] } | null;
  /** Mientras se leen las tareas en varios pedidos: por dónde seguir y desde cuándo se empezó. */
  cursor?: string | null;
  inicio?: string | null;
};

export type SyncRespuesta = {
  paso: SyncPaso;
  siguiente: SyncPaso;
  detalle: string;
  resumen: SyncResumen;
};

const PRIMERA_VEZ_DIAS = 120;
/** Margen de tiempo por pedido (las funciones de Vercel cortan a los 60 s). */
const PRESUPUESTO_MS = 38_000;

/* ───────────── Formas que devuelve Basecamp ───────────── */

type BcPerson = {
  id: number;
  name: string;
  email_address?: string | null;
  avatar_url?: string | null;
  title?: string | null;
  company?: { name?: string | null } | null;
  admin?: boolean;
  client?: boolean;
  personable_type?: string;
};

type BcDock = { id: number; name: string; title: string; enabled: boolean; url: string };

type BcProject = {
  id: number;
  name: string;
  description?: string | null;
  status?: string;
  app_url?: string;
  created_at?: string;
  updated_at?: string;
  dock?: BcDock[];
};

type BcCard = {
  id: number;
  title: string;
  content?: string | null;
  app_url?: string | null;
  due_on?: string | null;
  completed?: boolean;
  assignees?: { id: number }[];
  creator?: { id: number } | null;
  comments_count?: number;
  created_at?: string;
  updated_at: string;
  parent: { id: number; title: string; type?: string };
  bucket: { id: number; name: string };
};

type BcCardTable = {
  lists?: { id: number; title: string; type?: string; position?: number }[];
};

/* ───────────── Etapas ───────────── */

/**
 * Los nombres de columna cambian de proyecto a proyecto ("Validación Interna", "VALIDACIÓN
 * INTERNA", el typo "Implmentación"…). Se normalizan a una etapa; las que no encajan quedan null.
 */
const ETAPAS: Record<string, string> = {
  triage: "triage",
  "para hacer": "para_hacer",
  asignada: "asignada",
  "en proceso": "en_proceso",
  "validacion interna": "validacion",
  validacion: "validacion",
  cliente: "cliente",
  "en cliente": "cliente",
  implementacion: "implementacion",
  implmentacion: "implementacion",
  done: "done",
  hecho: "done",
  "not now": "not_now",
  "stand by": "not_now",
};

export function etapaDeColumna(nombre: string, tipo?: string) {
  if (tipo === "Kanban::Triage") return "triage";
  if (tipo === "Kanban::DoneColumn") return "done";
  if (tipo === "Kanban::NotNowColumn") return "not_now";
  const limpio = fold(nombre)
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  return ETAPAS[limpio] ?? null;
}

const colorPara = (nombre: string) => {
  let h = 0;
  for (const ch of nombre) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PRESET_COLORS[h % PRESET_COLORS.length];
};

async function check<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>) {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
}

/* ───────────── Pasos ───────────── */

async function personas(bc: Basecamp, db: SupabaseClient) {
  const people = await bc.all<BcPerson>(`${bc.base()}/people.json`);
  const rows = people.map((p) => ({
    id: p.id,
    nombre: p.name,
    email: p.email_address?.toLowerCase() ?? null,
    avatar_url: p.avatar_url ?? null,
    cargo: p.title ?? null,
    empresa: p.company?.name ?? null,
    admin: p.admin ?? false,
    cliente: p.client ?? p.personable_type === "Client",
    sincronizado: new Date().toISOString(),
  }));
  for (let i = 0; i < rows.length; i += 500) await check(db.from("bc_personas").upsert(rows.slice(i, i + 500)));
  return rows.length;
}

async function proyectos(bc: Basecamp, db: SupabaseClient) {
  const projects = (await bc.all<BcProject>(`${bc.base()}/projects.json`)).filter((p) => !p.status || p.status === "active");
  const ahora = new Date().toISOString();

  await check(
    db.from("bc_proyectos").upsert(
      projects.map((p) => ({
        id: p.id,
        nombre: p.name.trim(),
        descripcion: p.description ?? null,
        estado: "active",
        app_url: p.app_url ?? null,
        creado: p.created_at ?? null,
        actualizado: p.updated_at ?? null,
        sincronizado: ahora,
      }))
    )
  );

  // Los que ya no están en la lista de activos se archivaron o se borraron en Basecamp.
  const vistos = projects.map((p) => p.id);
  if (vistos.length) {
    await check(db.from("bc_proyectos").update({ estado: "archived" }).eq("estado", "active").not("id", "in", `(${vistos.join(",")})`));
  }

  // Un tablero (Card Table) por sector: Digital, Arte, Creatividad, Producción, Medios…
  const tableros = projects.flatMap((p) =>
    (p.dock ?? [])
      .filter((d) => d.name === "kanban_board" && d.enabled)
      .map((d) => ({ id: d.id, proyecto_id: p.id, nombre: d.title, url: d.url }))
  );
  if (tableros.length) await check(db.from("bc_tableros").upsert(tableros));

  const vinculo = await vincularClientes(db);
  return { proyectos: projects.length, ...vinculo };
}

/**
 * Cada proyecto activo es un cliente. Si ya hay uno con el mismo nombre (sin importar mayúsculas
 * ni tildes) se vinculan; si no, se crea. Los marcados "no es cliente" no se tocan.
 */
async function vincularClientes(db: SupabaseClient) {
  const [proyectos, brands] = await Promise.all([
    check(db.from("bc_proyectos").select("id, nombre").is("brand_id", null).eq("ignorado", false).eq("estado", "active")),
    check(db.from("brands").select("id, name")),
  ]);
  const porNombre = new Map((brands as { id: string; name: string }[]).map((b) => [fold(b.name).trim(), b.id]));
  const clientesNuevos: string[] = [];
  const vinculados: string[] = [];

  for (const p of proyectos as { id: number; nombre: string }[]) {
    const key = fold(p.nombre).trim();
    let brandId = porNombre.get(key);
    if (brandId) {
      vinculados.push(p.nombre);
    } else {
      const { data, error } = await db.from("brands").insert({ name: p.nombre, color: colorPara(p.nombre) }).select("id").single();
      if (error) {
        // Otro pedido lo creó en el medio: se busca y se vincula.
        const { data: existing } = await db.from("brands").select("id").eq("name", p.nombre).maybeSingle();
        if (!existing) throw new Error(`No se pudo crear el cliente ${p.nombre}: ${error.message}`);
        brandId = existing.id as string;
        vinculados.push(p.nombre);
      } else {
        brandId = data.id as string;
        clientesNuevos.push(p.nombre);
      }
      porNombre.set(key, brandId!);
    }
    await check(db.from("bc_proyectos").update({ brand_id: brandId }).eq("id", p.id));
  }
  return { clientesNuevos, vinculados };
}

/** Falta una tabla (no se corrió la migración que la crea). */
const sinTabla = (message: string) => /does not exist|schema cache|42P01/i.test(message);

/**
 * Quién está en cada proyecto activo. Se lee proyecto por proyecto (un pedido cada uno) en orden
 * de id, así si se acaba el tiempo se sigue desde el último.
 */
async function miembros(bc: Basecamp, db: SupabaseClient, desde: number | null, deadline: number) {
  const proyectos = (await check(
    db.from("bc_proyectos").select("id").eq("estado", "active").gt("id", desde ?? 0).order("id")
  )) as { id: number }[];
  let cantidad = 0;
  let ultimo = desde;

  for (const p of proyectos) {
    if (Date.now() > deadline) return { cantidad, complete: false, ultimo };
    let people: BcPerson[];
    try {
      people = await bc.all<BcPerson>(`${bc.base()}/projects/${p.id}/people.json`);
    } catch {
      // Un proyecto que no se puede leer (sin permiso, borrado recién) no frena a los demás.
      ultimo = p.id;
      continue;
    }
    const ahora = new Date().toISOString();
    if (people.length) {
      await check(
        db.from("bc_proyecto_personas").upsert(people.map((person) => ({ proyecto_id: p.id, persona_id: person.id, sincronizado: ahora })))
      );
    }
    // Los que salieron del proyecto desde la última vez.
    await check(
      db
        .from("bc_proyecto_personas")
        .delete()
        .eq("proyecto_id", p.id)
        .not("persona_id", "in", `(${people.map((person) => person.id).join(",") || "0"})`)
    );
    cantidad += people.length;
    ultimo = p.id;
  }
  return { cantidad, complete: true, ultimo };
}

/** Cada cuánto se vuelve a leer la actividad de una persona (un pedido por persona). */
const ACTIVIDAD_CADA_MS = 6 * 3_600_000;

/**
 * Lo último que hizo en Basecamp cada persona del equipo: el primer evento de su timeline
 * (/reports/users/progress/:id.json, del más nuevo al más viejo). Se saltea a quien se leyó hace poco.
 */
async function actividad(bc: Basecamp, db: SupabaseClient, desde: number | null, deadline: number) {
  const equipo = (await check(db.from("equipo").select("bc_persona_id").not("bc_persona_id", "is", null))) as { bc_persona_id: number }[];
  const ids = [...new Set(equipo.map((e) => Number(e.bc_persona_id)))].filter((id) => id > (desde ?? 0)).sort((a, b) => a - b);
  const leidas = ids.length
    ? ((await check(db.from("bc_personas").select("id, actividad_leida").in("id", ids))) as { id: number; actividad_leida: string | null }[])
    : [];
  const leidaEn = new Map(leidas.map((p) => [Number(p.id), p.actividad_leida]));
  const reciente = Date.now() - ACTIVIDAD_CADA_MS;
  let cantidad = 0;
  let ultimo = desde;

  for (const id of ids) {
    if (Date.now() > deadline) return { cantidad, complete: false, ultimo };
    const leida = leidaEn.get(id);
    if (leida && new Date(leida).getTime() > reciente) {
      ultimo = id;
      continue;
    }
    let ultima: string | null = null;
    try {
      const r = await bc.one<{ events?: { created_at?: string }[] }>(`${bc.base()}/reports/users/progress/${id}.json`);
      ultima = r.events?.[0]?.created_at ?? null;
    } catch (e) {
      // Si Basecamp ya no la conoce (404) no hizo nada; cualquier otro error no cuenta como medida.
      if (!/respondió 404/.test((e as Error).message)) {
        ultimo = id;
        continue;
      }
    }
    await check(db.from("bc_personas").update({ ultima_actividad: ultima, actividad_leida: new Date().toISOString() }).eq("id", id));
    cantidad++;
    ultimo = id;
  }
  return { cantidad, complete: true, ultimo };
}

async function tareas(bc: Basecamp, db: SupabaseClient, estado: { tareas_hasta: string | null; resumen: SyncResumen }, deadline: number) {
  const inicio = estado.resumen.inicio ?? new Date().toISOString();
  const corte = estado.resumen.completa
    ? 0
    : estado.tareas_hasta
      ? new Date(estado.tareas_hasta).getTime()
      : Date.now() - PRIMERA_VEZ_DIAS * 86_400_000;
  const desde = estado.resumen.cursor ?? `${bc.base()}/projects/recordings.json?type=Kanban::Card&sort=updated_at&direction=desc`;

  const { items, complete, next } = await bc.until<BcCard>(desde, (c) => new Date(c.updated_at).getTime() <= corte, deadline);

  // Proyectos que todavía no conocemos (creados recién): un registro mínimo, el próximo paso de
  // proyectos lo completa y le busca cliente.
  const conocidos = new Set(
    ((await check(db.from("bc_proyectos").select("id"))) as { id: number }[]).map((p) => Number(p.id))
  );
  const nuevos = new Map<number, string>();
  for (const c of items) if (!conocidos.has(c.bucket.id)) nuevos.set(c.bucket.id, c.bucket.name);
  if (nuevos.size) {
    await check(db.from("bc_proyectos").upsert([...nuevos].map(([id, nombre]) => ({ id, nombre }))));
  }

  const columnas = new Map<number, { id: number; proyecto_id: number; nombre: string; estado: string | null }>();
  for (const c of items) {
    columnas.set(c.parent.id, {
      id: c.parent.id,
      proyecto_id: c.bucket.id,
      nombre: c.parent.title,
      estado: etapaDeColumna(c.parent.title, c.parent.type),
    });
  }
  if (columnas.size) await check(db.from("bc_columnas").upsert([...columnas.values()]));

  const ahora = new Date().toISOString();
  const rows = items.map((c) => ({
    id: c.id,
    proyecto_id: c.bucket.id,
    columna_id: c.parent.id,
    titulo: c.title ?? "",
    contenido: c.content ?? null,
    app_url: c.app_url ?? null,
    vence: c.due_on ?? null,
    completada: c.completed ?? false,
    asignados: (c.assignees ?? []).map((a) => a.id),
    creador_id: c.creator?.id ?? null,
    comentarios: c.comments_count ?? 0,
    creada: c.created_at ?? null,
    actualizada: c.updated_at,
    sincronizada: ahora,
  }));
  for (let i = 0; i < rows.length; i += 500) await check(db.from("bc_tareas").upsert(rows.slice(i, i + 500)));

  if (complete && estado.resumen.completa) {
    // Se leyeron todas las vivas: las que no aparecieron (papelera, archivadas, de proyectos que esta
    // cuenta no ve) dejan de estar acá.
    await check(db.from("bc_tareas").delete().lt("sincronizada", inicio));
  } else if (complete) {
    // Las que se mandaron a la papelera o se archivaron desde la última vez dejan de verse acá.
    for (const status of ["trashed", "archived"]) {
      const { items: fuera } = await bc.until<BcCard>(
        `${bc.base()}/projects/recordings.json?type=Kanban::Card&status=${status}&sort=updated_at&direction=desc`,
        (c) => new Date(c.updated_at).getTime() <= corte,
        deadline + 10_000
      );
      const ids = fuera.map((c) => c.id);
      if (ids.length) await check(db.from("bc_tareas").delete().in("id", ids));
    }
  }

  return { cantidad: rows.length, complete, next, inicio };
}

async function columnasDeTableros(bc: Basecamp, db: SupabaseClient, deadline: number) {
  // Proyectos con columnas que todavía no sabemos de qué tablero son.
  const sueltas = (await check(db.from("bc_columnas").select("proyecto_id").is("tablero_id", null))) as { proyecto_id: number }[];
  const proyectos = [...new Set(sueltas.map((c) => c.proyecto_id).filter(Boolean))];
  if (!proyectos.length) return { leidas: 0, complete: true };

  const tableros = (await check(
    db.from("bc_tableros").select("id, proyecto_id, url, columnas_leidas").in("proyecto_id", proyectos)
  )) as { id: number; proyecto_id: number; url: string | null; columnas_leidas: string | null }[];

  // Un tablero leído hace menos de una hora no se vuelve a pedir (la columna suelta será de un tablero nuevo).
  const hora = Date.now() - 3_600_000;
  const pendientes = tableros.filter((t) => t.url && (!t.columnas_leidas || new Date(t.columnas_leidas).getTime() < hora));
  let leidas = 0;

  for (const t of pendientes) {
    if (Date.now() > deadline) return { leidas, complete: false };
    let table: BcCardTable;
    try {
      table = await bc.one<BcCardTable>(t.url!);
    } catch {
      // Un tablero que no se puede leer (sin permiso, borrado) no frena a los demás.
      await check(db.from("bc_tableros").update({ columnas_leidas: new Date().toISOString() }).eq("id", t.id));
      continue;
    }
    const rows = (table.lists ?? []).map((l) => ({
      id: l.id,
      tablero_id: t.id,
      proyecto_id: t.proyecto_id,
      nombre: l.title,
      estado: etapaDeColumna(l.title, l.type),
      posicion: l.position ?? null,
    }));
    if (rows.length) await check(db.from("bc_columnas").upsert(rows));
    await check(db.from("bc_tableros").update({ columnas_leidas: new Date().toISOString() }).eq("id", t.id));
    leidas++;
  }
  return { leidas, complete: true };
}

/* ───────────── Un pedido ───────────── */

type EstadoSync = { tareas_hasta: string | null; resumen: SyncResumen | null };

export async function correrPaso(
  bc: Basecamp,
  db: SupabaseClient,
  paso: SyncPaso,
  opciones: { completa?: boolean } = {}
): Promise<SyncRespuesta> {
  const deadline = Date.now() + PRESUPUESTO_MS;
  const estado = ((await check(db.from("bc_sync").select("tareas_hasta, resumen").eq("id", "basecamp").maybeSingle())) ??
    { tareas_hasta: null, resumen: null }) as EstadoSync;
  // La opción se elige al empezar y viaja en el resumen por el resto de los pasos.
  let resumen: SyncResumen = paso === "personas" ? { completa: Boolean(opciones.completa) } : { ...(estado.resumen ?? {}) };

  const guardar = async (extra: Record<string, unknown> = {}) => {
    resumen = { ...resumen, requests: (resumen.requests ?? 0) + bc.requests };
    bc.requests = 0;
    await check(
      db
        .from("bc_sync")
        .upsert({ id: "basecamp", resumen, corriendo_desde: new Date().toISOString(), ultimo_error: null, ...extra })
    );
  };

  try {
    if (paso === "personas") {
      resumen.personas = await personas(bc, db);
      await guardar();
      return { paso, siguiente: "proyectos", detalle: `${resumen.personas} personas`, resumen };
    }

    if (paso === "proyectos") {
      const r = await proyectos(bc, db);
      resumen.proyectos = r.proyectos;
      resumen.clientesNuevos = r.clientesNuevos;
      resumen.vinculados = r.vinculados;
      await guardar();
      return { paso, siguiente: "miembros", detalle: `${r.proyectos} proyectos`, resumen };
    }

    if (paso === "miembros") {
      try {
        const r = await miembros(bc, db, resumen.miembrosDesde ?? null, deadline);
        resumen.miembros = (resumen.miembros ?? 0) + r.cantidad;
        if (!r.complete) {
          resumen.miembrosDesde = r.ultimo;
          await guardar();
          return { paso, siguiente: "miembros", detalle: `${resumen.miembros} personas en proyectos…`, resumen };
        }
        resumen.miembrosDesde = null;
      } catch (e) {
        if (!sinTabla((e as Error).message)) throw e;
        resumen.miembros = null;
        resumen.miembrosDesde = null;
      }
      await guardar();
      return { paso, siguiente: "tareas", detalle: resumen.miembros === null ? "Sin tabla de miembros" : `${resumen.miembros} personas en proyectos`, resumen };
    }

    if (paso === "tareas") {
      const r = await tareas(bc, db, { tareas_hasta: estado.tareas_hasta, resumen }, deadline);
      resumen.tareas = (resumen.tareas ?? 0) + r.cantidad;
      if (!r.complete) {
        resumen.cursor = r.next;
        resumen.inicio = r.inicio;
        await guardar();
        return { paso, siguiente: "tareas", detalle: `${resumen.tareas} tareas hasta ahora…`, resumen };
      }
      resumen.cursor = null;
      resumen.inicio = null;
      // Lo que cambie mientras tanto entra la próxima vez: un minuto de margen.
      const hasta = new Date(new Date(r.inicio).getTime() - 60_000).toISOString();
      await guardar({ tareas_hasta: hasta });
      return { paso, siguiente: "columnas", detalle: `${resumen.tareas} tareas`, resumen };
    }

    if (paso === "columnas") {
      const r = await columnasDeTableros(bc, db, deadline);
      resumen.columnas = (resumen.columnas ?? 0) + r.leidas;
      if (!r.complete) {
        await guardar();
        return { paso, siguiente: "columnas", detalle: `${resumen.columnas} tableros leídos…`, resumen };
      }
      await guardar();
      return { paso, siguiente: "actividad", detalle: `${resumen.columnas} tableros leídos`, resumen };
    }

    if (paso === "actividad") {
      try {
        const r = await actividad(bc, db, resumen.actividadDesde ?? null, deadline);
        const leidas = (resumen.actividad?.leidas ?? 0) + r.cantidad;
        if (!r.complete) {
          resumen.actividadDesde = r.ultimo;
          resumen.actividad = { leidas, desactivados: [], reactivados: [] };
          await guardar();
          return { paso, siguiente: "actividad", detalle: `${leidas} personas leídas…`, resumen };
        }
        resumen.actividadDesde = null;
        // La regla de activos: sin actividad en 30 días, inactivo (salvo admins y lo fijado a mano).
        const { data, error } = await db.rpc("equipo_aplicar_actividad", { p_dias: 30 });
        if (error) throw new Error(error.message);
        const cambios = (data ?? {}) as { desactivados?: string[]; reactivados?: string[] };
        resumen.actividad = { leidas, desactivados: cambios.desactivados ?? [], reactivados: cambios.reactivados ?? [] };
      } catch (e) {
        const message = (e as Error).message;
        // Sin migracion-equipo o migracion-actividad, este paso se saltea sin frenar la sincronización.
        if (!sinTabla(message) && !/ultima_actividad|actividad_leida|equipo_aplicar_actividad/i.test(message)) throw e;
        resumen.actividad = null;
        resumen.actividadDesde = null;
      }
      await guardar({ ultimo: new Date().toISOString(), corriendo_desde: null });
      const a = resumen.actividad;
      return {
        paso,
        siguiente: "listo",
        detalle: a ? `Listo · ${a.desactivados.length} inactivos nuevos, ${a.reactivados.length} reactivados` : "Listo",
        resumen,
      };
    }

    return { paso, siguiente: "listo", detalle: "Listo", resumen };
  } catch (e) {
    const message = (e as Error).message;
    await db
      .from("bc_sync")
      .upsert({ id: "basecamp", ultimo_error: message, corriendo_desde: null })
      .then(() => undefined, () => undefined);
    throw e;
  }
}
