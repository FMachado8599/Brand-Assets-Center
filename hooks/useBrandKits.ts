"use client";

import { useCallback } from "react";
import { useClients } from "@/hooks/useClients";
import { useStoredState } from "@/hooks/useStoredState";
import { uniqueTags } from "@/lib/redaccion/text";
import { GENERAL, type BrandKit, type BrandKits, type BrandLite, type SlimEmoji } from "@/lib/redaccion/types";

/**
 * Los clientes de Redacción: la lista de toda la app (se crean desde el
 * selector, desde Tarjetas o en Clientes). Para elegir uno alcanza con
 * nombre y color.
 */
export function useBrands(): { brands: BrandLite[]; loading: boolean } {
  const { clients, loading } = useClients();
  return { brands: clients, loading };
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
