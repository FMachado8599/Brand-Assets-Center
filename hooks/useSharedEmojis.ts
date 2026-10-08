"use client";

import { useCallback, useMemo } from "react";
import type { EmojiSettings } from "@/components/emojis/EmojiPanels";
import { useStoredState } from "@/hooks/useStoredState";
import type { EmojiEntry, Tone } from "@/lib/emojis/types";
import type { SlimEmoji } from "@/lib/redaccion/types";

/** Los mismos valores por defecto que el módulo Emojis: se comparte la clave de ajustes. */
const DEFAULT_SETTINGS: EmojiSettings = { size: 512, click: "image", tone: 0 };
const MAX_RECENTS = 16;

export const slim = ({ i, c, n, e, g, s, k }: SlimEmoji | EmojiEntry): SlimEmoji => ({ i, c, n, e, g, s, ...(k ? { k } : {}) });

function isSlim(value: unknown): value is SlimEmoji {
  const r = value as SlimEmoji | null;
  return !!r && typeof r === "object" && typeof r.i === "string" && typeof r.c === "string" && typeof r.n === "string";
}

/**
 * Tono de piel, recientes y favoritos del módulo Emojis: en Redacción son los
 * mismos, así un emoji que usaste en un lado aparece a mano en el otro.
 */
export function useSharedEmojis() {
  const [settings, setSettings] = useStoredState<EmojiSettings>("emojis:ajustes", DEFAULT_SETTINGS);
  const [storedRecents, setRecents] = useStoredState<SlimEmoji[]>("emojis:recientes", []);
  const [favorites] = useStoredState<string[]>("emojis:favoritos", []);

  const recents = useMemo(() => (Array.isArray(storedRecents) ? storedRecents.filter(isSlim) : []), [storedRecents]);

  const remember = useCallback(
    (emoji: SlimEmoji | EmojiEntry) =>
      setRecents((prev) =>
        [slim(emoji), ...(Array.isArray(prev) ? prev : []).filter((r) => isSlim(r) && r.i !== emoji.i)].slice(0, MAX_RECENTS)
      ),
    [setRecents]
  );

  const setTone = useCallback((tone: Tone) => setSettings((prev) => ({ ...prev, tone })), [setSettings]);

  return {
    tone: settings.tone,
    setTone,
    recents,
    favorites: Array.isArray(favorites) ? favorites : [],
    remember,
  };
}
