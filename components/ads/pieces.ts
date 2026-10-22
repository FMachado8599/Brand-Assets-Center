import { sampleColors, type AdColors } from "@/lib/ads/color";
import { defaultPlacements, type PieceType, type Placement } from "@/lib/ads/placements";
import { ratioGap, type AdMedia } from "@/lib/ads/reel";
import type { TextBox } from "@/lib/ads/safe";
import { scanMedia } from "@/lib/ads/textScan";
import { mediaFrame } from "./draw";

/** Un archivo de una pieza (un carrusel tiene varios). */
export type AdCard = {
  id: string;
  media: AdMedia;
  colors: AdColors;
  /** Un cuadro quieto (la imagen, o uno del video): la miniatura de Reels y lo que se descarga en lote. */
  frame?: CanvasImageSource;
  /** Los textos que tiene (de un video, los de varios cuadros); sin esto, todavía se están buscando. */
  texts?: TextBox[];
};

/** Una pieza: lo que se sube (post, carrusel, reel o historia) y en qué mockups se ve. */
export type Piece = {
  id: string;
  type: PieceType;
  cards: AdCard[];
  placements: Placement[];
  /** Si no es 9:16 y va en un lugar 9:16: entero con fondo o recortado. */
  fit: "cover" | "contain";
  /** El color del botón elegido a mano (si no, sale del primer archivo). */
  ctaColor: string | null;
  /** En un carrusel: el slide que se ve en los mockups (las flechas lo cambian). */
  slide: number;
  /** Los archivos cuyo aviso de texto se ignoró (porque no era texto o porque está bien así). */
  textIgnored: string[];
};

export const MAX_CARDS = 10;

export const isOffRatio = (m: AdMedia) => ratioGap(m) > 0.02;
export const isLowRes = (m: AdMedia) => (isOffRatio(m) ? m.width < 1080 : Math.min(m.width, (m.height * 9) / 16) < 1080);

/** Abre el archivo para medirlo y sacarle los colores; el creativo nunca sale del navegador. */
export function readMedia(file: File): Promise<{ media: AdMedia; colors: AdColors }> {
  const kind = file.type.startsWith("video/") ? "video" : file.type.startsWith("image/") ? "image" : null;
  if (!kind) return Promise.reject(new Error("Eso no es una imagen ni un video."));
  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const fail = () => {
      URL.revokeObjectURL(url);
      reject(new Error(kind === "video" ? "El navegador no pudo abrir ese video." : "No se pudo abrir esa imagen."));
    };
    if (kind === "image") {
      const img = new Image();
      img.onload = () =>
        resolve({
          media: { url, kind, width: img.naturalWidth, height: img.naturalHeight, name: file.name },
          colors: sampleColors(img, img.naturalWidth, img.naturalHeight),
        });
      img.onerror = fail;
      img.src = url;
      return;
    }
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.onloadedmetadata = () => {
      // Los colores salen de un cuadro de adentro: el primero suele ser negro.
      video.currentTime = Math.min(1, (video.duration || 0) / 3);
    };
    video.onseeked = () =>
      resolve({
        media: { url, kind, width: video.videoWidth, height: video.videoHeight, name: file.name },
        colors: sampleColors(video, video.videoWidth, video.videoHeight),
      });
    video.onerror = fail;
    video.src = url;
  });
}

/** Lee los archivos (de a uno, en orden). Los que fallan se informan y se saltean. */
export async function readCards(files: File[], onError: (message: string) => void): Promise<AdCard[]> {
  const cards: AdCard[] = [];
  for (const file of files.filter((f) => /^(image|video)\//.test(f.type))) {
    try {
      const { media, colors } = await readMedia(file);
      cards.push({ id: crypto.randomUUID(), media, colors });
    } catch (err) {
      onError(`${file.name}: ${err instanceof Error ? err.message : "no se pudo abrir."}`);
    }
  }
  return cards;
}

/** El cuadro quieto de cada archivo, que llega después. */
export function loadFrames(cards: AdCard[], onFrame: (cardId: string, frame: CanvasImageSource) => void) {
  for (const card of cards) {
    mediaFrame(card.media)
      .then((frame) => onFrame(card.id, frame))
      .catch(() => {});
  }
}

/** Busca el texto de cada archivo (de a uno: los videos se recorren cuadro por cuadro). */
export async function scanCards(cards: AdCard[], onTexts: (cardId: string, texts: TextBox[]) => void) {
  for (const card of cards) onTexts(card.id, await scanMedia(card.media));
}

/** Qué pieza parece, por los archivos: varios → carrusel; 9:16 → reel (video) o historia; si no, post. */
export function guessType(cards: AdCard[]): PieceType {
  if (cards.length > 1) return "carrusel";
  const m = cards[0]?.media;
  if (m && !isOffRatio(m)) return m.kind === "video" ? "reel" : "historia";
  return "post";
}

export function newPiece(type: PieceType, cards: AdCard[], placements = defaultPlacements(cards[0]?.media ?? null)): Piece {
  return { id: crypto.randomUUID(), type, cards, placements, fit: "contain", ctaColor: null, slide: 0, textIgnored: [] };
}

/** "campaña-otoño.jpg" → "campaña-otoño" (sin caracteres que Windows no acepta). */
export function baseName(m: AdMedia) {
  return m.name.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]+/g, "-").trim() || "anuncio";
}
