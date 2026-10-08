"use client";

import { useCallback, useEffect, useState } from "react";
import { useStoredState } from "@/hooks/useStoredState";
import { uniqueTags } from "@/lib/redaccion/text";
import { GENERAL, type BrandKit, type BrandKits, type BrandLite, type SlimEmoji } from "@/lib/redaccion/types";

let brandCache: BrandLite[] | null = null;

/**
 * Los clientes de Redacción: son las marcas de Tarjetas (se crean en Tarjetas
 * → Ajustes). Solo lo que hace falta para elegir uno: nombre y color.
 */
export function useBrands() {
  const [brands, setBrands] = useState<BrandLite[]>(brandCache ?? []);
  const [loading, setLoading] = useState(brandCache === null);

  useEffect(() => {
    let alive = true;
    import("@/lib/supabase").then(async ({ supabase, hasSupabase }) => {
      if (!hasSupabase) {
        if (alive) setLoading(false);
        return;
      }
      const { data, error } = await supabase.from("brands").select("id, name, color").order("name");
      if (!alive) return;
      if (error) console.warn("[redacción] no se pudieron leer los clientes:", error.message);
      if (data) {
        brandCache = data as BrandLite[];
        setBrands(brandCache);
      }
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  return { brands, loading };
}

const EMPTY: BrandKit = { emojis: [], hashtags: [] };

function normalize(kit: Partial<BrandKit> | undefined): BrandKit {
  return {
    emojis: Array.isArray(kit?.emojis) ? kit.emojis.filter((e) => e && typeof e.i === "string") : [],
    hashtags: Array.isArray(kit?.hashtags) ? kit.hashtags.filter((t) => typeof t === "string") : [],
  };
}

/**
 * Los emojis y hashtags de siempre de cada cliente. Es una preferencia más:
 * queda en el navegador y, con sesión, en la cuenta (useStoredState).
 */
export function useBrandKits() {
  // La clave quedó de cuando se llamaban marcas: cambiarla perdería lo ya guardado.
  const [kits, setKits, loaded] = useStoredState<BrandKits>("redaccion:marcas", {});

  const kitOf = useCallback(
    (brandId: string | null): BrandKit => (kits[brandId ?? GENERAL] ? normalize(kits[brandId ?? GENERAL]) : EMPTY),
    [kits]
  );

  const change = useCallback(
    (brandId: string | null, fn: (kit: BrandKit) => BrandKit) =>
      setKits((prev) => {
        const key = brandId ?? GENERAL;
        const next = fn(normalize(prev[key]));
        const rest = { ...prev };
        delete rest[key];
        // Los clientes sin nada guardado no ocupan lugar en la cuenta.
        return next.emojis.length || next.hashtags.length ? { ...rest, [key]: next } : rest;
      }),
    [setKits]
  );

  const addHashtags = useCallback(
    (brandId: string | null, tags: string[]) =>
      change(brandId, (kit) => ({ ...kit, hashtags: uniqueTags([...kit.hashtags, ...tags]) })),
    [change]
  );

  const removeHashtag = useCallback(
    (brandId: string | null, tag: string) =>
      change(brandId, (kit) => ({ ...kit, hashtags: kit.hashtags.filter((t) => t.toLowerCase() !== tag.toLowerCase()) })),
    [change]
  );

  const toggleEmoji = useCallback(
    (brandId: string | null, emoji: SlimEmoji) =>
      change(brandId, (kit) => ({
        ...kit,
        emojis: kit.emojis.some((e) => e.i === emoji.i)
          ? kit.emojis.filter((e) => e.i !== emoji.i)
          : [...kit.emojis, emoji],
      })),
    [change]
  );

  return { kitOf, addHashtags, removeHashtag, toggleEmoji, loaded };
}
