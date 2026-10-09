"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { toast } from "@/components/ui/toaster";
import { STUDIO_DOMAIN } from "@/lib/site";

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
  /** Ya se leyeron las preferencias de la cuenta. false sin sesión, mientras cargan o si no se pudieron leer. */
  prefsReady: boolean;
  /** Lo último guardado en la cuenta para esa clave (incluye lo cambiado en esta sesión); undefined si no tiene. */
  getPref: (key: string) => unknown;
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
const RETRY_DELAYS = [2000, 5000, 15000];

export function AccountProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(!hasSupabase);
  const [prefsReady, setPrefsReady] = useState(false);
  const userRef = useRef<User | null>(null);
  userRef.current = user;
  /** Lo de la cuenta, al día con lo que se guarda en esta sesión. null hasta que se lee. */
  const prefs = useRef<Record<string, unknown> | null>(null);
  const pending = useRef(new Map<string, unknown>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  /** Claves de la cuenta que pasaron por este navegador: al cerrar sesión se borran todas, no solo las del módulo abierto. */
  const synced = useRef(new Set<string>());
  const warnedWrite = useRef(false);

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

    // /auth/callback vuelve con ?login=error si Google o Supabase rechazaron el ingreso,
    // o con ?login=sin-acceso si el mail no es del estudio (ver supabase/migracion-acceso.sql).
    // Por las dudas también se mira el #error_description, por si Supabase manda el error en el fragmento.
    const params = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const login = params.get("login");
    const denied = login === "sin-acceso" || /saving new user/i.test(hash.get("error_description") ?? "");
    if (denied || login === "error" || hash.has("error")) {
      toast(
        denied ? `Esa cuenta no tiene acceso: entrá con tu mail @${STUDIO_DOMAIN}` : "No se pudo iniciar sesión con Google",
        "error"
      );
      params.delete("login");
      const rest = params.toString();
      window.history.replaceState(null, "", window.location.pathname + (rest ? `?${rest}` : ""));
    }

    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  const write = useCallback(async (key: string, value: unknown) => {
    const current = userRef.current;
    if (!current) return;
    const supabase = await loadClient();
    const { error } = await supabase
      .from("user_prefs")
      .upsert({ user_id: current.id, key, value, updated_at: new Date().toISOString() });
    if (!error) return;
    console.warn(`[cuenta] no se pudo guardar "${key}":`, error.message);
    if (!warnedWrite.current) {
      warnedWrite.current = true;
      toast("No se pudo guardar en tu cuenta: el cambio quedó solo en este navegador", "error");
    }
  }, []);

  /** Con una pequeña demora: varios cambios seguidos (ej: marcar favoritos) son un solo pedido. */
  const schedule = useCallback(
    (key: string) => {
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

  const savePref = useCallback(
    (key: string, value: unknown) => {
      if (!userRef.current) return;
      synced.current.add(key);
      pending.current.set(key, value);
      // Hasta leer la cuenta no se escribe en ella: se pisaría lo guardado desde otra computadora.
      if (!prefs.current) return;
      prefs.current[key] = value;
      schedule(key);
    },
    [schedule]
  );

  const getPref = useCallback((key: string) => prefs.current?.[key], []);

  const forgetAccount = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current.clear();
    pending.current.clear();
    synced.current.forEach((key) => {
      try {
        localStorage.removeItem(key);
      } catch {
        /* sin almacenamiento */
      }
    });
    synced.current.clear();
    warnedWrite.current = false;
  }, []);

  // Al cambiar de usuario se traen sus preferencias, todas en un solo pedido.
  const userId = user?.id ?? null;
  const lastUserId = useRef<string | null>(null);
  useEffect(() => {
    // Cerró sesión (o entró otra cuenta): lo de la anterior no queda en este navegador.
    if (lastUserId.current && lastUserId.current !== userId) forgetAccount();
    lastUserId.current = userId;
    prefs.current = null;
    setPrefsReady(false);
    if (!userId) return;

    let alive = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const load = async (attempt: number) => {
      const supabase = await loadClient();
      const { data, error } = await supabase.from("user_prefs").select("key, value").eq("user_id", userId);
      if (!alive) return;
      if (error) {
        // Sin leer la cuenta no se sincroniza nada (ni se sube lo de este navegador): se reintenta.
        console.warn("[cuenta] no se pudieron leer las preferencias:", error.message);
        if (attempt < RETRY_DELAYS.length) retry = setTimeout(() => load(attempt + 1), RETRY_DELAYS[attempt]);
        else toast("No se pudo sincronizar con tu cuenta: lo que cambies queda solo en este navegador", "error");
        return;
      }
      const loaded: Record<string, unknown> = Object.fromEntries((data ?? []).map((row) => [row.key as string, row.value]));
      // Lo que se cambió mientras cargaba es lo último que hizo la persona: gana sobre lo de la cuenta.
      pending.current.forEach((value, key) => {
        loaded[key] = value;
      });
      Object.keys(loaded).forEach((key) => synced.current.add(key));
      prefs.current = loaded;
      setPrefsReady(true);
      pending.current.forEach((_, key) => schedule(key));
    };
    load(0);
    return () => {
      alive = false;
      clearTimeout(retry);
    };
  }, [userId, schedule, forgetAccount]);

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
    // Lo que quedó esperando se guarda antes de cerrar la sesión (solo si la cuenta llegó a leerse).
    timers.current.forEach(clearTimeout);
    timers.current.clear();
    const queued = prefs.current ? [...pending.current.entries()] : [];
    pending.current.clear();
    await Promise.all(queued.map(([key, value]) => write(key, value)));
    const supabase = await loadClient();
    await supabase.auth.signOut();
    toast("Sesión cerrada");
  }, [write]);

  const value = useMemo<Account>(
    () => ({ available: hasSupabase, ready, user, prefsReady, getPref, savePref, signIn, signOut }),
    [ready, user, prefsReady, getPref, savePref, signIn, signOut]
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}
