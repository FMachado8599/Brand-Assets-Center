import { supabase } from "@/lib/supabase";

/** Una tarea de Basecamp con su columna, su tablero y su marca (vista board_tareas). */
export type TareaBoard = {
  id: number;
  titulo: string;
  app_url: string | null;
  vence: string | null;
  completada: boolean;
  asignados: number[];
  comentarios: number;
  creada: string | null;
  actualizada: string | null;
  proyecto_id: number;
  proyecto: string;
  brand_id: string | null;
  columna_id: number | null;
  columna: string | null;
  /** La etapa normalizada de la columna; null si la columna es propia de ese proyecto. */
  estado: string | null;
  tablero_id: number | null;
  tablero: string | null;
};

/** La gente de Basecamp (incluye a la que no es del estudio: clientes, OMD…), para las fotos. */
export type PersonaBc = { id: number; nombre: string; avatar_url: string | null };

export const tareasRepo = {
  async personas() {
    const { data, error } = await supabase.from("bc_personas").select("id, nombre, avatar_url");
    if (error) throw new Error(error.message);
    return ((data ?? []) as PersonaBc[]).map((p) => ({ ...p, id: Number(p.id) }));
  },

  async ultimaSync() {
    const { data } = await supabase.from("bc_sync").select("ultimo").eq("id", "basecamp").maybeSingle();
    return (data?.ultimo as string | null) ?? null;
  },
};
