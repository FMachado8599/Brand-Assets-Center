"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAccount } from "@/components/shell/AccountProvider";
import { toast } from "@/components/ui/toaster";
import { textToHtml } from "@/lib/redaccion/export";
import { COLUMNS, isDirty, keep, mergeRemote, newId, stamp, toRow, type Row } from "@/lib/redaccion/sync";
import { autoTitle } from "@/lib/redaccion/text";
import type { Redaccion, SyncState } from "@/lib/redaccion/types";

/** El cliente de Supabase se carga recién cuando hace falta (como en AccountProvider). */
const loadClient = () => import("@/lib/supabase").then((m) => m.supabase);

/**
 * Cada cuenta tiene su propia copia en el navegador; sin sesión se usa la
 * anónima. Así, al cerrar sesión no queda a la vista lo de la cuenta, y al
 * entrar con otra no se mezclan.
 */
const ANON_KEY = "redaccion:textos";
const storeKey = (owner: string | null) => (owner ? `${ANON_KEY}:${owner}` : ANON_KEY);
/** Última cuenta que usó este navegador: se abre su copia sin esperar a que Supabase confirme la sesión. */
const HINT_KEY = "redaccion:cuenta";

const PUSH_DELAY = 1200;
const PULL_EVERY = 60_000;
const RETRY_DELAYS = [5_000, 15_000, 60_000];

export type RedaccionPatch = Partial<Pick<Redaccion, "title" | "body" | "html" | "brandId">>;

function isRedaccion(value: unknown): value is Redaccion {
  const r = value as Redaccion | null;
  return !!r && typeof r.id === "string" && typeof r.body === "string" && typeof r.updatedAt === "string";
}

function readStore(key: string): Redaccion[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "[]");
    // Las guardadas antes de que el editor tuviera formato no tienen html: se arma desde el texto.
    return Array.isArray(parsed)
      ? parsed.filter(isRedaccion).map((r) => (typeof r.html === "string" ? r : { ...r, html: textToHtml(r.body) }))
      : [];
  } catch {
    return [];
  }
}

let warnedQuota = false;
function writeStore(key: string, items: Redaccion[]) {
  try {
    if (items.length) localStorage.setItem(key, JSON.stringify(items));
    else localStorage.removeItem(key);
  } catch {
    if (!warnedQuota) {
      warnedQuota = true;
      toast("Este navegador no tiene más lugar: lo último que escribiste puede no quedar guardado", "error");
    }
  }
}

function readHint(): string | null {
  try {
    return localStorage.getItem(HINT_KEY);
  } catch {
    return null;
  }
}

function writeHint(owner: string | null) {
  try {
    if (owner) localStorage.setItem(HINT_KEY, owner);
    else localStorage.removeItem(HINT_KEY);
  } catch {
    /* sin almacenamiento */
  }
}

function explain(error: { message?: string; code?: string }) {
  const missing = error.code === "PGRST205" || error.code === "42P01" || /redacciones/.test(error.message ?? "");
  return missing ? "falta correr supabase/migracion-redaccion.sql" : error.message ?? "error desconocido";
}

/**
 * Las redacciones: siempre en este navegador y, con sesión iniciada, también
 * en la cuenta (tabla `redacciones`), así aparecen en cualquier computadora.
 *
 *  - Al entrar se lee la cuenta y se mezcla con lo del navegador: por cada
 *    redacción gana la editada más tarde. Lo escrito sin sesión se sube a la
 *    cuenta con la que entrás.
 *  - Cada cambio se sube al toque (agrupando lo que escribís seguido).
 *    Mientras no se lea la cuenta no se sube nada, para no pisar algo más
 *    nuevo guardado desde otra computadora.
 *  - Al cerrar sesión se borra la copia del navegador si ya estaba toda en la
 *    cuenta. Si quedó algo sin subir, se guarda (sin mostrarse) hasta que
 *    vuelvas a entrar.
 */
