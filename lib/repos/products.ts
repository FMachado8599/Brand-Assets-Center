import { supabase } from "@/lib/supabase";

export const productsRepo = {
  list: () => supabase.from("products").select("*").order("name"),
  create: (name: string, brandId: string) =>
    supabase.from("products").insert({ name: name.trim(), brand_id: brandId }),
  remove: (id: string) => supabase.from("products").delete().eq("id", id),
};

/** El índice único es (marca, nombre): el mismo modelo en dos marcas sí se puede. */
export const isDuplicateError = (message: string) => /duplicate|unique/i.test(message);
