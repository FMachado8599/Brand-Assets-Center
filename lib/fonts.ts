import type { FontFace } from "./types";

/**
 * Cada archivo subido se registra DOS veces:
 *
 * 1. Como familia propia con su nombre completo ("Montserrat Light"),
 *    con un rango de peso 1–1000. Así el navegador nunca sintetiza una
 *    negrita falsa: lo que ves es exactamente el archivo.
 *    Ese nombre completo es el que después viaja al portapapeles, porque
 *    es como Illustrator e InDesign nombran las fuentes instaladas.
 *    En una fuente variable, cada peso se declara fijando el eje wght.
 *
 * 2. Bajo la familia base ("Montserrat") con su peso real, para que el
 *    fallback funcione si el destino solo conoce la familia.
 */
export function fontFaceCss(fonts: FontFace[]): string {
  return fonts
    .map((f) => {
      const src = `url("${f.file_url}") format("${f.format}")`;
      const style = f.italic ? "italic" : "normal";

      if (f.is_variable) {
        // Un solo archivo con todos los pesos adentro. Declarar un peso
        // único (y no un rango) fija el eje wght en ese valor, así
        // "Montserrat Light" siempre se dibuja en 300 aunque el elemento
        // pida otra cosa.
        const pin = `font-variation-settings:"wght" ${f.weight};`;
        return [
          `@font-face{font-family:"${f.full_name}";src:${src};font-weight:${f.weight};font-style:${style};${pin}font-display:swap;}`,
          `@font-face{font-family:"${f.family}";src:${src};font-weight:${f.weight};font-style:${style};${pin}font-display:swap;}`,
        ].join("\n");
      }

      return [
        `@font-face{font-family:"${f.full_name}";src:${src};font-weight:1 1000;font-style:${style};font-display:swap;}`,
        `@font-face{font-family:"${f.family}";src:${src};font-weight:${f.weight};font-style:${style};font-display:swap;}`,
      ].join("\n");
    })
    .join("\n");
}

const STYLE_ID = "tarjetas-uploaded-fonts";

export function injectFontFaces(fonts: FontFace[]) {
  if (typeof document === "undefined") return;
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = fontFaceCss(fonts);
}

export type ResolvedFace = {
  fullName: string;
  family: string;
  weight: number;
  italic: boolean;
  /** true si no existe el archivo real y hay que falsear el estilo */
  syntheticBold: boolean;
  syntheticItalic: boolean;
};

/**
 * Dado el nombre completo aplicado en el editor + los flags de negrita/
 * cursiva, devuelve la face real que corresponde. Si el usuario pone en
 * negrita un texto en "Montserrat Light" y existe "Montserrat Bold",
 * usamos ese archivo — que es lo que Illustrator espera ver.
 */
export function resolveFace(
  fonts: FontFace[],
  fullName: string | null,
  bold: boolean,
  italic: boolean
): ResolvedFace | null {
  if (!fullName) return null;
  const base = fonts.find((f) => f.full_name === fullName);
  if (!base) {
    return {
      fullName,
      family: fullName,
      weight: bold ? 700 : 400,
      italic,
      syntheticBold: bold,
      syntheticItalic: italic,
    };
  }

  const wantItalic = italic || base.italic;
  const wantWeight = bold ? Math.max(base.weight, 700) : base.weight;
  const sameFamily = fonts.filter((f) => f.family === base.family);

  const exact =
    sameFamily.find((f) => f.weight === wantWeight && f.italic === wantItalic) ||
    (bold
      ? sameFamily.find((f) => f.weight === 700 && f.italic === wantItalic)
      : undefined);

  if (exact) {
    return {
      fullName: exact.full_name,
      family: exact.family,
      weight: exact.weight,
      italic: exact.italic,
      syntheticBold: false,
      syntheticItalic: false,
    };
  }

  const italicOnly = sameFamily.find(
    (f) => f.weight === wantWeight && f.italic === wantItalic
  );
  if (italicOnly) {
    return {
      fullName: italicOnly.full_name,
      family: italicOnly.family,
      weight: italicOnly.weight,
      italic: italicOnly.italic,
      syntheticBold: false,
      syntheticItalic: false,
    };
  }

  return {
    fullName: base.full_name,
    family: base.family,
    weight: base.weight,
    italic: base.italic,
    syntheticBold: bold && base.weight < 600,
    syntheticItalic: italic && !base.italic,
  };
}

/** Agrupa las faces por familia, ordenadas por peso. */
export function groupByFamily(fonts: FontFace[]) {
  const map = new Map<string, FontFace[]>();
  for (const f of fonts) {
    const list = map.get(f.family) || [];
    list.push(f);
    map.set(f.family, list);
  }
  for (const [, list] of map) {
    list.sort((a, b) => a.weight - b.weight || Number(a.italic) - Number(b.italic));
  }
  return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
}