export function useRedacciones() {
  const account = useAccount();
  const available = account?.available ?? false;
  const ready = account?.ready ?? true;
  const userId = account?.user?.id ?? null;

  const [items, setItems] = useState<Redaccion[]>([]);
  /** De quién es la copia cargada. undefined: todavía no se leyó el navegador. */
  const [owner, setOwner] = useState<string | null | undefined>(undefined);
  const [pulled, setPulled] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pushing, setPushing] = useState(false);

  const itemsRef = useRef(items);
  const ownerRef = useRef(owner);
  const pulledRef = useRef(false);
  const busy = useRef({ pull: false, push: false });
  const lastPull = useRef(0);
  const attempt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const warned = useRef(false);

  const apply = useCallback((next: Redaccion[]) => {
    itemsRef.current = next;
    setItems(next);
    if (ownerRef.current !== undefined) writeStore(storeKey(ownerRef.current), next);
  }, []);

  const fail = useCallback((error: { message?: string; code?: string }) => {
    console.warn("[redacción] no se pudo sincronizar con la cuenta:", explain(error));
    setFailed(true);
    if (!warned.current) {
      warned.current = true;
      toast("No se pudo guardar en tu cuenta: tus textos quedan en este navegador", "error");
    }
  }, []);

  // Las funciones de sincronización se llaman entre sí: viven en refs para no depender del render.
  const push = useRef<() => Promise<void>>(async () => {});
  const pull = useRef<(uid: string) => Promise<void>>(async () => {});

  /** Próxima sincronización. Después de un error se espera cada vez más, aunque sigas escribiendo. */
  const schedule = useCallback((delay = PUSH_DELAY) => {
    const uid = ownerRef.current;
    clearTimeout(timer.current);
    if (!uid) return;
    const backoff = attempt.current ? RETRY_DELAYS[Math.min(attempt.current - 1, RETRY_DELAYS.length - 1)] : 0;
    timer.current = setTimeout(() => {
      if (ownerRef.current !== uid) return;
      if (pulledRef.current) push.current();
      else pull.current(uid);
    }, Math.max(delay, backoff));
  }, []);

  const retryLater = useCallback(() => {
    attempt.current++;
    schedule(0);
  }, [schedule]);

  push.current = async () => {
    const uid = ownerRef.current;
    if (!uid || !pulledRef.current || busy.current.push) return;
    const dirty = itemsRef.current.filter(isDirty);
    if (!dirty.length) return;
    busy.current.push = true;
    setPushing(true);
    try {
      const supabase = await loadClient();
      const { error } = await supabase.from("redacciones").upsert(dirty.map((r) => toRow(r, uid)));
      if (ownerRef.current !== uid) return;
      if (error) {
        fail(error);
        retryLater();
        return;
      }
      const sent = new Map(dirty.map((r) => [r.id, r.updatedAt]));
      apply(itemsRef.current.map((r) => (sent.get(r.id) === r.updatedAt ? { ...r, syncedAt: r.updatedAt } : r)).filter(keep));
      attempt.current = 0;
      warned.current = false;
      setFailed(false);
      // Lo que se escribió mientras subía, en la próxima tanda.
      if (itemsRef.current.some(isDirty)) schedule();
    } catch (e) {
      fail({ message: e instanceof Error ? e.message : String(e) });
      retryLater();
    } finally {
      busy.current.push = false;
      setPushing(false);
    }
  };

  pull.current = async (uid: string) => {
    if (busy.current.pull) return;
    busy.current.pull = true;
    lastPull.current = Date.now();
    try {
      const supabase = await loadClient();
      const { data, error } = await supabase.from("redacciones").select(COLUMNS).eq("user_id", uid);
      if (ownerRef.current !== uid) return;
      if (error) {
        fail(error);
        retryLater();
        return;
      }
      apply(mergeRemote(itemsRef.current, (data ?? []) as Row[]));
      pulledRef.current = true;
      setPulled(true);
      setFailed(false);
      attempt.current = 0;
      push.current();
    } catch (e) {
      fail({ message: e instanceof Error ? e.message : String(e) });
      retryLater();
    } finally {
      busy.current.pull = false;
    }
  };

  const switchTo = useCallback((next: string | null) => {
    clearTimeout(timer.current);
    ownerRef.current = next;
    pulledRef.current = false;
    attempt.current = 0;
    warned.current = false;
    const list = readStore(storeKey(next));
    itemsRef.current = list;
    setItems(list);
    setOwner(next);
    setPulled(false);
    setFailed(false);
  }, []);

  // 1. Al montar: la copia de la última cuenta que usó este navegador (o la anónima), sin esperar a Supabase.
  useEffect(() => {
    switchTo(available ? readHint() : null);
  }, [available, switchTo]);

  // 2. Cuando se sabe si hay sesión: se acomoda a la cuenta real y se sincroniza.
  useEffect(() => {
    if (!ready || ownerRef.current === undefined) return;
    const previous = ownerRef.current;
    if (previous !== userId) {
      // Cerró sesión (o entró otra cuenta): si todo estaba en la cuenta, no queda copia en el navegador.
      if (previous && !itemsRef.current.some(isDirty)) writeStore(storeKey(previous), []);
      switchTo(userId);
      writeHint(userId);
    }
    if (!userId) return;

    // Lo escrito sin sesión pasa a la cuenta.
    const anon = readStore(ANON_KEY).filter((r) => !r.deletedAt);
    if (anon.length) {
      const known = new Set(itemsRef.current.map((r) => r.id));
      apply([...anon.filter((r) => !known.has(r.id)).map((r) => ({ ...r, syncedAt: null })), ...itemsRef.current]);
      writeStore(ANON_KEY, []);
    }
    pull.current(userId);
  }, [ready, userId, switchTo, apply]);

  // 3. Otra pestaña cambió la misma copia: se toma la suya.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (ownerRef.current === undefined || e.key !== storeKey(ownerRef.current)) return;
      const list = readStore(e.key);
      itemsRef.current = list;
      setItems(list);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // 4. Al volver a la pestaña se trae lo de otras computadoras; al irse, se sube lo pendiente ya.
  useEffect(() => {
    const refresh = () => {
      const uid = ownerRef.current;
      if (!uid) return;
      if (!pulledRef.current || Date.now() - lastPull.current > PULL_EVERY) pull.current(uid);
      else push.current();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
      else push.current();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", refresh);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", refresh);
      clearTimeout(timer.current);
    };
  }, []);

  const commit = useCallback(
    (fn: (list: Redaccion[]) => Redaccion[]) => {
      apply(fn(itemsRef.current));
      schedule();
    },
    [apply, schedule]
  );

  const create = useCallback(
    (init: RedaccionPatch = {}) => {
      const now = stamp();
      const title = init.title?.trim() ?? "";
      const body = init.body ?? "";
      const item: Redaccion = {
        id: newId(),
        title: title || autoTitle(body),
        titleEdited: !!title,
        body,
        html: init.html ?? textToHtml(body),
        brandId: init.brandId ?? null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        syncedAt: null,
      };
      commit((list) => [item, ...list]);
      return item;
    },
    [commit]
  );

  const update = useCallback(
    (id: string, patch: RedaccionPatch) =>
      commit((list) =>
        list.map((r) => {
          if (r.id !== id) return r;
          const next = { ...r, ...patch };
          if (patch.title !== undefined) {
            // Borrar el nombre vuelve al automático.
            next.title = patch.title.trim() ? patch.title : autoTitle(next.body);
            next.titleEdited = !!patch.title.trim();
          } else if (!next.titleEdited && patch.body !== undefined) {
            next.title = autoTitle(next.body);
          }
          const changed =
            next.title !== r.title ||
            next.titleEdited !== r.titleEdited ||
            next.body !== r.body ||
            next.html !== r.html ||
            next.brandId !== r.brandId;
          return changed ? { ...next, updatedAt: stamp(r.updatedAt) } : r;
        })
      ),
    [commit]
  );

  const remove = useCallback(
    (id: string) =>
      commit((list) =>
        list.flatMap((r) => {
          if (r.id !== id) return [r];
          // Si nunca llegó a la cuenta, alcanza con olvidarla; si llegó, queda la marca para borrarla allá.
          if (!r.syncedAt) return [];
          return [{ ...r, title: "", body: "", html: "", deletedAt: new Date().toISOString(), updatedAt: stamp(r.updatedAt) }];
        })
      ),
    [commit]
  );

  const visible = useMemo(
    () => items.filter((r) => !r.deletedAt).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)),
    [items]
  );

  const dirty = items.some(isDirty);
  const sync: SyncState = !owner ? "local" : failed ? "error" : !pulled || dirty || pushing ? "saving" : "synced";

  return {
    /** Sin las borradas, de la editada más recientemente a la más vieja. */
    items: visible,
    loaded: owner !== undefined,
    sync,
    create,
    update,
    remove,
  };
}
