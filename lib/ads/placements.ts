import { ratioGap, SCREEN, type AdMedia } from "./reel";

/**
 * Las piezas y sus mockups. Una pieza es lo que se sube (como en Planificación: post, carrusel, reel o
 * historia); cada pieza se ve en uno o varios mockups, que son las formas en que Instagram muestra un
 * anuncio. Las medidas salen de capturas reales en un iPhone de 390 × 844 pt (ver README, "Ads").
 */
export type PieceType = "post" | "carrusel" | "reel" | "historia";

export const PIECE_TYPES: { id: PieceType; label: string; hint: string; multiple?: boolean }[] = [
  { id: "post", label: "Post", hint: "Una imagen o un video para el feed, en 4:5 o 1:1." },
  { id: "carrusel", label: "Carrusel", hint: "De 2 a 10 imágenes o videos, en 4:5 o 1:1.", multiple: true },
  { id: "reel", label: "Reel", hint: "Un video (o una imagen) en 9:16." },
  { id: "historia", label: "Historia", hint: "Una imagen o un video en 9:16." },
];

export const pieceInfo = (id: PieceType) => PIECE_TYPES.find((p) => p.id === id) ?? PIECE_TYPES[0];

export type Placement = "feed" | "reels" | "reels-feed" | "story" | "story-lead" | "story-form";

export type PlacementInfo = { id: Placement; label: string; hint: string; kind: "feed" | "reels" | "story" };

export const PLACEMENTS: PlacementInfo[] = [
  {
    id: "feed",
    label: "Feed",
    hint: "En el inicio: la cuenta con «Publicidad», el creativo en 4:5 o 1:1, la barra del botón, me gusta y el texto. Si es un carrusel, con el «1/5» y los puntitos.",
    kind: "feed",
  },
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

/** Cuando la pieza no tiene la proporción del lugar: qué hace Meta con ella. */
export function adaptation(placement: Placement, media: AdMedia | null): string | null {
  if (!media) return null;
  const tall = ratioGap(media) <= 0.02;
  if (placementInfo(placement).kind === "feed") return tall ? "Meta lo recorta a 4:5" : null;
  return tall ? null : "Adaptado por Meta (con fondo o ampliado con IA)";
}

/** Lo que se arma por defecto: 9:16 → historia y Reels; 4:5 o 1:1 → feed. */
export function defaultPlacements(media: AdMedia | null): Placement[] {
  if (media && ratioGap(media) <= 0.02) return ["story", "reels"];
  return ["feed"];
}

/** Dónde va el creativo en la pantalla: siempre a lo ancho; cambia dónde empieza y su alto. */
export type Frame = { top: number; height: number; radius: number };

const MEDIA_H = (SCREEN.w * 16) / 9;

/** En el feed: 4:5 como mucho de alto (lo más alto se recorta) y 1,91:1 como mucho de ancho. */
export function feedRatio(media: AdMedia | null) {
  const r = media ? media.width / media.height : 4 / 5;
  return Math.min(1.91, Math.max(0.8, r));
}

export const FEED_TOP = 145;

export function frameOf(p: Placement, media: AdMedia | null = null): Frame {
  if (p === "feed") return { top: FEED_TOP, height: SCREEN.w / feedRatio(media), radius: 0 };
  if (p === "reels-feed") return { top: 34.6, height: MEDIA_H, radius: 0 };
  if (p === "reels") return { top: 39.1, height: MEDIA_H, radius: 0 };
  return { top: 53.4, height: MEDIA_H, radius: 5 };
}
