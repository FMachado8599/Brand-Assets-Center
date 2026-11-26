import type { Plataforma } from "@/lib/plani/types";
import { cn } from "@/lib/utils";

/** Los logos de las redes, de un color (currentColor), para botones y etiquetas. */
const PATHS: Record<Plataforma, JSX.Element> = {
  instagram: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="17.4" cy="6.6" r="1.3" fill="currentColor" />
    </>
  ),
  facebook: (
    <path
      fill="currentColor"
      d="M13.5 21v-7.4h2.5l.4-2.9h-2.9V8.9c0-.8.2-1.4 1.4-1.4h1.6V4.9c-.3 0-1.2-.1-2.3-.1-2.3 0-3.8 1.4-3.8 3.9v2.1H7.8v2.9h2.6V21h3.1Z"
    />
  ),
  tiktok: (
    <path
      fill="currentColor"
      d="M16.6 3c.3 2.2 1.6 3.6 3.9 3.8v2.6c-1.4.1-2.6-.3-3.9-1.1v5.3c0 6.7-7.3 8.8-10.2 4-1.9-3.1-.7-8.5 5.5-8.7v2.8c-.5.1-1 .2-1.4.4-1.4.5-2.2 1.3-2 2.9.4 2.9 5.7 3.8 5.3-1.9V3h2.8Z"
    />
  ),
  linkedin: (
    <path
      fill="currentColor"
      d="M5.2 8.6h3.1V19H5.2V8.6Zm1.6-5a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6ZM10.3 8.6h3v1.4c.4-.8 1.4-1.7 3-1.7 3.2 0 3.8 2.1 3.8 4.8V19H17v-5.2c0-1.2 0-2.8-1.7-2.8s-2 1.3-2 2.7V19h-3.1V8.6Z"
    />
  ),
  youtube: (
    <path
      fill="currentColor"
      d="M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2C2 8.8 2 12 2 12s0 3.2.4 4.8a2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8c.4-1.6.4-4.8.4-4.8s0-3.2-.4-4.8ZM10 15V9l5.2 3L10 15Z"
    />
  ),
  x: (
    <path
      fill="currentColor"
      d="M17.6 3.5h3l-6.6 7.5 7.7 10.2h-6l-4.7-6.2-5.4 6.2h-3l7-8L2.2 3.5h6.2l4.3 5.7 4.9-5.7Zm-1 15.9h1.7L7.5 5.2H5.7l10.9 14.2Z"
    />
  ),
};

export function PlatformIcon({ platform, className }: { platform: Plataforma; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn("h-4 w-4 shrink-0", className)}>
      {PATHS[platform]}
    </svg>
  );
}
