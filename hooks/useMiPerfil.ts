"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useAccount } from "@/components/shell/AccountProvider";
import { toast } from "@/components/ui/toaster";
import { AVATARES, normalizarPerfil, perfilErrorMessage, tieneColumnasPerfil, type Perfil, type PerfilPatch } from "@/lib/perfil";

/**
 * El perfil de quien tiene la sesión, una sola lectura para toda la app (la píldora de la cuenta, /perfil).
 * El cliente de Supabase se carga recién cuando hace falta, como en AccountProvider: la píldora está en
 * todas las páginas y no tiene que sumarle peso a la primera carga.
 */
const loadClient = () => import("@/lib/supabase").then((m) => m.supabase);

type State = {
  userId: string | null;
  perfil: Perfil | null;
  loaded: boolean;
  /** Falta correr supabase/migracion-perfil.sql: se ve lo de Google, pero no se puede guardar nada nuevo. */
  sinMigracion: boolean;
  error: string | null;
};

const VACIO: State = { userId: null, perfil: null, loaded: false, sinMigracion: false, error: null };
let state: State = VACIO;
const listeners = new Set<() => void>();
/** Cuántos guardados se largaron: la respuesta de uno viejo no pisa lo que se cambió después. */
let guardados = 0;
/** La cuenta que se pidió leer (undefined: ninguna todavía): varias partes de la página piden una sola vez. */
let pedido: string | null | undefined;

function set(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

async function cargar(userId: string | null) {
  pedido = userId;
  set({ ...VACIO, userId, loaded: !userId });
  if (!userId) return;
  const supabase = await loadClient();
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (state.userId !== userId) return;
  if (error) {
    set({ loaded: true, error: error.message });
    return;
  }
  const row = (data ?? null) as Record<string, unknown> | null;
  set({ perfil: row ? normalizarPerfil(row) : null, loaded: true, sinMigracion: row ? !tieneColumnasPerfil(row) : false });
}

export const refrescarMiPerfil = () => cargar(state.userId);

/** El Board tiene su propia copia del equipo (con el perfil de cada uno): se le avisa, sin apuro. */
let avisoBoard: ReturnType<typeof setTimeout> | undefined;
function avisarAlBoard() {
  clearTimeout(avisoBoard);
  avisoBoard = setTimeout(() => {
    import("@/hooks/useEquipo").then((m) => m.refrescarEquipoSiSeUsa());
  }, 1200);
}

/**
 * Guarda un cambio del perfil propio. Se ve al instante; si la base dice que no, vuelve lo de antes
 * (solo en lo que se tocó) y avisa el motivo.
 */
export async function guardarMiPerfil(patch: PerfilPatch, ok?: string): Promise<boolean> {
  const { userId, perfil } = state;
  if (!userId || !perfil) return false;
  const mio = ++guardados;
  const antes = Object.fromEntries(Object.keys(patch).map((k) => [k, perfil[k as keyof Perfil]])) as PerfilPatch;
  set({ perfil: { ...perfil, ...patch } });
  const supabase = await loadClient();
  const { data, error } = await supabase.from("profiles").update(patch).eq("id", userId).select("*").maybeSingle();
  if (state.userId !== userId) return false;
  if (error || !data) {
    if (state.perfil) set({ perfil: { ...state.perfil, ...antes } });
    toast(perfilErrorMessage(error?.message ?? "No se pudo guardar tu perfil"), "error");
    return false;
  }
  if (mio === guardados) set({ perfil: normalizarPerfil(data as Record<string, unknown>), sinMigracion: false });
  avisarAlBoard();
  if (ok) toast(ok);
  return true;
}

/** Sube una foto (ya recortada) a la carpeta de la cuenta. Devuelve su ruta y su URL pública. */
export async function subirFoto(blob: Blob): Promise<{ path: string; url: string }> {
  const { userId } = state;
  if (!userId) throw new Error("Iniciá sesión para subir una foto");
  const supabase = await loadClient();
  const path = `${userId}/${Date.now()}.jpg`;
  const { error } = await supabase.storage.from(AVATARES).upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000" });
  if (error) throw new Error(perfilErrorMessage(error.message));
  const { data } = supabase.storage.from(AVATARES).getPublicUrl(path);
  return { path, url: data.publicUrl };
}

/** Borra una foto subida que ya no se usa. Si falla no pasa nada: queda un archivo huérfano. */
export async function borrarFoto(path: string | null | undefined) {
  if (!path) return;
  const supabase = await loadClient();
  await supabase.storage.from(AVATARES).remove([path]);
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useMiPerfil() {
  const account = useAccount();
  const userId = account?.ready ? (account.user?.id ?? null) : undefined;
  const snap = useSyncExternalStore(subscribe, () => state, () => VACIO);
  useEffect(() => {
    // undefined: todavía no se sabe si hay sesión.
    if (userId === undefined) return;
    if (userId !== pedido) cargar(userId);
  }, [userId]);
  const vigente = userId !== undefined && snap.userId === userId;
  return { ...(vigente ? snap : VACIO), guardar: guardarMiPerfil };
}
