/**
 * El Jam tiene su propia estética, la de Spotify (negro y verde), con vidrio esmerilado, brillos y
 * botones en relieve. Vive en la burbuja (sobre cualquier módulo) y en /spotify, por eso no usa
 * los colores de la app: así se lee igual sobre el crema de la app que sobre una foto.
 */

/** Tarjeta de vidrio oscuro con borde de luz arriba y sombra profunda. */
export const vidrio =
  "relative isolate overflow-clip rounded-[28px] border border-white/10 bg-[#121212]/80 text-white " +
  "shadow-[0_30px_80px_-24px_rgba(0,0,0,0.75),inset_0_1px_0_rgba(255,255,255,0.09)] backdrop-blur-2xl backdrop-saturate-150";

/** El resplandor verde detrás de una tarjeta (va como primer hijo, con -z-10). */
export const resplandor =
  "pointer-events-none absolute -z-10 rounded-full bg-[#1ed760]/25 blur-3xl";

/** Botón redondo en relieve (neumorfismo sobre negro): se hunde al apretarlo o al estar activo. */
export const relieve =
  "grid shrink-0 place-items-center rounded-full bg-[#1b1b1b] text-[#b3b3b3] outline-none transition-[color,box-shadow,transform] " +
  "shadow-[5px_5px_12px_rgba(0,0,0,0.6),-4px_-4px_10px_rgba(255,255,255,0.045)] hover:text-white " +
  "focus-visible:ring-2 focus-visible:ring-[#1ed760]/70 focus-visible:ring-offset-[#121212] active:scale-95 disabled:pointer-events-none disabled:opacity-40";

export const hundido =
  "text-[#1ed760] shadow-[inset_4px_4px_10px_rgba(0,0,0,0.65),inset_-3px_-3px_8px_rgba(255,255,255,0.05)]";

/** La acción principal: píldora verde que brilla. */
export const pildoraVerde =
  "inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#1ed760] px-5 text-sm font-bold text-black outline-none transition " +
  "shadow-[0_10px_30px_-6px_rgba(30,215,96,0.65),inset_0_1px_0_rgba(255,255,255,0.45)] hover:bg-[#3be477] " +
  "focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-[#121212] active:scale-[0.98] aria-disabled:pointer-events-none aria-disabled:opacity-40";

/** El anillo de foco de la app es amarillo sobre crema: acá, verde sobre negro. */
export const foco = "focus-visible:ring-2 focus-visible:ring-[#1ed760]/70 focus-visible:ring-offset-[#121212]";

/** Texto secundario de Spotify. */
export const apagado = "text-[#b3b3b3]";

/** Campo de texto hundido. */
export const campo =
  "h-11 w-full rounded-full border border-white/5 bg-[#0d0d0d] pl-10 pr-10 text-sm text-white placeholder:text-[#7a7a7a] outline-none " +
  "shadow-[inset_3px_3px_8px_rgba(0,0,0,0.7),inset_-2px_-2px_6px_rgba(255,255,255,0.04)] focus-visible:ring-2 focus-visible:ring-[#1ed760]/60 focus-visible:ring-offset-0";

export const minutos = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
