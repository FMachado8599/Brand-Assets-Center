import { Film, House, PenLine, RefreshCw, Smile, StickyNote, type LucideIcon } from "lucide-react";

export type AppModule = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Aparece en la navegación pero todavía no tiene página. */
  soon?: boolean;
};

/** Registro único de módulos: de acá salen la sidebar y el indicador de módulo activo. */
export const MODULES: AppModule[] = [
  { href: "/", label: "Inicio", description: "Todas las herramientas", icon: House },
  { href: "/tarjetas", label: "Tarjetas", description: "Textos con tipografía, para pegar", icon: StickyNote },
  { href: "/emojis", label: "Emojis", description: "Emojis de Apple en PNG", icon: Smile },
  { href: "/gif", label: "GIF", description: "Banners animados desde frames", icon: Film },
  { href: "/conversor", label: "Conversor", description: "Convertí y comprimí archivos", icon: RefreshCw },
  { href: "/redaccion", label: "Redacción", description: "Textos con formato, emojis y hashtags", icon: PenLine },
];

export function activeModule(pathname: string): AppModule {
  return (
    MODULES.find((m) => !m.soon && (m.href === "/" ? pathname === "/" : pathname.startsWith(m.href))) ??
    MODULES[0]
  );
}
