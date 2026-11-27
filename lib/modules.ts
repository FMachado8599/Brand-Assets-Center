import {
  ArrowDownToLine,
  Briefcase,
  CalendarDays,
  Disc3,
  Film,
  Gamepad2,
  HeartHandshake,
  House,
  Mail,
  ImagePlay,
  Library,
  Megaphone,
  Network,
  Plug,
  ShieldCheck,
  Slack,
  UserRound,
  PenLine,
  Presentation,
  RefreshCw,
  Shapes,
  Smile,
  SquareKanban,
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
  /** En qué sección de la sidebar va (Inicio no tiene: va arriba de todo). */
  seccion?: Seccion;
};

/** Las secciones de la sidebar, en orden: lo del día a día primero, el recreo al final. */
export type Seccion = "trabajo" | "crear" | "archivos" | "librerias" | "recreo";
export const SECCIONES: { id: Seccion; label: string; descripcion: string }[] = [
  { id: "trabajo", label: "Trabajo", descripcion: "Las tareas, el calendario, las presentaciones y los clientes" },
  { id: "crear", label: "Crear", descripcion: "Textos, piezas y anuncios" },
  { id: "archivos", label: "Archivos", descripcion: "Bajar, convertir y retocar" },
  { id: "librerias", label: "Librerías", descripcion: "Emojis, GIFs e íconos" },
  { id: "recreo", label: "Recreo", descripcion: "Juegos y música" },
];

/**
 * Registro único de módulos: de acá salen la sidebar, Inicio y el indicador de módulo activo. Las librerías
 * van donde estaba Emojis: en Inicio ese lugar es la tarjeta de Librerías (TOOLS).
 */
export const MODULES: AppModule[] = [
  { href: "/", label: "Inicio", description: "Todas las herramientas", icon: House },
  { href: "/tarjetas", label: "Tarjetas", description: "Textos con tipografía, para pegar", icon: StickyNote, seccion: "crear" },
  { href: "/library/emojis", label: "Emojis", description: "Emojis de Apple en PNG", icon: Smile, group: "librerias", seccion: "librerias" },
  { href: "/library/gifs", label: "GIFs", description: "GIFs y stickers de GIPHY, para bajar o pegar", icon: ImagePlay, group: "librerias", seccion: "librerias" },
  { href: "/library/iconos", label: "Íconos", description: "Íconos de Magnific en SVG y PNG", icon: Shapes, group: "librerias", seccion: "librerias" },
  { href: "/gif", label: "GIF", description: "Banners animados desde frames", icon: Film, seccion: "crear" },
  { href: "/conversor", label: "Conversor", description: "Convertí y comprimí archivos", icon: RefreshCw, seccion: "archivos" },
  { href: "/redaccion", label: "Redacción", description: "Textos con formato, emojis y hashtags", icon: PenLine, seccion: "crear" },
  { href: "/clientes", label: "Clientes", description: "Logo, colores, tipografías y todo lo de cada uno", icon: Briefcase, seccion: "trabajo" },
  { href: "/influencers", label: "Influencers", description: "Quién trabajó con cada cliente y cómo rindió", icon: HeartHandshake, seccion: "trabajo" },
  { href: "/correo", label: "Correo", description: "Tu casilla @camaratbwa.com: leé, respondé y mandá", icon: Mail, seccion: "trabajo" },
  { href: "/board", label: "Status", description: "Qué está haciendo cada uno: tus tareas y las del equipo", icon: SquareKanban, seccion: "trabajo" },
  { href: "/calendario", label: "Calendario", description: "Entregas, reuniones, cumpleaños y feriados del estudio", icon: CalendarDays, seccion: "trabajo" },
  { href: "/presentaciones", label: "Presentaciones", description: "El material de cada tarea, listo para el cliente: planis, ads, programática…", icon: Presentation, seccion: "trabajo" },
  { href: "/descargas", label: "Descargas", description: "Videos y posteos de Instagram y Pinterest", icon: ArrowDownToLine, seccion: "archivos" },
  { href: "/ads", label: "Ads", description: "Tu anuncio como sale en Reels, con lo que tapa", icon: Megaphone, seccion: "crear" },
  { href: "/retoque", label: "Retoque", description: "Quitale el fondo a una imagen con Magnific", icon: WandSparkles, seccion: "archivos" },
  { href: "/rest", label: "Rest", description: "Un recreo: juegos cortos con ranking del estudio", icon: Gamepad2, seccion: "recreo" },
  { href: "/spotify", label: "Spotify", description: "El Jam del estudio: qué suena y sumá canciones", icon: Disc3, seccion: "recreo" },
];

/** La sidebar: cada sección con sus módulos, en el orden de SECCIONES (y adentro, el de ORDEN_NAV). */
const ORDEN_NAV = ["/board", "/correo", "/calendario", "/presentaciones", "/clientes", "/influencers", "/redaccion", "/tarjetas", "/ads", "/gif", "/descargas", "/conversor", "/retoque"];
const posicion = (m: AppModule) => (ORDEN_NAV.includes(m.href) ? ORDEN_NAV.indexOf(m.href) : ORDEN_NAV.length + MODULES.indexOf(m));
export const NAV = SECCIONES.map((s) => ({
  ...s,
  modulos: MODULES.filter((m) => m.seccion === s.id && !m.soon).sort((a, b) => posicion(a) - posicion(b)),
}));

/** Las librerías, en el orden en que aparecen en la sidebar y en la barra. */
export const LIBRARIES = MODULES.filter((m) => m.group === "librerias");

/** La puerta de las librerías: /library abre la última que usaste y, en Inicio, es una sola tarjeta. */
export const LIBRARY_HUB: AppModule = {
  href: "/library",
  label: "Librerías",
  description: "Emojis, GIFs e íconos para copiar o bajar",
  icon: Library,
};

/**
 * Los ajustes del estudio: no son herramientas, son la configuración, y solo los ven los admins de la
 * app. Van aparte, abajo de todo en la sidebar (en amarillo), y no aparecen en Inicio.
 */
export const AJUSTES_LABEL = "Ajustes";
export const AJUSTES: AppModule[] = [
  { href: "/board/organizacion", label: "Organización", description: "Organigrama, puestos, hubs y marcas de cada uno", icon: Network },
  { href: "/board/basecamp", label: "Basecamp", description: "La cuenta del estudio y la sincronización", icon: Plug },
  { href: "/board/slack", label: "Slack", description: "El bot del estudio: canales por marca y avisos", icon: Slack },
  { href: "/board/accesos", label: "Accesos", description: "Quién puede entrar: dominios, mails y contraseñas", icon: ShieldCheck },
];

/** Tu perfil (/perfil): no es una herramienta de la sidebar, se abre desde la cuenta. */
export const PERFIL: AppModule = {
  href: "/perfil",
  label: "Perfil",
  description: "Tu foto, tu estado y lo tuyo en el estudio",
  icon: UserRound,
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
    // Los ajustes viven adentro de /board: se buscan antes, así no los toma Status.
    AJUSTES.find((m) => pathname.startsWith(m.href)) ??
    MODULES.find((m) => !m.soon && (m.href === "/" ? pathname === "/" : pathname.startsWith(m.href))) ??
    (pathname.startsWith(LIBRARY_HUB.href) ? LIBRARY_HUB : pathname.startsWith(PERFIL.href) ? PERFIL : MODULES[0])
  );
}
