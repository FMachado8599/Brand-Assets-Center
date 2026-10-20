/**
 * Los íconos de la pantalla de Reels, dibujados para el simulador (no son los archivos de Instagram): mismo
 * tamaño y misma forma que en la captura de referencia, en blanco y con trazo redondeado.
 */
import type { ReactNode } from "react";

type IconProps = { size?: number; className?: string };

function Stroke({ size = 28, className, children, width = 1.75 }: IconProps & { children: ReactNode; width?: number }) {
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
      {children}
    </svg>
  );
}

export const HeartIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M12 20.2c-.4 0-7.1-4.4-8.9-8.5C1.5 8 3.6 4.3 7.2 4.3c2 0 3.6 1.1 4.8 2.9 1.2-1.8 2.8-2.9 4.8-2.9 3.6 0 5.7 3.7 4.1 7.4-1.8 4.1-8.5 8.5-8.9 8.5Z" />
  </Stroke>
);

export const CommentIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M20.66 17.01a9.99 9.99 0 1 0-3.59 3.61L22 22Z" />
  </Stroke>
);

/** Repostear: dos flechas que dan la vuelta (arriba hacia la derecha, abajo hacia la izquierda). */
export const RepostIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M4.5 13V9.5A2.5 2.5 0 0 1 7 7h12" />
    <path d="m16.5 4 3 3-3 3" />
    <path d="M19.5 11v3.5a2.5 2.5 0 0 1-2.5 2.5H5" />
    <path d="m7.5 20-3-3 3-3" />
  </Stroke>
);

/** Compartir: el avión de papel con la punta abajo. */
export const ShareIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M2.5 4h19L12 21.2Z" />
    <path d="M21.5 4 9.4 11.2" />
  </Stroke>
);

/** Más opciones: dos líneas, la de abajo más corta. */
export const MoreIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M3.5 9.5h17" />
    <path d="M3.5 15.5h11" />
  </Stroke>
);

export const BackIcon = (p: IconProps) => (
  <Stroke {...p} width={1.8}>
    <path d="M15.5 3.5 7 12l8.5 8.5" />
  </Stroke>
);

export const ChevronIcon = (p: IconProps) => (
  <Stroke {...p} width={2.6}>
    <path d="m9 5 7 7-7 7" />
  </Stroke>
);

/** La insignia de las burbujas: una persona con un tilde (alguien que ya sigue a la cuenta). */
export function FollowBadgeIcon({ size = 12 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden fill="currentColor">
      <circle cx="13" cy="7.5" r="4.5" />
      <path d="M13 13.5c-4.4 0-7.5 2.3-7.5 5.2 0 .7.5 1.3 1.2 1.3h12.6c.7 0 1.2-.6 1.2-1.3 0-2.9-3.1-5.2-7.5-5.2Z" />
      <path d="m1.8 15.6 2.2 2.2 4-4.3" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** La silueta de alguien, para las caras de las burbujas. */
export function PersonGlyph({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden fill="currentColor">
      <circle cx="12" cy="9" r="4.6" />
      <path d="M3.5 22.5c.7-4.6 4.2-7.5 8.5-7.5s7.8 2.9 8.5 7.5Z" />
    </svg>
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
