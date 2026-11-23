/**
 * Lo que viaja entre el servidor y la página del Correo. Sin dependencias: lo usan los dos lados.
 */

/** El tipo de carpeta, para el ícono, el nombre en castellano y el orden de la lista. */
export type TipoCarpeta = "inbox" | "drafts" | "sent" | "archive" | "junk" | "trash" | "otra";

export type Carpeta = {
  /** El nombre real en el servidor (ej: "INBOX.Sent"): es lo que se manda para abrirla. */
  path: string;
  /** Cómo se muestra (ej: "Enviados"). */
  nombre: string;
  tipo: TipoCarpeta;
  /** Cuántos niveles adentro de otra está (0 = arriba de todo). */
  nivel: number;
  total: number;
  noLeidos: number;
};

export type Direccion = { nombre: string | null; email: string };

export type MensajeResumen = {
  uid: number;
  asunto: string;
  de: Direccion[];
  para: Direccion[];
  /** ISO. La fecha del mail o, si no tiene, la de llegada. */
  fecha: string;
  leido: boolean;
  destacado: boolean;
  respondido: boolean;
  adjuntos: boolean;
  tamano: number;
};

export type Adjunto = {
  /** Su posición en el mail: es lo que se pide para bajarlo. */
  indice: number;
  nombre: string;
  tipo: string;
  tamano: number;
  /** Una imagen dentro del texto (no aparece en la lista de adjuntos). */
  inline: boolean;
};

export type Mensaje = MensajeResumen & {
  cc: Direccion[];
  responderA: Direccion[];
  messageId: string | null;
  /** El HTML tal cual vino (la página lo limpia antes de mostrarlo). null si es solo texto. */
  html: string | null;
  texto: string | null;
  listaAdjuntos: Adjunto[];
};

export type ListaMensajes = {
  carpeta: string;
  /** Total de la carpeta, o de la búsqueda si hay una. */
  total: number;
  pagina: number;
  porPagina: number;
  mensajes: MensajeResumen[];
};

/** Lo mínimo para saber si llegó algo nuevo sin traer la lista. */
export type EstadoCarpeta = { carpeta: string; total: number; noLeidos: number; uidNext: number };

export type EstadoCuenta = {
  conectada: boolean;
  /** La casilla: el mail con el que entraste a la app. */
  email: string | null;
  /** Si ese mail puede tener casilla acá (solo los del dominio del estudio). */
  puede: boolean;
  dominio: string;
  servidor: string;
  /** Falta algo en el servidor para guardar la contraseña (INTEGRACIONES_SECRET). */
  sinSecreto?: boolean;
};

export type AccionMensaje = "leido" | "no_leido" | "destacar" | "quitar_destacado" | "archivar" | "papelera" | "mover";

export type ModoEnvio = "nuevo" | "responder" | "responder_todos" | "reenviar";

export type DatosEnvio = {
  para: string[];
  cc: string[];
  cco: string[];
  asunto: string;
  html: string;
  texto: string;
  modo: ModoEnvio;
  /** El mail que se responde o reenvía: el servidor lo cita y, si se reenvía, le copia los adjuntos. */
  original?: { carpeta: string; uid: number };
};

/** Lo que se puede adjuntar de una (Vercel corta los pedidos de más de 4,5 MB, con el texto incluido). */
export const MAX_ADJUNTOS_BYTES = 4 * 1024 * 1024;

/** Qué hace cada código de error: "auth" pide la contraseña de nuevo, "conexion" es el servidor. */
export type CodigoError = "auth" | "conexion" | "sin_cuenta" | "sin_migracion" | "otro";

export const NOMBRES_CARPETA: Record<Exclude<TipoCarpeta, "otra">, string> = {
  inbox: "Recibidos",
  drafts: "Borradores",
  sent: "Enviados",
  archive: "Archivo",
  junk: "Spam",
  trash: "Papelera",
};

export function formatoTamano(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

export const nombreDireccion = (d: Direccion) => d.nombre?.trim() || d.email;
