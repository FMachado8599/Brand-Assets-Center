/**
 * El perfil de cada cuenta (supabase/migracion-perfil.sql): la foto elegida, el nombre para mostrar,
 * el estado, "fuera de oficina hasta…" y el color de acento. Lo del Board (puestos, hub, marcas) no
 * está acá: sale del equipo (lib/board/equipo.ts) y se cruza por el mail.
 *
 * Este archivo no carga el cliente de Supabase: lo usan la píldora de la cuenta (que está en todas las
 * páginas) y el Board por igual.
 */

export type FotoOrigen = "google" | "basecamp" | "subida";

export type Perfil = {
  id: string;
  email: string | null;
  /** De Google: se actualizan solos en cada ingreso. */
  full_name: string | null;
  avatar_url: string | null;
  nombre_visible: string | null;
  /** null: todavía no eligió (la cuenta muestra la de Google y el Board la de Basecamp). */
  foto_origen: FotoOrigen | null;
  foto_url: string | null;
  foto_path: string | null;
  estado_emoji: string | null;
  estado_texto: string | null;
  /** Cuándo se borra solo el estado (null: no se borra). */
  estado_vence: string | null;
  /** AAAA-MM-DD, inclusive. */
  fuera_hasta: string | null;
  acento: string | null;
};

export type PerfilPatch = Partial<
  Pick<Perfil, "nombre_visible" | "foto_origen" | "foto_url" | "foto_path" | "estado_emoji" | "estado_texto" | "estado_vence" | "fuera_hasta" | "acento">
>;

export const AVATARES = "avatares";

