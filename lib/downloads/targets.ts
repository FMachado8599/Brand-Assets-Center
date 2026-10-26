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

const WHERE: Record<Destination, string> = { compu: "a tu compu", ambos: "a tu compu y a Drive", drive: "a Drive" };

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
  return `Descargar ${what} ${WHERE[destino]}`;
}
