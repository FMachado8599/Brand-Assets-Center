import {
  ArrowDownToLine,
  Briefcase,
  Disc3,
  Film,
  Gamepad2,
  House,
  ImagePlay,
  Library,
  Megaphone,
  PenLine,
  RefreshCw,
  Shapes,
  Smile,
  StickyNote,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";

export type AppModule = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Aparece en la navegación pero todavía no tiene página. */
  soon?: boolean;
  /** Las librerías (emojis, GIFs, íconos) van juntas en su propio grupo de la sidebar. */
  group?: "librerias";
};

/**
 * Registro único de módulos: de acá salen la sidebar, Inicio y el indicador de módulo activo. Las librerías
 * van donde estaba Emojis: en Inicio ese lugar es la tarjeta de Librerías (TOOLS).
 */
export const MODULES: AppModule[] = [
  { href: "/", label: "Inicio", description: "Todas las herramientas", icon: House },
  { href: "/tarjetas", label: "Tarjetas", description: "Textos con tipografía, para pegar", icon: StickyNote },
  { href: "/library/emojis", label: "Emojis", description: "Emojis de Apple en PNG", icon: Smile, group: "librerias" },
  { href: "/library/gifs", label: "GIFs", description: "GIFs y stickers de GIPHY, para bajar o pegar", icon: ImagePlay, group: "librerias" },
  { href: "/library/iconos", label: "Íconos", description: "Íconos de Magnific en SVG y PNG", icon: Shapes, group: "librerias" },
  { href: "/gif", label: "GIF", description: "Banners animados desde frames", icon: Film },
  { href: "/conversor", label: "Conversor", description: "Convertí y comprimí archivos", icon: RefreshCw },
  { href: "/redaccion", label: "Redacción", description: "Textos con formato, emojis y hashtags", icon: PenLine },
  { href: "/clientes", label: "Clientes", description: "Logo, colores, tipografías y todo lo de cada uno", icon: Briefcase },
  { href: "/descargas", label: "Descargas", description: "Videos y posteos de Instagram y Pinterest", icon: ArrowDownToLine },
  { href: "/ads", label: "Ads", description: "Tu anuncio como sale en Reels, con lo que tapa", icon: Megaphone },
  { href: "/retoque", label: "Retoque", description: "Quitale el fondo a una imagen con Magnific", icon: WandSparkles },
  { href: "/rest", label: "Rest", description: "Un recreo: juegos cortos con ranking del estudio", icon: Gamepad2 },
  { href: "/spotify", label: "Spotify", description: "El Jam del estudio: qué suena y sumá canciones", icon: Disc3 },
];

/** Las librerías, en el orden en que aparecen en la sidebar y en la barra. */
export const LIBRARIES = MODULES.filter((m) => m.group === "librerias");

/** La puerta de las librerías: /library abre la última que usaste y, en Inicio, es una sola tarjeta. */
export const LIBRARY_HUB: AppModule = {
  href: "/library",
  label: "Librerías",
  description: "Emojis, GIFs e íconos para copiar o bajar",
  icon: Library,
};

/** Lo que muestra Inicio: las herramientas y, en el lugar de la primera librería, la tarjeta de Librerías. */
export const TOOLS: AppModule[] = MODULES.flatMap((m) => {
  if (m.href === "/" || m.soon) return [];
  if (m.group !== "librerias") return [m];
  return m === LIBRARIES[0] ? [LIBRARY_HUB] : [];
});

/** La última herramienta abierta en este navegador: el panel de Inicio la marca. */
export const LAST_MODULE_KEY = "herramientas:ultima";

/** La última librería abierta en este navegador: es la que abre /library. */
export const LAST_LIBRARY_KEY = "library:ultima";

export function activeModule(pathname: string): AppModule {
  return (
    MODULES.find((m) => !m.soon && (m.href === "/" ? pathname === "/" : pathname.startsWith(m.href))) ??
    (pathname.startsWith(LIBRARY_HUB.href) ? LIBRARY_HUB : MODULES[0])
  );
}