/** La URL pública de una foto subida (el bucket avatares es público). */
export function urlFotoSubida(path: string) {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  return `${base}/storage/v1/object/public/${AVATARES}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/** Sin migracion-perfil.sql las columnas nuevas no vienen: quedan en null. */
export function normalizarPerfil(row: Record<string, unknown>): Perfil {
  const s = (k: string) => (typeof row[k] === "string" && (row[k] as string) !== "" ? (row[k] as string) : null);
  const origen = s("foto_origen");
  return {
    id: String(row.id),
    email: s("email")?.toLowerCase() ?? null,
    full_name: s("full_name"),
    avatar_url: s("avatar_url"),
    nombre_visible: s("nombre_visible"),
    foto_origen: origen === "google" || origen === "basecamp" || origen === "subida" ? origen : null,
    foto_url: s("foto_url"),
    foto_path: s("foto_path"),
    estado_emoji: s("estado_emoji"),
    estado_texto: s("estado_texto"),
    estado_vence: s("estado_vence"),
    fuera_hasta: s("fuera_hasta"),
    acento: s("acento"),
  };
}

/** La fila trae las columnas de migracion-perfil.sql. */
export const tieneColumnasPerfil = (row: Record<string, unknown>) => "foto_origen" in row;

/** Falta correr supabase/migracion-perfil.sql. */
export const faltaMigracionPerfil = (message: string) =>
  /nombre_visible|foto_origen|foto_url|foto_path|estado_emoji|estado_texto|estado_vence|fuera_hasta|acento|avatares|bucket not found|42703/i.test(message);

export function perfilErrorMessage(message: string) {
  if (faltaMigracionPerfil(message)) return "Falta correr supabase/migracion-perfil.sql en Supabase.";
  if (/profiles_acento_hex/i.test(message)) return "Ese color no es válido.";
  if (/profiles_estado_largo|profiles_nombre_visible_largo/i.test(message)) return "Es demasiado largo.";
  if (/row-level security|permission denied/i.test(message)) return "No tenés permiso para cambiar eso.";
  if (/payload too large|exceeded the maximum/i.test(message)) return "La foto pesa demasiado.";
  return message;
}

/**
 * La foto que eligió en su perfil. null si no eligió (cada lugar usa la suya de siempre: Google en la
 * cuenta, Basecamp en el Board). `basecamp`: su foto de Basecamp de ahora (si se conoce), que gana
 * sobre la guardada al elegirla, por si la cambió después.
 */
export function fotoElegida(perfil: Perfil | null | undefined, basecamp?: string | null): string | null {
  if (!perfil?.foto_origen) return null;
  if (perfil.foto_origen === "subida") return perfil.foto_url;
  if (perfil.foto_origen === "basecamp") return basecamp || perfil.foto_url;
  return perfil.avatar_url;
}

export function nombreDe(perfil: Perfil | null | undefined, otro?: string | null) {
  return perfil?.nombre_visible?.trim() || otro?.trim() || perfil?.full_name?.trim() || perfil?.email || "Sin nombre";
}

/** Hoy en este navegador, como AAAA-MM-DD. */
export const hoyISO = (d = new Date()) => d.toLocaleDateString("en-CA");

export type Estado = { emoji: string | null; texto: string | null };

/** El estado, si tiene y no se venció. */
export function estadoVigente(perfil: Perfil | null | undefined, ahora = Date.now()): Estado | null {
  if (!perfil || (!perfil.estado_emoji && !perfil.estado_texto)) return null;
  if (perfil.estado_vence && new Date(perfil.estado_vence).getTime() <= ahora) return null;
  return { emoji: perfil.estado_emoji, texto: perfil.estado_texto };
}

/** Hasta qué día está fuera de oficina (AAAA-MM-DD), o null si está en la oficina. */
export function fueraDeOficina(perfil: Perfil | null | undefined, hoy = hoyISO()): string | null {
  return perfil?.fuera_hasta && perfil.fuera_hasta >= hoy ? perfil.fuera_hasta : null;
}

/** "2026-11-26" → "jue 26 nov" (y el año si no es este). */
export function fechaCorta(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const fecha = new Date(y, m - 1, d);
  const texto = fecha.toLocaleDateString("es-UY", {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(y !== new Date().getFullYear() ? { year: "numeric" } : {}),
  });
  return texto.replace(/,/g, "").replace(/\./g, "");
}

/** "Fuera de oficina hasta el jue 26 nov" / "… hasta hoy". */
export function textoFuera(hasta: string) {
  return hasta === hoyISO() ? "Fuera de oficina hoy" : `Fuera de oficina hasta el ${fechaCorta(hasta)}`;
}

/** Cuándo se borra el estado, en palabras. */
export function textoVence(iso: string | null) {
  if (!iso) return "No se borra solo";
  const fecha = new Date(iso);
  const hora = fecha.toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  if (hoyISO(fecha) === hoyISO()) return `Se borra hoy a las ${hora}`;
  const manana = new Date();
  manana.setDate(manana.getDate() + 1);
  if (hoyISO(fecha) === hoyISO(manana)) return `Se borra mañana a las ${hora}`;
  return `Se borra el ${fechaCorta(hoyISO(fecha))}`;
}

/** Las opciones de "Se borra": cada una calcula el momento desde ahora. */
export const VENCIMIENTOS: { value: string; label: string; desde: (ahora: Date) => Date | null }[] = [
  { value: "1h", label: "En 1 hora", desde: (a) => new Date(a.getTime() + 60 * 60_000) },
  { value: "4h", label: "En 4 horas", desde: (a) => new Date(a.getTime() + 4 * 60 * 60_000) },
  { value: "hoy", label: "Hoy, al final del día", desde: (a) => new Date(a.getFullYear(), a.getMonth(), a.getDate(), 23, 59) },
  {
    value: "semana",
    label: "Esta semana",
    // El viernes a la noche (si ya es fin de semana, el domingo).
    desde: (a) => {
      const dia = a.getDay();
      const hasta = dia === 0 ? 0 : dia === 6 ? 1 : 5 - dia;
      return new Date(a.getFullYear(), a.getMonth(), a.getDate() + hasta, 23, 59);
    },
  },
  { value: "nunca", label: "No se borra", desde: () => null },
];

export type EstadoRapido = { emoji: string; texto: string; vence: string; fuera?: boolean };

/** Los estados de un toque. */
export const ESTADOS_RAPIDOS: EstadoRapido[] = [
  { emoji: "🎧", texto: "En foco", vence: "4h" },
  { emoji: "📅", texto: "En reunión", vence: "1h" },
  { emoji: "🍽️", texto: "Almorzando", vence: "1h" },
  { emoji: "🏠", texto: "Desde casa", vence: "hoy" },
  { emoji: "🎬", texto: "En rodaje", vence: "hoy" },
  { emoji: "🤒", texto: "De licencia", vence: "hoy" },
  { emoji: "🌴", texto: "De vacaciones", vence: "nunca", fuera: true },
];

/** Para elegir el emoji del estado. */
export const EMOJIS_ESTADO = [
  "🎧", "💻", "🎨", "✍️", "📸", "🎬", "📅", "☕", "🍽️", "🏠", "🚗", "✈️", "🌴", "🤒", "🧘", "🏃",
  "🔥", "🚀", "🧠", "🤝", "🎉", "😴", "🤫", "👀", "💡", "📣", "🎯", "⏳", "✅", "❤️", "🙌", "🌧️",
];

/** Los colores de acento para elegir rápido (el resto, con el selector). */
export const ACENTOS = ["#FFD60A", "#F97316", "#E11D48", "#B61760", "#7C3AED", "#1D4ED8", "#0891B2", "#047857", "#65A30D", "#52525B"];

/** "#B61760" → "rgba(182, 23, 96, 0.2)", para fondos suaves con el acento. */
export function conAlfa(hex: string, alfa: number) {
  const v = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(v)) return `rgba(0, 0, 0, ${alfa})`;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alfa})`;
}

/**
 * Recorta una imagen al centro, en cuadrado, y la achica a `lado` px: lo que se sube como foto de
 * perfil pesa poco y se ve igual en todos lados.
 */
export async function recortarFoto(file: File, lado = 512): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("No se pudo leer la imagen"));
      i.src = url;
    });
    const w = img.naturalWidth || lado;
    const h = img.naturalHeight || lado;
    const corte = Math.min(w, h);
    const salida = Math.min(lado, corte);
    const canvas = document.createElement("canvas");
    canvas.width = salida;
    canvas.height = salida;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No se pudo preparar la foto");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, salida, salida);
    ctx.drawImage(img, (w - corte) / 2, (h - corte) / 2, corte, corte, 0, 0, salida, salida);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("No se pudo preparar la foto"))), "image/jpeg", 0.88)
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const FOTO_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";
