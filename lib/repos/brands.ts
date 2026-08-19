import { supabase } from "@/lib/supabase";
import type { Brand } from "@/lib/types";

export const brandsRepo = {
  list: () => supabase.from("brands").select("*").order("name"),
  create: (name: string, color: string) => supabase.from("brands").insert({ name: name.trim(), color }),
  remove: (id: string) => supabase.from("brands").delete().eq("id", id),
};

export type { Brand };
