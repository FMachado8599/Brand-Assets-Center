import { supabase } from "@/lib/supabase";
import type { Brand } from "@/lib/types";

const LOGOS = "logos";

/** Lo que se puede cambiar de un cliente desde su ficha. */
export type BrandPatch = Partial<Pick<Brand, "name" | "color" | "logo_url" | "logo_path" | "logo_bg" | "palette" | "font_families" | "notes">>;

export const brandsRepo = {
  list: () => supabase.from("brands").select("*").order("name"),
  /** Devuelve el cliente creado: quien lo pidió (ej: un selector) lo deja elegido al toque. */
  create: (name: string, color: string) =>
    supabase.from("brands").insert({ name: name.trim(), color }).select().single(),
  update: (id: string, patch: BrandPatch) => supabase.from("brands").update(patch).eq("id", id).select().single(),
  remove: (id: string) => supabase.from("brands").delete().eq("id", id),

  /** Sube un logo y devuelve su ruta y su URL pública. */
  async uploadLogo(file: File) {
    const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from(LOGOS).upload(path, file, { contentType: file.type || undefined });
    if (error) return { error, path: "", url: "" };
    const { data } = supabase.storage.from(LOGOS).getPublicUrl(path);
    return { error: null, path, url: data.publicUrl };
  },

  /** Borra el archivo de un logo que ya no se usa. Si falla no pasa nada: queda un archivo huérfano. */
  removeLogoFile: (path: string | null | undefined) =>
    path ? supabase.storage.from(LOGOS).remove([path]) : Promise.resolve(null),
};

/** En la base el nombre del cliente es único. */
export const isDuplicateName = (message: string) => /duplicate|unique/i.test(message);

/** Falta correr supabase/migracion-clientes.sql: las columnas de la ficha o el bucket de logos no existen. */
export const isMissingClientsMigration = (message: string) =>
  /logo_url|logo_path|logo_bg|palette|font_families|notes|bucket not found|schema cache/i.test(message);

/** El error de guardar algo de un cliente, en palabras de la app. */
export function clientErrorMessage(error: { message: string }) {
  if (isDuplicateName(error.message)) return "Ya hay un cliente con ese nombre";
  if (isMissingClientsMigration(error.message)) return "Falta correr supabase/migracion-clientes.sql en Supabase";
  return error.message;
}

export type { Brand };
