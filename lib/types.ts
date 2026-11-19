import type { BrandSocial } from "@/lib/clients/socials";

/** Fondo del logo: papel, negro o el color del cliente. */
export type LogoBg = "light" | "dark" | "brand";

/** Un color de la paleta de un cliente. */
export type BrandColor = { hex: string; name: string };

/**
 * El kit de voz de un cliente, a mano (sin IA): tono, palabras propias, qué evitar y frases de
 * referencia reales. Alimenta el autocompletado de Redacción (migracion-voz-marca.sql).
 */
export type VozMarca = {
  /** Cómo suena ("Cercano pero sin informalismos", "Siempre en voz activa"). */
  tono?: string;
  /** Palabras o giros propios del cliente. */
  vocabulario?: string[];
  /** Palabras o giros a evitar. */
  evitar?: string[];
  /** Frases o copys de referencia, tal cual se usaron: son la base del autocompletado. */
  frases?: string[];
};

/** Los formatos de archivo que se reconocen en un logo (ver lib/clients/logos.ts). */
export type LogoFormat = "svg" | "ai" | "eps" | "pdf" | "png" | "jpg" | "webp" | "gif";

/** Un archivo de un logo. El mismo logo suele venir en varios: SVG, PNG, PDF, AI… */
export type LogoFile = {
  format: LogoFormat;
  /** Ruta en el bucket logos. */
  path: string;
  url: string;
  /** El nombre con el que se subió. */
  name: string;
  /** En bytes. */
  size: number;
  /** Ancho y alto en px, si es una imagen con medida propia (un SVG no la tiene). */
  w?: number;
  h?: number;
};

/** Una versión del logo de un cliente (horizontal, isotipo, negativo…) con sus archivos. */
export type BrandLogo = {
  id: string;
  name: string;
  /** El grupo donde está (LogoGroup.id); null: sin grupo. */
  group: string | null;
  /** Sobre qué fondo se ve: un logo en negativo no se ve sobre papel. */
  bg: LogoBg;
  files: LogoFile[];
};

/** Un grupo de logos de un cliente ("Principal", "Isotipo", "Monocromo"). */
export type LogoGroup = { id: string; name: string };

/**
 * Un cliente (en la base, `brands`: en Tarjetas se llamaban marcas).
 * Lo de la ficha (logo, paleta, tipografías y notas) llega con
 * migracion-clientes.sql: sin ella esos campos no vienen.
 */
export type Brand = {
  id: string;
  name: string;
  /** El que lo identifica en las listas (el puntito de color). */
  color: string;
  created_at: string;
  logo_url?: string | null;
  logo_path?: string | null;
  /** Sobre qué fondo se ve bien el logo (uno blanco no se ve sobre papel). */
  logo_bg?: LogoBg;
  palette?: BrandColor[];
  /** Familias tipográficas ("Montserrat"): pueden estar subidas o no. */
  font_families?: string[];
  notes?: string;
  /** Sus cuentas de redes (migracion-redes.sql). */
  socials?: BrandSocial[];
  /** Si el logo es la foto de perfil de una de sus cuentas, cuál (ver socialKey). */
  logo_from?: string | null;
  /** Su kit de voz (migracion-voz-marca.sql). */
  voz_marca?: VozMarca;
  /**
   * Todos sus logos, con sus formatos (migracion-logos.sql). El de arriba (logo_url) es su cara
   * en la app; puede ser uno de estos.
   */
  logos?: BrandLogo[];
  /** Los grupos de sus logos, en orden. */
  logo_groups?: LogoGroup[];
};
export type Category = { id: string; name: string; created_at: string };
/** Modelo de un cliente. Ej: Changan → Lumin, Hunter, Eado. */
export type Product = { id: string; name: string; brand_id: string; created_at: string };

export type FontFace = {
  id: string;
  family: string;      // Montserrat
  style_name: string;  // Light
  full_name: string;   // Montserrat Light  <- lo que ve Illustrator
  weight: number;      // 300
  italic: boolean;
  file_path: string;
  file_url: string;
  format: string;      // woff2 | woff | truetype | opentype
  is_variable: boolean; // un archivo con varios pesos adentro
  created_at: string;
};

export type Card = {
  id: string;
  title: string;
  content_html: string;
  content_text: string;
  category_id: string | null;
  brand_id: string | null;
  product_id: string | null;
  /** Quién la creó (con sesión iniciada). Lo completa la base; null en las anteriores al login. */
  owner_id?: string | null;
  created_at: string;
  updated_at: string;
};

export const WEIGHT_NAMES: Record<number, string> = {
  100: "Thin",
  200: "ExtraLight",
  300: "Light",
  400: "Regular",
  500: "Medium",
  600: "SemiBold",
  700: "Bold",
  800: "ExtraBold",
  900: "Black",
};

export const WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900];
