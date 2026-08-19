import { supabase } from "@/lib/supabase";

export const categoriesRepo = {
  list: () => supabase.from("categories").select("*").order("name"),
  create: (name: string) => supabase.from("categories").insert({ name: name.trim() }),
  remove: (id: string) => supabase.from("categories").delete().eq("id", id),
};
