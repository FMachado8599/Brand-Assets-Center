import type { Platform } from "@/lib/downloads/types";
import { cn } from "@/lib/utils";

export const PLATFORM_NAMES: Record<Platform, string> = { instagram: "Instagram", pinterest: "Pinterest", youtube: "YouTube" };

/**
 * El logo de cada plataforma, de un solo color (el del texto). Es decorativo: quien lo use pone el nombre
 * al lado o en texto para lectores de pantalla.
 */
export function PlatformIcon({ platform, className }: { platform: Platform; className?: string }) {
  const common = { viewBox: "0 0 24 24", "aria-hidden": true, focusable: false, className: cn("h-4 w-4 shrink-0", className) } as const;
  if (platform === "instagram") {
    return (
      <svg {...common} fill="none" stroke="currentColor" strokeWidth={2.2}>
        <rect x="2.6" y="2.6" width="18.8" height="18.8" rx="5.4" />
        <circle cx="12" cy="12" r="4.3" />
        <circle cx="17.5" cy="6.5" r="1.35" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (platform === "youtube") {
    return (
      <svg {...common} fill="currentColor">
        <path d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.38.5A3.02 3.02 0 0 0 .5 6.19C0 8.07 0 12 0 12s0 3.93.5 5.81a3.02 3.02 0 0 0 2.12 2.14c1.87.5 9.38.5 9.38.5s7.5 0 9.38-.5a3.02 3.02 0 0 0 2.12-2.14C24 15.93 24 12 24 12s0-3.93-.5-5.81ZM9.55 15.57V8.43L15.82 12l-6.27 3.57Z" />
      </svg>
    );
  }
  return (
    <svg {...common} fill="currentColor">
      <path d="M12.02 0C5.4 0 .03 5.37.03 11.99c0 5.08 3.16 9.42 7.62 11.16-.1-.95-.2-2.4.04-3.44.22-.94 1.4-5.96 1.4-5.96s-.35-.72-.35-1.78c0-1.66.96-2.91 2.17-2.91 1.02 0 1.52.77 1.52 1.69 0 1.03-.66 2.57-.99 3.99-.29 1.2.6 2.17 1.77 2.17 2.13 0 3.77-2.25 3.77-5.49 0-2.86-2.06-4.87-5-4.87-3.41 0-5.41 2.56-5.41 5.2 0 1.03.4 2.14.89 2.74.1.12.11.23.08.35-.09.37-.29 1.2-.33 1.36-.05.22-.17.27-.4.16-1.5-.69-2.43-2.88-2.43-4.65 0-3.77 2.75-7.25 7.92-7.25 4.16 0 7.39 2.97 7.39 6.92 0 4.14-2.6 7.46-6.23 7.46-1.21 0-2.35-.63-2.76-1.38l-.75 2.85c-.27 1.04-1 2.35-1.5 3.15 1.12.34 2.31.53 3.55.53 6.6 0 11.99-5.36 11.99-11.99C24 5.39 18.62.03 12.02.03V0Z" />
    </svg>
  );
}
