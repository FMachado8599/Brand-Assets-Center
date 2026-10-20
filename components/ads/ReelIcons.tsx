/**
 * Los íconos de la pantalla de Reels, dibujados para el simulador (no son los archivos de Instagram): mismo
 * tamaño y misma forma que en la captura de referencia, en blanco y con trazo redondeado. Los trazos están
 * en constantes porque también se dibujan en el canvas de la imagen que se descarga.
 */
import type { ReactNode } from "react";

/** Íconos de trazo, en una caja de 24 × 24: los caminos y el grosor. */
export const STROKES = {
  heart: {
    width: 1.75,
    d: ["M12 20.2c-.4 0-7.1-4.4-8.9-8.5C1.5 8 3.6 4.3 7.2 4.3c2 0 3.6 1.1 4.8 2.9 1.2-1.8 2.8-2.9 4.8-2.9 3.6 0 5.7 3.7 4.1 7.4-1.8 4.1-8.5 8.5-8.9 8.5Z"],
  },
  comment: { width: 1.75, d: ["M20.66 17.01a9.99 9.99 0 1 0-3.59 3.61L22 22Z"] },
  /** Repostear: dos flechas que dan la vuelta (arriba hacia la derecha, abajo hacia la izquierda). */
  repost: {
    width: 1.75,
    d: ["M4.5 13V9.5A2.5 2.5 0 0 1 7 7h12", "m16.5 4 3 3-3 3", "M19.5 11v3.5a2.5 2.5 0 0 1-2.5 2.5H5", "m7.5 20-3-3 3-3"],
  },
  /** Compartir: el avión de papel con la punta abajo. */
  share: { width: 1.75, d: ["M2.5 4h19L12 21.2Z", "M21.5 4 9.4 11.2"] },
  /** Más opciones: dos líneas, la de abajo más corta. */
  more: { width: 1.75, d: ["M3.5 9.5h17", "M3.5 15.5h11"] },
  back: { width: 1.8, d: ["M15.5 3.5 7 12l8.5 8.5"] },
  chevron: { width: 2.6, d: ["m9 5 7 7-7 7"] },
} as const;

export type StrokeName = keyof typeof STROKES;

/** La silueta de alguien (relleno), para las caras de las burbujas. */
export const PERSON_D = ["M7.4 9a4.6 4.6 0 1 0 9.2 0a4.6 4.6 0 1 0-9.2 0Z", "M3.5 22.5c.7-4.6 4.2-7.5 8.5-7.5s7.8 2.9 8.5 7.5Z"];

/** La insignia de las burbujas: una persona (relleno) con un tilde (trazo). */
export const FOLLOW_D = {
  fill: ["M8.5 7.5a4.5 4.5 0 1 0 9 0a4.5 4.5 0 1 0-9 0Z", "M13 13.5c-4.4 0-7.5 2.3-7.5 5.2 0 .7.5 1.3 1.2 1.3h12.6c.7 0 1.2-.6 1.2-1.3 0-2.9-3.1-5.2-7.5-5.2Z"],
  check: "m1.8 15.6 2.2 2.2 4-4.3",
};

type IconProps = { size?: number; className?: string };

function Stroke({ name, size = 28, className }: IconProps & { name: StrokeName }) {
  const { d, width } = STROKES[name];
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {d.map((path) => (
        <path key={path} d={path} />
      ))}
    </svg>
  );
}

export const HeartIcon = (p: IconProps) => <Stroke name="heart" {...p} />;
export const CommentIcon = (p: IconProps) => <Stroke name="comment" {...p} />;
export const RepostIcon = (p: IconProps) => <Stroke name="repost" {...p} />;
export const ShareIcon = (p: IconProps) => <Stroke name="share" {...p} />;
export const MoreIcon = (p: IconProps) => <Stroke name="more" {...p} />;
export const BackIcon = (p: IconProps) => <Stroke name="back" {...p} />;
export const ChevronIcon = (p: IconProps) => <Stroke name="chevron" {...p} />;

function Filled({ size, children }: { size: number; children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden fill="currentColor">
      {children}
    </svg>
  );
}

/** La insignia de las burbujas: una persona con un tilde (alguien que ya sigue a la cuenta). */
export function FollowBadgeIcon({ size = 12 }: { size?: number }) {
  return (
    <Filled size={size}>
      {FOLLOW_D.fill.map((d) => (
        <path key={d} d={d} />
      ))}
      <path d={FOLLOW_D.check} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </Filled>
  );
}

/** La silueta de alguien, para las caras de las burbujas. */
export function PersonGlyph({ size = 28 }: { size?: number }) {
  return (
    <Filled size={size}>
      {PERSON_D.map((d) => (
        <path key={d} d={d} />
      ))}
    </Filled>
  );
}

/** Barra de estado del iPhone: señal, 5G y batería. */
export function StatusIcons() {
  return (
    <span className="flex items-center gap-[6px]" aria-hidden>
      <svg viewBox="0 0 18 12" width={18} height={12} fill="currentColor">
        <rect x="0" y="7.5" width="3" height="4.5" rx="0.8" />
        <rect x="5" y="5" width="3" height="7" rx="0.8" />
        <rect x="10" y="2.5" width="3" height="9.5" rx="0.8" />
        <rect x="15" y="0" width="3" height="12" rx="0.8" opacity="0.35" />
      </svg>
      <span className="text-[15px] font-semibold leading-none tracking-[-0.01em]">5G</span>
      <svg viewBox="0 0 27 13" width={27} height={13}>
        <rect x="0.5" y="0.5" width="23" height="12" rx="3.6" fill="none" stroke="currentColor" strokeOpacity="0.4" />
        <rect x="2.2" y="2.2" width="16" height="8.6" rx="2.2" fill="currentColor" />
        <path d="M25 4.4v4.2c.8-.3 1.4-1.1 1.4-2.1S25.8 4.7 25 4.4Z" fill="currentColor" fillOpacity="0.4" />
      </svg>
    </span>
  );
}
