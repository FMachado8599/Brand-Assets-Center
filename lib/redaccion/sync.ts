import { textToHtml } from "./export";
import type { Redaccion } from "./types";

/**
 * La parte de la sincronización que no depende de React ni de Supabase:
 * cómo se ve una redacción en la tabla y cómo se mezcla lo del navegador con
 * lo de la cuenta. La usa useRedacciones.
 */

export const COLUMNS = "id, title, title_edited, body, html, brand_id, created_at, updated_at, deleted_at";

export type Row = {
  id: string;
  title: string;
  title_edited: boolean;
  body: string;
  /** Vacío en las guardadas antes de que el editor tuviera formato. */
  html: string | null;
  brand_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

/** Tiene cambios que la cuenta todavía no tiene. */
export const isDirty = (r: Redaccion) => r.syncedAt !== r.updatedAt;
/** Una borrada que la cuenta ya conoce no necesita seguir en el navegador. */
export const keep = (r: Redaccion) => !(r.deletedAt && !isDirty(r));

/** La base devuelve "2026-10-07T17:52:00.123+00:00"; el navegador guarda "…00.123Z". Se comparan en el mismo formato. */
const iso = (value: string) => new Date(value).toISOString();

/** La hora del cambio, siempre posterior a la anterior (dos cambios en el mismo milisegundo no empatan). */
export function stamp(previous?: string) {
  const last = previous ? Date.parse(previous) : 0;
  return new Date(Math.max(Date.now(), last + 1)).toISOString();
}

/** randomUUID solo existe en https o localhost; abriendo la app por IP desde el celular, no. */
export function newId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function fromRow(row: Row): Redaccion {
  const updatedAt = iso(row.updated_at);
  return {
    id: row.id,
    title: row.title,
    titleEdited: row.title_edited,
    body: row.body,
    html: row.html || textToHtml(row.body),
    brandId: row.brand_id,
    createdAt: iso(row.created_at),
    updatedAt,
    deletedAt: row.deleted_at ? iso(row.deleted_at) : null,
    syncedAt: updatedAt,
  };
}

export function toRow(r: Redaccion, userId: string): Row & { user_id: string } {
  return {
    id: r.id,
    user_id: userId,
    title: r.title,
    title_edited: r.titleEdited,
    body: r.body,
    html: r.html,
    brand_id: r.brandId,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
    deleted_at: r.deletedAt,
  };
}

/** Gana la versión editada más tarde; lo del navegador que es más nuevo queda para subir. */
export function mergeRemote(local: Redaccion[], rows: Row[]) {
  const byId = new Map(local.map((r) => [r.id, r]));
  const remoteIds = new Set<string>();
  for (const row of rows) {
    const remote = fromRow(row);
    remoteIds.add(remote.id);
    const mine = byId.get(remote.id);
    if (!mine || remote.updatedAt > mine.updatedAt) byId.set(remote.id, remote);
    else if (remote.updatedAt === mine.updatedAt) byId.set(remote.id, { ...mine, syncedAt: mine.updatedAt });
  }
  // Algo que figuraba como guardado y la cuenta no tiene (la borraron a mano en la base): se vuelve a subir.
  for (const [id, r] of byId) if (!remoteIds.has(id) && r.syncedAt) byId.set(id, { ...r, syncedAt: null });
  return [...byId.values()].filter(keep);
}
