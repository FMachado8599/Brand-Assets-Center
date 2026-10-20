import { AudioLines, Cloud, Film, ImageIcon, Monitor, Volume2, VolumeX, type LucideIcon } from "lucide-react";
import type { AudioMode, CoverMode, Destination } from "@/lib/downloads/types";
import { cn } from "@/lib/utils";

/** Una opción de cómo se guarda: se muestra con sus íconos y el nombre va en el tooltip y para lectores de pantalla. */
export type ModeOption<T extends string> = { value: T; label: string; icons: LucideIcon[] };

export const COVER_OPTIONS: ModeOption<CoverMode>[] = [
  { value: "video", label: "Video", icons: [Film] },
  { value: "ambos", label: "Video y portada", icons: [Film, ImageIcon] },
  { value: "portada", label: "Solo portada", icons: [ImageIcon] },
];

export const AUDIO_OPTIONS: ModeOption<AudioMode>[] = [
  { value: "con", label: "Con audio", icons: [Volume2] },
  { value: "sin", label: "Sin audio", icons: [VolumeX] },
  { value: "solo", label: "Solo audio", icons: [AudioLines] },
];

export const DESTINO_OPTIONS: ModeOption<Destination>[] = [
  { value: "compu", label: "En tu compu", icons: [Monitor] },
  { value: "ambos", label: "Compu y Drive", icons: [Monitor, Cloud] },
  { value: "drive", label: "Solo Drive", icons: [Cloud] },
];

export function optionOf<T extends string>(options: ModeOption<T>[], value: T) {
  return options.find((o) => o.value === value) ?? options[0];
}

/** Los íconos de una opción, juntos ("video y portada" son dos). Decorativos: el nombre va aparte. */
export function ModeIcons({ icons, className }: { icons: LucideIcon[]; className?: string }) {
  return (
    <span aria-hidden className="inline-flex shrink-0 items-center gap-0.5">
      {icons.map((Icon, i) => (
        <Icon key={i} className={cn("h-3.5 w-3.5", className)} />
      ))}
    </span>
  );
}
