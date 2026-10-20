import { SCREEN } from "./reel";

/**
 * Los tipos de mockup: cada forma en que Instagram muestra un anuncio 9:16. Las medidas salen de capturas
 * reales en un iPhone de 390 × 844 pt (ver README, "Ads").
 */
export type Placement = "reels" | "reels-feed" | "story" | "story-lead" | "story-form";

export type PlacementInfo = { id: Placement; label: string; hint: string; kind: "reels" | "story" };

export const PLACEMENTS: PlacementInfo[] = [
  {
    id: "reels",
    label: "Reels",
    hint: "En la pestaña Reels: tarjeta con miniatura, título y botón, contadores y la barra de abajo de Instagram.",
    kind: "reels",
  },
  {
    id: "reels-feed",
    label: "Reels desde el feed",
    hint: "Abierto desde el inicio: flecha para atrás, burbujas de seguidores, botón y barra de comentarios.",
    kind: "reels",
  },
  {
    id: "story",
    label: "Historia",
    hint: "Encabezado de la cuenta, el sticker del enlace y, abajo, «Publicidad» con me gusta y responder.",
    kind: "story",
  },
  {
    id: "story-lead",
    label: "Historia con «Me interesa»",
    hint: "Anuncio de clientes potenciales: el sticker y los botones «No me interesa» y «Me interesa».",
    kind: "story",
  },
  {
    id: "story-form",
    label: "Historia con formulario",
    hint: "El sticker y, debajo, «Desliza hacia arriba para ver el formulario».",
    kind: "story",
  },
];

export const placementInfo = (id: Placement) => PLACEMENTS.find((p) => p.id === id) ?? PLACEMENTS[0];

/** El creativo siempre va en 9:16 a lo ancho; cambia dónde empieza y si tiene las esquinas redondeadas. */
export type Frame = { top: number; height: number; radius: number };

const MEDIA_H = (SCREEN.w * 16) / 9;

export function frameOf(p: Placement): Frame {
  if (p === "reels-feed") return { top: 34.6, height: MEDIA_H, radius: 0 };
  if (p === "reels") return { top: 39.1, height: MEDIA_H, radius: 0 };
  return { top: 53.4, height: MEDIA_H, radius: 5 };
}
