import type { SupabaseClient } from "@supabase/supabase-js";
import type { Drive } from "@/lib/integraciones/google";
import { MESES } from "@/lib/plani/config";

/**
 * Dónde va el material de cada presentación en el Drive del estudio, como lo ordenan ellos:
 *
 *   PAUTAS DIGITAL / 2026 / AVATR / 10_OCTUBRE / Plani
 *   (la raíz)       / año  / marca / mes        / la carpeta del tipo (Plani, Anuncios…)
 *
 * La marca se busca por nombre (sin mayúsculas, tildes ni espacios) y se recuerda; el año, el mes y
 * la carpeta del tipo se crean si faltan. Si la marca no aparece, el material va a "Sin carpeta" y
 * se mueve cuando alguien elige la carpeta (o la pega). Solo lo usa el servidor.
 */

export type PresentacionDrive = {
  id: string;
  anio: number;
  mes: number;
  drive_carpeta_id: string | null;
  brands: { id: string; name: string } | null;
  presentacion_tipos: { nombre: string; carpeta: string | null } | null;
};

export const SELECT_PRESENTACION = "id, anio, mes, drive_carpeta_id, brands(id, name), presentacion_tipos(nombre, carpeta)";

/** Para comparar nombres de carpetas: "CAR ONE 0KM" y "Car One 0km" son la misma. */
export const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

/** "10_OCTUBRE", como las que ya tienen. */
export const nombreMes = (mes: number) => `${String(mes).padStart(2, "0")}_${normalizar(MESES[mes - 1]).toUpperCase()}`;

/** Si una carpeta es la de ese mes: "10_OCTUBRE", "10 - Octubre", "Octubre"… */
function esDelMes(nombre: string, mes: number) {
  const m = nombre.trim().match(/^0?(\d{1,2})(?=[\s_.\-]|$)/);
  if (m) return Number(m[1]) === mes;
  return normalizar(nombre).startsWith(normalizar(MESES[mes - 1]));
}

/** El id de una carpeta en un link de Drive ("…/folders/<id>?…", "?id=<id>") o el id pelado. */
export function idDeLink(link: string) {
  const t = link.trim();
  const m = t.match(/\/folders\/([\w-]{10,})/) ?? t.match(/[?&]id=([\w-]{10,})/);
  if (m) return m[1];
  return /^[\w-]{10,}$/.test(t) ? t : null;
}

export type Paso = { nombre: string; id: string | null };
export type Sugerida = {
  /** Desde la raíz: las que tienen id ya existen; las demás se crean al usarla. */
  pasos: Paso[];
  /** Lo que falta para poder usarla sola: la raíz (la elige un admin) o la carpeta de la marca. */
  falta: "raiz" | "marca" | null;
};

const claveMarca = (brandId: string, anio: number) => `marca:${brandId}:${anio}`;

async function recordada(db: SupabaseClient, clave: string) {
  const { data } = await db.from("drive_carpetas").select("drive_id").eq("clave", clave).maybeSingle();
  return (data?.drive_id as string | undefined) ?? null;
}

