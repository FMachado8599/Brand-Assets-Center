"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount } from "@/components/shell/AccountProvider";

function readLocal(key: string): unknown | undefined {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* sin almacenamiento: queda en memoria */
  }
}

function removeLocal(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignorado */
  }
}

/** Los objetos se completan con los valores por defecto (por si después se agrega un ajuste nuevo). */
function withDefaults<T>(initial: T, stored: unknown): T {
  const isPlain = (v: unknown) => !!v && typeof v === "object" && !Array.isArray(v);
  return isPlain(initial) && isPlain(stored) ? ({ ...initial, ...(stored as object) } as T) : (stored as T);
}

/**
 * useState que se recuerda: preferencias personales (favoritos, tono de piel,
 * ajustes del GIF…). Siempre se guardan en este navegador; con sesión
 * iniciada también en la cuenta, así aparecen en cualquier computadora.
 *
 *  - Al iniciar sesión, lo de la cuenta manda. Si la cuenta todavía no tiene
 *    esa preferencia, se sube la del navegador (no se pierde lo que ya tenías).
 *  - Al cerrar sesión se borra la copia del navegador: el próximo que use la
 *    compu no ve tus cosas.
 *
 * El tercer valor indica si ya se leyó lo guardado (antes es el valor inicial).
 */
export function useStoredState<T>(key: string, initial: T) {
  const account = useAccount();
  const [value, setValue] = useState<T>(initial);
  const [loaded, setLoaded] = useState(false);
  const initialRef = useRef(initial);
  const valueRef = useRef(value);
  valueRef.current = value;
  const accountRef = useRef(account);
  accountRef.current = account;

  // Lo guardado en este navegador. Se lee después de montar para no romper la hidratación.
  useEffect(() => {
    const stored = readLocal(key);
    if (stored !== undefined) setValue(withDefaults(initialRef.current, stored));
    setLoaded(true);
  }, [key]);

  const userId = account?.user?.id ?? null;
  const prefsReady = account?.prefsReady ?? false;
  const previousUser = useRef<string | null>(null);

  useEffect(() => {
    if (!loaded) return;
    if (userId && prefsReady) {
      // Se lee al montar, no una foto del momento del login: al volver a un módulo se ve lo último que guardaste.
      const saved = accountRef.current?.getPref(key);
      if (saved !== undefined) {
        setValue(withDefaults(initialRef.current, saved));
        writeLocal(key, saved);
      } else {
        const local = readLocal(key);
        if (local !== undefined) accountRef.current?.savePref(key, local);
      }
    }
    if (!userId && previousUser.current) {
      setValue(initialRef.current);
      removeLocal(key);
    }
    previousUser.current = userId;
  }, [loaded, userId, prefsReady, key]);

  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      const resolved = typeof next === "function" ? (next as (p: T) => T)(valueRef.current) : next;
      valueRef.current = resolved;
      setValue(resolved);
      writeLocal(key, resolved);
      if (accountRef.current?.user) accountRef.current.savePref(key, resolved);
    },
    [key]
  );

  return [value, update, loaded] as const;
}
