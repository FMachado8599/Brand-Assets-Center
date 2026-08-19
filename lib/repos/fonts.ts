import { supabase } from "@/lib/supabase";
import type { FontFace } from "@/lib/types";

export type FontRow = Omit<FontFace, "id" | "created_at">;

const BUCKET = "fonts";

export const fontsRepo = {
  list: () => supabase.from("fonts").select("*").order("family").order("weight"),

  /** Sube el archivo y devuelve su ruta y su URL pública. */
  async uploadFile(file: File) {
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${file.name.replace(/[^\w.\-]/g, "_")}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
    if (error) return { error, path: "", url: "" };
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return { error: null, path, url: data.publicUrl };
  },

  /**
   * upsert por `full_name`: si el nombre ya existía se reemplaza en vez de
   * fallar en silencio. Si todavía no corriste la migración, reintenta sin
   * la columna `is_variable`.
   */
  async saveMany(rows: FontRow[]) {
    let { error } = await supabase.from("fonts").upsert(rows, { onConflict: "full_name" });
    if (error && /is_variable/i.test(error.message)) {
      const stripped = rows.map(({ is_variable, ...rest }) => rest);
      ({ error } = await supabase.from("fonts").upsert(stripped, { onConflict: "full_name" }));
    }
    return error;
  },

  /** Borra el archivo del storage solo si ninguna otra face lo usa. */
  async removeFaces(faces: FontFace[], all: FontFace[]) {
    const ids = faces.map((f) => f.id);
    const { error } = await supabase.from("fonts").delete().in("id", ids);
    if (error) return error;

    const stillUsed = new Set(all.filter((f) => !ids.includes(f.id)).map((f) => f.file_path));
    const orphans = Array.from(new Set(faces.map((f) => f.file_path))).filter((p) => !stillUsed.has(p));
    if (orphans.length) await supabase.storage.from(BUCKET).remove(orphans);
    return null;
  },
};
