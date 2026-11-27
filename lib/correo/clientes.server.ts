import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SearchObject } from "imapflow";
import { CorreoError } from "./imap.server";

/**
 * Los mails de un cliente: sus direcciones y dominios (cliente_correos, de la ficha) pasados a una
 * búsqueda del servidor de correo. Un mail busca esa persona en De, Para o CC; un dominio, a todos los
 * de "@dominio". La búsqueda corre en tu casilla: la app no guarda los mails.
 */

/** Más que esto no se manda en una búsqueda (cada dirección son tres condiciones). */
const MAX_VALORES = 25;

export async function busquedaDeCliente(db: SupabaseClient, brandId: string): Promise<SearchObject | null> {
  if (!/^[0-9a-f-]{36}$/i.test(brandId)) throw new CorreoError("Cliente inválido", "otro", 400);
  const { data, error } = await db.from("cliente_correos").select("valor").eq("brand_id", brandId).order("created_at").limit(MAX_VALORES);
  if (error) {
    if (/cliente_correos|schema cache|does not exist/i.test(error.message)) {
      throw new CorreoError("Falta correr supabase/migracion-correo-contactos.sql en Supabase", "sin_migracion", 503);
    }
    throw new CorreoError(error.message, "otro", 500);
  }
  const terminos = (data ?? []).flatMap(({ valor }: { valor: string }): SearchObject[] => {
    const v = valor.includes("@") ? valor : `@${valor}`;
    return [{ from: v }, { to: v }, { cc: v }];
  });
  if (!terminos.length) return null;
  return terminos.length === 1 ? terminos[0] : { or: terminos };
}