/** La carpeta que le toca a la presentación, con lo que existe y lo que habría que crear. */
export async function sugerida(drive: Drive, db: SupabaseClient, p: PresentacionDrive): Promise<Sugerida> {
  if (!drive.raizElegida || !drive.completo) return { pasos: [], falta: "raiz" };
  const raiz = await drive.raiz();
  const pasos: Paso[] = [{ nombre: (drive.datos.raiz_nombre as string) ?? "Raíz", id: raiz }];
  const marcaNombre = p.brands?.name ?? "Sin marca";
  const tipoCarpeta = p.presentacion_tipos?.carpeta?.trim() || p.presentacion_tipos?.nombre || "Presentación";

  const anios = await drive.carpetasEn(raiz);
  const anio = anios.find((c) => normalizar(c.name) === String(p.anio));
  pasos.push({ nombre: anio?.name ?? String(p.anio), id: anio?.id ?? null });

  // La marca: la que se eligió antes para ese año, o la que tiene el mismo nombre.
  let marca: { id: string; name: string } | null = null;
  if (p.brands) {
    const antes = await recordada(db, claveMarca(p.brands.id, p.anio));
    if (antes && anio) marca = (await drive.carpetasEn(anio.id)).find((c) => c.id === antes) ?? null;
    if (!marca && anio) marca = (await drive.carpetasEn(anio.id)).find((c) => normalizar(c.name) === normalizar(marcaNombre)) ?? null;
  }
  if (!marca) {
    pasos.push({ nombre: marcaNombre.toUpperCase(), id: null });
    pasos.push({ nombre: nombreMes(p.mes), id: null }, { nombre: tipoCarpeta, id: null });
    return { pasos, falta: "marca" };
  }
  pasos.push({ nombre: marca.name, id: marca.id });

  const mes = (await drive.carpetasEn(marca.id)).find((c) => esDelMes(c.name, p.mes));
  pasos.push({ nombre: mes?.name ?? nombreMes(p.mes), id: mes?.id ?? null });
  const tipo = mes ? (await drive.carpetasEn(mes.id)).find((c) => normalizar(c.name) === normalizar(tipoCarpeta)) : undefined;
  pasos.push({ nombre: tipo?.name ?? tipoCarpeta, id: tipo?.id ?? null });
  return { pasos, falta: null };
}

/** Crea lo que falta del camino y devuelve la última carpeta. */
export async function crearCamino(drive: Drive, pasos: Paso[]) {
  let padre: string | null = null;
  for (const paso of pasos) {
    if (!paso.id) {
      if (!padre) throw new Error("Falta la carpeta raíz");
      paso.id = (await drive.crearCarpeta(paso.nombre, padre)).id;
    }
    padre = paso.id;
  }
  if (!padre) throw new Error("No hay carpeta");
  return padre;
}

/**
 * Deja la presentación en esa carpeta: la anota y mueve ahí lo que la app ya había subido (las
 * carpetas de cada día, que estaban en "Sin carpeta" o en la carpeta anterior). Si la carpeta está
 * en raíz / año / marca / …, recuerda la de la marca para las próximas de ese año.
 */
export async function usarCarpeta(drive: Drive, db: SupabaseClient, p: PresentacionDrive, carpeta: string) {
  const { data: dias } = await db.from("drive_carpetas").select("clave, drive_id").like("clave", `dia:${p.id}:%`);
  for (const d of dias ?? []) await drive.mover(d.drive_id as string, carpeta).catch(() => undefined);
  const { error } = await db.from("presentaciones").update({ drive_carpeta_id: carpeta }).eq("id", p.id);
  if (error) throw new Error(error.message);

  // "Sin carpeta" de esta presentación quedó vacía: a la papelera.
  const sin = await recordada(db, `sincarpeta:${p.id}`);
  if (sin && (await drive.vacia(sin).catch(() => false))) {
    await drive.borrar(sin).catch(() => undefined);
    await db.from("drive_carpetas").delete().eq("clave", `sincarpeta:${p.id}`);
  }

  const raiz = drive.raizElegida ? await drive.raiz() : null;
  const camino = raiz ? await drive.ruta(carpeta, raiz).catch(() => null) : null;
  if (camino && camino.length >= 3 && p.brands && normalizar(camino[1].name) === String(p.anio)) {
    await db.from("drive_carpetas").upsert({ clave: claveMarca(p.brands.id, p.anio), drive_id: camino[2].id });
  }
  return camino;
}

/** Adónde va lo que se sube de una presentación que todavía no tiene carpeta. */
export async function sinCarpeta(drive: Drive, p: PresentacionDrive) {
  const raiz = await drive.raiz();
  const general = await drive.carpeta("sincarpeta", "Sin carpeta", raiz);
  const nombre = `${p.brands?.name ?? "Sin marca"} · ${p.presentacion_tipos?.nombre ?? "Presentación"} ${MESES[p.mes - 1]} ${p.anio}`;
  return drive.carpeta(`sincarpeta:${p.id}`, nombre, general);
}
