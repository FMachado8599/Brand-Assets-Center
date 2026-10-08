import type { EmojiEntry } from "@/lib/emojis/types";

/**
 * Una redacción. El texto se guarda dos veces: con formato (`html`, lo que
 * muestra el editor) y plano (`body`: para buscar, contar, sacar los hashtags
 * y pegar donde no hay formato, como Instagram).
 *
 * En Redacción, las marcas de Tarjetas se llaman clientes: es la misma tabla
 * (`brands`), por eso en el código siguen siendo `brand`.
 *
 * Se guarda en este navegador y, con sesión iniciada, en la tabla
 * `redacciones` de la cuenta (ver useRedacciones).
 */
export type Redaccion = {
  id: string;
  title: string;
  /** La persona le puso nombre: deja de seguir a la primera línea del texto. */
  titleEdited: boolean;
  /** Texto plano (las listas con "•" y "1."). */
  body: string;
  /** El mismo texto con formato: negrita, cursiva, subrayado, tachado y listas. */
  html: string;
  /** El cliente. */
  brandId: string | null;
  createdAt: string;
  updatedAt: string;
  /** Borrada. Queda como marca hasta que la cuenta se entera, así se borra también en las otras computadoras. */
  deletedAt: string | null;
  /** La versión (updatedAt) que ya está guardada en la cuenta. Si no coincide con updatedAt, falta subirla. */
  syncedAt: string | null;
};

/** Un emoji guardado a mano (cliente, recientes): con lo justo para mostrarlo sin pedir nada al servidor. */
export type SlimEmoji = Pick<EmojiEntry, "i" | "c" | "n" | "e" | "g" | "s" | "k">;

/** Los emojis y hashtags de siempre de un cliente, para no escribirlos de cero en cada texto. */
export type BrandKit = { emojis: SlimEmoji[]; hashtags: string[] };

/** Por id de cliente; los textos sin cliente usan GENERAL. */
export type BrandKits = Record<string, BrandKit>;

export const GENERAL = "general";

/** Un cliente (una fila de `brands`). */
export type BrandLite = { id: string; name: string; color: string };

export type SyncState =
  /** Sin sesión: todo queda en este navegador. */
  | "local"
  /** Hay cambios subiendo (o se está leyendo la cuenta). */
  | "saving"
  | "synced"
  /** No se pudo leer o guardar en la cuenta: lo último quedó en este navegador. */
  | "error";
