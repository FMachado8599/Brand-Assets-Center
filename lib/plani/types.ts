/**
 * Presentaciones: los tipos de TypeScript tal como vienen de la base
 * (supabase/migracion-presentaciones.sql). En el código se siguen llamando "plani" (así empezó: la
 * planificación del mes), pero una presentación puede ser de cualquier tipo.
 * Las fechas de las piezas son "AAAA-MM-DD" (días de calendario, sin hora ni zona).
 */

/** El id de su tipo en presentacion_tipos ("planificacion", "leads", "programatica"…). */
export type PlaniTipo = string;

/** En qué etapa está la presentación entera. */
export type PlaniEstado = "redaccion" | "diseno" | "revision" | "cliente" | "programacion" | "lista";

import type { Placement } from "@/lib/ads/placements";

/** banner: programática y display (en los tipos con GIF), con su medida en ancho y alto. */
export type Formato = "post" | "carrusel" | "reel" | "historia" | "banner";

/** libre: la medida va en ancho y alto (los banners). */
export type Proporcion = "4:5" | "1:1" | "9:16" | "16:9" | "libre";

/** El anuncio de una pieza (en los tipos con ads): dónde sale, el botón y el título. */
export type Anuncio = { lugares?: Placement[]; cta?: string; titulo?: string };

export type Plataforma = "instagram" | "facebook" | "tiktok" | "linkedin" | "youtube" | "x";

/** Visto bueno de la agencia (revisión interna) y del cliente, por pieza. */
export type Aprobacion = "pendiente" | "aprobada" | "cambios";

/** Quién está mirando la plani: cada rol ve y edita lo suyo. */
export type Rol = "redaccion" | "diseno" | "cm";

export type Link = { id: string; url: string; label: string };

/** Un archivo del material final, guardado en el Drive del estudio. */
export type Medio = {
  id: string;
  drive_id: string;
  nombre: string;
  mime: string;
  tamano: number;
  ancho?: number | null;
  alto?: number | null;
  /**
   * final: imágenes o video, en orden (en un carrusel, una por slide) · portada: la tapa de un reel
   * · referencia: la inspiración que sube Redacción (no se entrega: el cliente no la ve).
   */
  rol: "final" | "portada" | "referencia";
};

export type StickerTipo = "link" | "encuesta" | "pregunta" | "cuenta" | "mencion" | "ubicacion" | "hashtag" | "slider" | "reaccion";

/**
 * Un sticker de historia. x e y son el centro, en % del ancho y el alto de la pieza; escala 1 es
 * el tamaño normal. texto/opciones según el tipo (la pregunta, las opciones de una encuesta…).
 */
export type Sticker = {
  id: string;
  tipo: StickerTipo;
  x: number;
  y: number;
  escala: number;
  rotacion?: number;
  texto?: string;
  opciones?: string[];
  url?: string;
  fecha?: string;
  /** El emoji (carácter) y su id en el catálogo de Emojis, para dibujarlo con la imagen de Apple. */
  emoji?: string;
  emojiId?: string;
};

export type Slide = { instruccion: string };

export type Pieza = {
  id: string;
  presentacion_id: string;
  fecha: string;
  hora: string | null;
  orden: number;
  formato: Formato;
  proporcion: Proporcion;
  plataformas: Plataforma[];
  titulo: string;
  /**
   * El copy, uno solo para todas las redes: `todas` es el texto tal cual se publica (las negritas
   * en Unicode, como sale de Redacción) y `html` el mismo con formato, para seguir editándolo.
   * Las planis de antes pueden traer uno por red (instagram, tiktok…).
   */
  copys: Partial<Record<Plataforma, string>> & { todas?: string; html?: string };
  /** Banners: la medida en px (300×250, 728×90…). */
  ancho: number | null;
  alto: number | null;
  anuncio: Anuncio;
  instrucciones: string;
  slides: Slide[];
  referencias: Link[];
  assets: Link[];
  medios: Medio[];
  stickers: Sticker[];
  adapta_de: string | null;
  estado_agencia: Aprobacion;
  estado_cliente: Aprobacion;
  programada: boolean;
  created_at: string;
  updated_at: string;
};

export type Plani = {
  id: string;
  brand_id: string;
  titulo: string;
  tipo: PlaniTipo;
  anio: number;
  mes: number;
  estado: PlaniEstado;
  bc_tarea_id: number | null;
  drive_carpeta_id: string | null;
  notas: string;
  /** Compartida con el cliente: con el link (/p/<share_token>) la ve, comenta y aprueba. */
  compartida?: boolean;
  share_token?: string | null;
  creada_por: string | null;
  created_at: string;
  updated_at: string;
};

/** Lo que llega en la lista: la plani y un resumen de sus piezas. */
export type PlaniResumen = Plani & {
  presentacion_piezas: Pick<Pieza, "id" | "formato" | "fecha" | "programada" | "estado_agencia" | "estado_cliente" | "medios">[];
};

export type PiezaPatch = Partial<Omit<Pieza, "id" | "presentacion_id" | "created_at" | "updated_at">>;
export type PlaniPatch = Partial<
  Pick<Plani, "titulo" | "tipo" | "anio" | "mes" | "estado" | "bc_tarea_id" | "drive_carpeta_id" | "notas" | "brand_id" | "compartida" | "share_token">
>;

export type Comentario = {
  id: string;
  presentacion_id: string;
  pieza_id: string | null;
  autor_id: string | null;
  autor_nombre: string;
  texto: string;
  interno: boolean;
  resuelto: boolean;
  created_at: string;
  /** En la página del cliente: lo escribió el cliente (y no alguien del estudio). */
  del_cliente?: boolean;
};
