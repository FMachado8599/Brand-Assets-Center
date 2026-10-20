import type { CoverMode, Destination, MediaCover, MediaFile, MediaInfo } from "./types";

/**
 * Una cosa para guardar: un archivo de un posteo, un video de YouTube en una calidad, o la portada de
 * un video (`cover`, con el archivo del que es portada para numerarla dentro del carrusel).
 */
export type SaveTarget = { info: MediaInfo; file?: MediaFile; quality?: number; cover?: MediaCover };

export function isVideoTarget({ info, file, cover }: SaveTarget) {
  return !cover && (!!info.youtube || file?.kind === "video");
}

/**
 * Lo que sale de un posteo (o de un solo archivo del carrusel) según lo elegido para los videos: el video,
 * el video y su portada, o solo la portada. Las fotos salen siempre. Un video sin portada sale solo en
 * "video y portada"; en "solo portada" queda afuera.
 */
export function planTargets(info: MediaInfo, portada: CoverMode, opts: { file?: MediaFile; quality?: number } = {}): SaveTarget[] {
  const pick = (video: SaveTarget, cover: MediaCover | undefined): SaveTarget[] => {
    if (portada === "video") return [video];
    if (!cover) return portada === "ambos" ? [video] : [];
    const image = { ...video, quality: undefined, cover };
    return portada === "portada" ? [image] : [video, image];
  };
  if (info.youtube) return pick({ info, quality: opts.quality }, info.youtube.cover);
  return (opts.file ? [opts.file] : info.files).flatMap((file) =>
    file.kind === "video" ? pick({ info, file }, file.cover) : [{ info, file }]
  );
}

/** "Descargar", "Descargar 3", "Descargar portada", "Guardar video y portada en Drive"… */
export function actionLabel(destino: Destination, targets: SaveTarget[]) {
  const count = targets.length;
  const covers = targets.filter((t) => t.cover).length;
  let what = count > 1 ? ` ${count}` : "";
  if (count && covers === count) what = count > 1 ? ` ${count} portadas` : " portada";
  else if (count === 2 && covers === 1 && destino !== "ambos") what = " video y portada";
  if (destino === "drive") return `Guardar${what} en Drive`;
  if (destino === "ambos") return `Descargar${what} y subir`;
  return `Descargar${what}`;
}
