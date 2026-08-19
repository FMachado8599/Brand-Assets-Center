import { supabase } from "@/lib/supabase";

export type CardPayload = {
  title: string;
  content_html: string;
  content_text: string;
  brand_id: string | null;
  product_id: string | null;
  category_id: string | null;
};

export type CardDraft = CardPayload & { id?: string };

export const cardsRepo = {
  list: () => supabase.from("cards").select("*").order("updated_at", { ascending: false }),
  remove: (id: string) => supabase.from("cards").delete().eq("id", id),

  /** Crea o actualiza según si el draft trae id. */
  async save(draft: CardDraft) {
    const { id, ...payload } = draft;
    const { error } = id
      ? await supabase.from("cards").update(payload).eq("id", id)
      : await supabase.from("cards").insert(payload);
    if (error) throw error;
  },
};
