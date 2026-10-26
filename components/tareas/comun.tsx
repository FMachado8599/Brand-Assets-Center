"use client";

import { usePathname, useRouter } from "next/navigation";
import { Columns3, ListTodo, RefreshCw, Users } from "lucide-react";
import { BarSegmented } from "@/components/shell/ContextBar";
import { initials } from "@/lib/clients/color";
import { cn } from "@/lib/utils";

/** Las pestañas del Board, en la barra de arriba. */
const PESTANAS = [
  { value: "/board", label: "Mis tareas", icon: ListTodo },
  { value: "/board/tablero", label: "Tablero", icon: Columns3 },
  { value: "/board/equipo", label: "Equipo", icon: Users },
  { value: "/board/basecamp", label: "Basecamp", icon: RefreshCw },
] as const;

type Pestana = (typeof PESTANAS)[number]["value"];

export function BoardNav() {
  const router = useRouter();
  const pathname = usePathname();
  const actual = (PESTANAS.find((p) => p.value !== "/board" && pathname.startsWith(p.value))?.value ?? "/board") as Pestana;
  return (
    <BarSegmented<Pestana>
      label="Secciones del Board"
      value={actual}
      onChange={(v) => router.push(v)}
      options={PESTANAS.map((p) => ({ ...p }))}
    />
  );
}

export function hace(iso: string | null | undefined) {
  if (!iso) return "nunca";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  return new Date(iso).toLocaleDateString("es-UY", { day: "numeric", month: "short" });
}

export function BasecampMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn("h-4 w-4 shrink-0", className)}>
      <circle cx="12" cy="12" r="10" fill="#1d2d35" />
      <path d="M5.5 15.2c1.7-2.6 3.4-4.4 4.8-4.4 1.5 0 1.9 2 3.3 2 1 0 2.3-1.3 4.9-4.6" fill="none" stroke="#ffd100" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

/** La foto de Basecamp de una persona, o sus iniciales si no tiene. */
export function Avatar({ nombre, url, className }: { nombre: string; url?: string | null; className?: string }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" title={nombre} className={cn("h-7 w-7 shrink-0 rounded-full bg-secondary object-cover", className)} />;
  }
  return (
    <span
      title={nombre}
      className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full bg-secondary text-[10px] font-semibold text-muted-foreground", className)}
    >
      {initials(nombre)}
    </span>
  );
}
