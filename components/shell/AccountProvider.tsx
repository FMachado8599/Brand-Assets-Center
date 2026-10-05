"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { toast } from "@/components/ui/toaster";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const hasSupabase = Boolean(supabaseUrl && supabaseAnonKey);

/**
 * El cliente de Supabase se carga recién después de pintar la página: así
 * Emojis, GIF y Conversor no pagan su peso en la primera carga.
 */
const loadClient = () => import("@/lib/supabase").then((m) => m.supabase);

/**
 * Sesión del usuario (login con Google vía Supabase) y sus preferencias.
 *
 * Las preferencias son las mismas claves que cada módulo guarda en este
 * navegador (favoritos de emojis, ajustes del GIF…): con sesión iniciada
 * también se guardan en la tabla user_prefs, y al entrar desde otra
 * computadora se recuperan. Ver useStoredState.
 */
export type Account = {
  /** Supabase configurado: se puede iniciar sesión. */
  available: boolean;
  /** Ya se sabe si hay sesión o no (antes de eso no conviene mostrar "Ingresar"). */
  ready: boolean;
  user: User | null;
  /** Preferencias de la cuenta, cargadas al iniciar sesión. null mientras no hay sesión o están cargando. */
  prefs: Record<string, unknown> | null;
  savePref: (key: string, value: unknown) => void;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AccountContext = createContext<Account | null>(null);

/** null fuera del provider: los hooks que la usan siguen andando, solo en este navegador. */
export function useAccount() {
  return useContext(AccountContext);
}

const SAVE_DELAY = 600;

export function AccountProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(!hasSupabase);
  const [prefs, setPrefs] = useState<Record<string, unknown> | null>(null);
  const userRef = useRef<User | null>(null);
  userRef.current = user;
  const pending = useRef(new Map<string, unknown>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    if (!hasSupabase) return;
    let alive = true;
    let unsubscribe = () => {};
    loadClient().then((supabase) => {
      if (!alive) return;
      supabase.auth.getSession().then(({ data }) => {
        if (!alive) return;
        setUser(data.session?.user ?? null);
        setReady(true);
      });
      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user ?? null);
        setReady(true);
      });
      unsubscribe = () => data.subscription.unsubscribe();
    });

    // /auth/callback vuelve con ?login=error si Google o Supabase rechazaron el ingreso.
    const params = new URLSearchParams(window.location.search);
    if (params.get("login") === "error") {
      toast("No se pudo iniciar sesión con Google", "error");
      params.delete("login");
      const rest = params.toString();
      window.history.replaceState(null, "", window.location.pathname + (rest ? `?${rest}` : ""));
    }

    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  // Al cambiar de usuario se traen sus preferencias, todas en un solo pedido.
  const userId = user?.id ?? null;
  useEffect(() => {
    setPrefs(null);
    if (!userId) return;
    let alive = true;
    loadClient().then(async (supabase) => {
      const { data, error } = await supabase.from("user_prefs").select("key, value").eq("user_id", userId);
      if (!alive) return;
      if (error) console.warn("[cuenta] no se pudieron leer las preferencias:", error.message);
      setPrefs(Object.fromEntries((data ?? []).map((row) => [row.key as string, row.value])));
    });
    return () => {
      alive = false;
    };
  }, [userId]);

  const write = useCallback(async (key: string, value: unknown) => {
    const current = userRef.current;
    if (!current) return;
    const supabase = await loadClient();
    const { error } = await supabase
      .from("user_prefs")
      .upsert({ user_id: current.id, key, value, updated_at: new Date().toISOString() });
    if (error) console.warn(`[cuenta] no se pudo guardar "${key}":`, error.message);
  }, []);

  /** Guarda con una pequeña demora: varios cambios seguidos (ej: marcar favoritos) son un solo pedido. */
  const savePref = useCallback(
    (key: string, value: unknown) => {
      if (!userRef.current) return;
      pending.current.set(key, value);
      clearTimeout(timers.current.get(key));
      timers.current.set(
        key,
        setTimeout(() => {
          timers.current.delete(key);
          if (!pending.current.has(key)) return;
          const latest = pending.current.get(key);
          pending.current.delete(key);
          write(key, latest);
        }, SAVE_DELAY)
      );
    },
    [write]
  );

  const signIn = useCallback(async () => {
    // Antes de mandar a Google se confirma que Supabase responde y que tiene Google activado:
    // si no, la persona terminaría en una página de error en crudo.
    try {
      const res = await fetch(`${supabaseUrl}/auth/v1/settings`, {
        headers: { apikey: supabaseAnonKey },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) throw new Error(String(res.status));
      const settings = (await res.json()) as { external?: Record<string, boolean> };
      if (!settings.external?.google) {
        toast("El ingreso con Google no está activado en Supabase (Authentication → Providers → Google)", "error");
        return;
      }
    } catch {
      toast("No se pudo conectar con Supabase: revisá la configuración del proyecto", "error");
      return;
    }
    const next = window.location.pathname + window.location.search;
    const supabase = await loadClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) toast(error.message, "error");
  }, []);

  const signOut = useCallback(async () => {
    // Lo que quedó esperando se guarda antes de cerrar la sesión.
    timers.current.forEach(clearTimeout);
    timers.current.clear();
    const queued = [...pending.current.entries()];
    pending.current.clear();
    await Promise.all(queued.map(([key, value]) => write(key, value)));
    const supabase = await loadClient();
    await supabase.auth.signOut();
    toast("Sesión cerrada");
  }, [write]);

  const value = useMemo<Account>(
    () => ({ available: hasSupabase, ready, user, prefs, savePref, signIn, signOut }),
    [ready, user, prefs, savePref, signIn, signOut]
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}
