import { supabase } from "@/lib/supabase";
import { mimeOf, safeFileName } from "@/lib/clients/material";
import type { BrandMaterial, MaterialKind } from "@/lib/types";

const BUCKET = "material";
/** La lista no trae el texto de los documentos (pesa): se pide aparte cuando hace falta. */
const COLUMNS = "id,brand_id,kind,name,file_name,file_path,mime,size_bytes,note,use_ai,text_chars,created_at";
/** Los links firmados duran una hora: alcanza para mirar la ficha sin que se venzan a mitad. */
const SIGNED_SECONDS = 3600;

/** Lo que se puede cambiar de un archivo ya subido. */
export type MaterialPatch = Partial<Pick<BrandMaterial, "name" | "kind" | "note" | "use_ai">>;

export type MaterialText = Pick<BrandMaterial, "id" | "name" | "kind" | "note"> & { text_content: string };

export const materialsRepo = {
  list: (brandId: string) =>
    supabase
      .from("brand_materials")
      .select(COLUMNS)
      .eq("brand_id", brandId)
      .order("created_at", { ascending: false })
      .returns<BrandMaterial[]>(),

  /** Sube el archivo y lo anota en la lista. Si lo segundo falla, el archivo no queda huérfano. */
  async add(brandId: string, file: File, meta: { kind: MaterialKind; name: string; text: string }) {
    const path = `${brandId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeFileName(file.name)}`;
    const mime = mimeOf(file);
    const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: mime });
    if (up.error) return { data: null, error: up.error };
    const { data, error } = await supabase
      .from("brand_materials")
      .insert({
        brand_id: brandId,
        kind: meta.kind,
        name: meta.name,
        file_name: file.name.slice(0, 300),
        file_path: path,
        mime,
        size_bytes: file.size,
        text_content: meta.text,
      })
      .select(COLUMNS)
      .single<BrandMaterial>();
    if (error) await supabase.storage.from(BUCKET).remove([path]);
    return { data, error };
  },

  update: (id: string, patch: MaterialPatch) =>
    supabase.from("brand_materials").update(patch).eq("id", id).select(COLUMNS).single<BrandMaterial>(),

  /** Borra la fila y después el archivo (si falla lo segundo, queda un archivo sin dueño, no una fila rota). */
  async remove(item: Pick<BrandMaterial, "id" | "file_path">) {
    const { error } = await supabase.from("brand_materials").delete().eq("id", item.id);
    if (error) return { error };
    await supabase.storage.from(BUCKET).remove([item.file_path]);
    return { error: null };
  },

  /** Los archivos de un cliente, para borrarlos del bucket cuando se elimina (las filas se van solas). */
  async filePaths(brandId: string) {
    const { data } = await supabase.from("brand_materials").select("file_path").eq("brand_id", brandId);
    return ((data ?? []) as { file_path: string }[]).map((r) => r.file_path);
  },
  removeFiles: (paths: string[]) => (paths.length ? supabase.storage.from(BUCKET).remove(paths) : Promise.resolve(null)),

  /** Un link para abrir (o bajar, con `download` = el nombre) un archivo. */
  async signedUrl(path: string, download?: string) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, SIGNED_SECONDS, download ? { download } : undefined);
    return error ? null : data.signedUrl;
  },

  /** Links de varios archivos juntos (las miniaturas de la lista). */
  async signedUrls(paths: string[]) {
    const out = new Map<string, string>();
    if (!paths.length) return out;
    const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, SIGNED_SECONDS);
    for (const row of data ?? []) if (row.path && row.signedUrl) out.set(row.path, row.signedUrl);
    return out;
  },

  /** El texto leído de un archivo, para mostrarlo tal cual lo ve la IA. */
  async text(id: string) {
    const { data } = await supabase.from("brand_materials").select("text_content").eq("id", id).maybeSingle();
    return (data as { text_content: string } | null)?.text_content ?? "";
  },

  /** Lo que la IA puede leer del cliente: documentos con texto o con nota, y los que se dejaron prendidos. */
  textsForAI: (brandId: string) =>
    supabase
      .from("brand_materials")
      .select("id,name,kind,note,text_content")
      .eq("brand_id", brandId)
      .eq("use_ai", true)
      .returns<MaterialText[]>(),
};

/** Falta correr supabase/migracion-material.sql: la tabla o el bucket no existen. */
export const isMissingMaterialMigration = (message: string) =>
  /brand_materials|bucket not found|schema cache|does not exist/i.test(message);

/** El error de guardar algo del material, en palabras de la app. */
export function materialErrorMessage(error: { message: string }) {
  if (isMissingMaterialMigration(error.message)) return "Falta correr supabase/migracion-material.sql en Supabase";
  if (/exceeded the maximum allowed size|payload too large|too large/i.test(error.message)) return "El archivo es demasiado grande";
  return error.message;
}
