import type { AudioMode, CoverMode, Destination, MediaCover, MediaFile, MediaInfo } from "./types";

/**
 * Una cosa para guardar: un archivo de un posteo, un video de YouTube en una calidad, o la portada de
 * un video (`cover`, con el archivo del que es portada para numerarla dentro del carrusel).
 */
export type SaveTarget = { info: MediaInfo; file?: MediaFile; quality?: number; cover?: MediaCover };

export function isVideoTarget({ info, file, cover }: SaveTarget) {
  return !cover && (!!info.youtube || file?.kind === "video");
}

/**
 * Los videos de YouTube que van solo a la compu los baja el navegador directo de la PC (pueden pesar cientos
 * de MB): no pasan por la memoria de la página ni entran en el .zip. Todo lo demás sí.
 */
export function isDirectTarget(target: SaveTarget, destino: Destination) {
  return destino === "compu" && !!target.info.youtube && !target.cover;
}

/** Cuántos de estos archivos van juntos a la compu: con más de uno, salen en un .zip. */
export function zipCount(targets: SaveTarget[], destino: Destination) {
  return destino === "drive" ? 0 : targets.filter((t) => !isDirectTarget(t, destino)).length;
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

/** Si en el posteo hay algún video (se puede elegir qué bajar de él) y si alguno trae portada. */
export function coverChoice(info: MediaInfo) {
  if (info.youtube) return { hasVideo: true, hasCover: !!info.youtube.cover };
  const videos = info.files.filter((f) => f.kind === "video");
  return { hasVideo: videos.length > 0, hasCover: videos.some((f) => f.cover) };
}

/** Adónde va: "a tu compu", "a tu compu (en un .zip) y a Drive"… El .zip es solo para la compu: a Drive va cada archivo. */
function where(destino: Destination, zip: boolean) {
  const computer = `a tu compu${zip ? " (en un .zip)" : ""}`;
  return destino === "compu" ? computer : destino === "ambos" ? `${computer} y a Drive` : "a Drive";
}

/**
 * Lo que hace el botón Descargar, entero, para el tooltip y los lectores de pantalla:
 * "Descargar el video y su portada a tu compu", "Descargar 3 fotos y 2 videos a Drive"…
 */
export function saveHint(destino: Destination, audio: AudioMode, targets: SaveTarget[]) {
  const covers = targets.filter((t) => t.cover).length;
  const videos = targets.filter(isVideoTarget).length;
  const photos = targets.length - covers - videos;
  const [one, many] = audio === "solo" ? ["el audio", "audios"] : ["el video", "videos"];
  const parts = [
    photos && (photos === 1 ? "la foto" : `${photos} fotos`),
    videos && (videos === 1 ? one : `${videos} ${many}`),
    covers && (covers > 1 ? `${covers} portadas` : videos === 1 && targets.length === 2 ? "su portada" : "la portada"),
  ].filter((p): p is string => !!p);
  const what = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} y ${parts.at(-1)}` : (parts[0] ?? "");
  return `Descargar ${what} ${where(destino, zipCount(targets, destino) > 1)}`;
}
