/**
 * Los íconos de Instagram, dibujados para el simulador (no son los archivos de Instagram): misma forma y tamaño
 * que en las capturas de referencia. Trazos en una caja de 24 × 24, en blanco y redondeados.
 */
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
  /** Compartir / mensajes: el avión de papel con la punta abajo. */
  share: { width: 1.75, d: ["M2.5 4h19L12 21.2Z", "M21.5 4 9.4 11.2"] },
  /** Más opciones del Reel abierto: dos líneas, la de abajo más corta. */
  more: { width: 1.75, d: ["M3.5 9.5h17", "M3.5 15.5h11"] },
  back: { width: 1.8, d: ["M15.5 3.5 7 12l8.5 8.5"] },
  chevron: { width: 2.6, d: ["m9 5 7 7-7 7"] },
  close: { width: 2, d: ["M5 5l14 14", "M19 5 5 19"] },
  check: { width: 2.4, d: ["m4.5 12.5 4.8 4.8L19.5 7"] },
  /** El ícono azul del sticker de enlace de las historias. */
  link: {
    width: 2.6,
    d: ["M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71", "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"],
  },
  /** La barra de abajo de la pestaña Reels. */
  home: { width: 1.9, d: ["M3.5 10.2 12 3.5l8.5 6.7V20a1 1 0 0 1-1 1h-4.8v-6.2H9.3V21H4.5a1 1 0 0 1-1-1Z"] },
  search: { width: 1.9, d: ["M10.8 18.1a7.3 7.3 0 1 0 0-14.6 7.3 7.3 0 0 0 0 14.6Z", "m16.2 16.2 4.8 4.8"] },
  /** Guardar (el marcador de la derecha en el feed). */
  bookmark: { width: 1.9, d: ["M6 3.5h12v17l-6-5.4-6 5.4Z"] },
  /** La pestaña Reels sin elegir: un cuadrado redondeado con el triángulo. */
  reelsTab: { width: 1.9, d: ["M7 3.5h10a3.5 3.5 0 0 1 3.5 3.5v10a3.5 3.5 0 0 1-3.5 3.5H7A3.5 3.5 0 0 1 3.5 17V7A3.5 3.5 0 0 1 7 3.5Z", "M10 9v6l5-3Z"] },
} as const;

export type StrokeName = keyof typeof STROKES;

/** La silueta de alguien (relleno), para las caras de las burbujas y la foto de perfil de la barra. */
export const PERSON_D = ["M7.4 9a4.6 4.6 0 1 0 9.2 0a4.6 4.6 0 1 0-9.2 0Z", "M3.5 22.5c.7-4.6 4.2-7.5 8.5-7.5s7.8 2.9 8.5 7.5Z"];

/** La insignia de las burbujas: una persona (relleno) con un tilde (trazo). */
export const FOLLOW_D = {
  fill: ["M8.5 7.5a4.5 4.5 0 1 0 9 0a4.5 4.5 0 1 0-9 0Z", "M13 13.5c-4.4 0-7.5 2.3-7.5 5.2 0 .7.5 1.3 1.2 1.3h12.6c.7 0 1.2-.6 1.2-1.3 0-2.9-3.1-5.2-7.5-5.2Z"],
  check: "m1.8 15.6 2.2 2.2 4-4.3",
};
