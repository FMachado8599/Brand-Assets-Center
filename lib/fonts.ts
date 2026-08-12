import type { FontFace } from "./types";

/**
 * Cada archivo subido se registra DOS veces:
 *
 * 1. Como familia propia con su nombre completo ("Montserrat Light"),
 *    con un rango de peso 1–1000. Así el navegador nunca sintetiza una
 *    negrita falsa: lo que ves es exactamente el archivo.
 *    Ese nombre completo es el que después viaja al portapapeles, porque
 *    es como Illustrator e InDesign nombran las fuentes instaladas.
 *
 * 2. Bajo la familia base ("Montserrat") con su peso real, para que el
 *    fallback funcione si el destino solo conoce la familia.
 */
export function fontFaceCss(fonts: FontFace[]): string {
  return fonts
    .map((f) => {
      const src = `url("${f.file_url}") format("${f.format}")`;
      const style = f.italic ? "italic" : "normal";
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

/** Lee family / style / weight / italic desde el nombre del archivo. */
export function guessFromFilename(filename: string) {
  const clean = filename.replace(/\.(woff2|woff|ttf|otf)$/i, "");
  const parts = clean.split(/[-_]/);
  const raw = parts.length > 1 ? parts.slice(1).join(" ") : "";
  const family = parts[0].replace(/([a-z])([A-Z])/g, "$1 $2").trim() || clean;

  const italic = /italic|oblique/i.test(raw);
  const styleRaw = raw.replace(/italic|oblique/gi, "").trim();

  const table: [RegExp, number, string][] = [
    [/extra\s*light|ultra\s*light/i, 200, "ExtraLight"],
    [/semi\s*bold|demi\s*bold/i, 600, "SemiBold"],
    [/extra\s*bold|ultra\s*bold/i, 800, "ExtraBold"],
    [/thin|hairline/i, 100, "Thin"],
    [/light/i, 300, "Light"],
    [/medium/i, 500, "Medium"],
    [/black|heavy/i, 900, "Black"],
    [/bold/i, 700, "Bold"],
    [/regular|normal|book/i, 400, "Regular"],
  ];

  let weight = 400;
  let styleName = "Regular";
  for (const [re, w, label] of table) {
    if (re.test(styleRaw)) {
      weight = w;
      styleName = label;
      break;
    }
  }
  if (italic && styleName === "Regular") styleName = "Italic";
  else if (italic) styleName = `${styleName} Italic`;

  return { family, styleName, weight, italic };
}

export function formatFromFilename(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "woff2") return "woff2";
  if (ext === "woff") return "woff";
  if (ext === "otf") return "opentype";
  return "truetype";
}
