"use client";

import { createContext, useContext, type ReactNode } from "react";
import { EyeOff } from "lucide-react";
import { useStoredState } from "@/hooks/useStoredState";
import { cn } from "@/lib/utils";

/* ───────────── Ajustes del Inicio (en tu cuenta) ───────────── */

export type SeccionId = "marcas" | "dia" | "herramientas" | "seguir" | "estudio" | "recreo";

export const SECCIONES_INICIO: { id: SeccionId; label: string }[] = [
  { id: "marcas", label: "Tus marcas" },
  { id: "dia", label: "Tu día" },
  { id: "herramientas", label: "Tus herramientas" },
  { id: "seguir", label: "Seguí donde dejaste" },
  { id: "estudio", label: "El estudio" },
  { id: "recreo", label: "Un respiro" },
];

export type AjustesInicio = {
  /** Marcas que sumaste a mano (además de las que te designaron) y las que sacaste. */
  marcasFijadas: string[];
  marcasOcultas: string[];
  /** El orden de tus marcas (arrastrando); vacío: alfabético. */
  marcasOrden: string[];
  /** El orden de las herramientas que elegiste; null: por cuánto las usás. */
  herramientasOrden: string[] | null;
  herramientasOcultas: string[];
  /** Las secciones del Inicio que escondiste. */
  seccionesOcultas: SeccionId[];
  /** AAAA-MM-DD: el día que arrancan tus vacaciones (para la cuenta regresiva). */
  vacaciones: string | null;
};

const AJUSTES: AjustesInicio = {
  marcasFijadas: [],
  marcasOcultas: [],
  marcasOrden: [],
  herramientasOrden: null,
  herramientasOcultas: [],
  seccionesOcultas: [],
  vacaciones: null,
};

type Ctx = {
  ajustes: AjustesInicio;
  cambiar: (patch: Partial<AjustesInicio> | ((a: AjustesInicio) => Partial<AjustesInicio>)) => void;
  /** Modo "acomodar": se esconden y se mueven las cosas. */
  acomodando: boolean;
};

const AjustesCtx = createContext<Ctx>({ ajustes: AJUSTES, cambiar: () => {}, acomodando: false });

export function useAjustesInicioState() {
  const [ajustes, setAjustes, listo] = useStoredState<AjustesInicio>("inicio:ajustes", AJUSTES);
  const cambiar: Ctx["cambiar"] = (patch) => setAjustes((a) => ({ ...a, ...(typeof patch === "function" ? patch(a) : patch) }));
  return { ajustes: { ...AJUSTES, ...ajustes }, cambiar, listo };
}

export const AjustesProvider = AjustesCtx.Provider;
export const useAjustesInicio = () => useContext(AjustesCtx);

/* ───────────── Una sección ───────────── */

/**
 * El encabezado de una sección del Inicio: la etiqueta, a la derecha lo que sume cada una y, en modo
 * acomodar, el botón para esconderla.
 */
export function Seccion({
  id,
  titulo,
  extra,
  children,
  className,
}: {
  id: SeccionId;
  titulo: string;
  extra?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const { ajustes, cambiar, acomodando } = useAjustesInicio();
  if (ajustes.seccionesOcultas.includes(id)) return null;
  return (
    <section id={id} className={cn("scroll-mt-24", className)}>
      <div className="mb-3 flex min-h-8 flex-wrap items-center justify-between gap-2 border-t border-foreground/15 pt-4">
        <p className="site-label text-foreground/55">{titulo}</p>
        <div className="flex items-center gap-1.5">
          {extra}
          {acomodando && (
            <button
              type="button"
              onClick={() => cambiar((a) => ({ seccionesOcultas: [...a.seccionesOcultas, id] }))}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border bg-card px-3 text-[12.5px] font-medium transition-colors hover:border-foreground/30"
            >
              <EyeOff className="h-3.5 w-3.5" /> Esconder
            </button>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}

/** La caja de siempre del Inicio: papel, borde fino y redondeada. */
export const CAJA = "rounded-2xl border border-foreground/[0.09] bg-card shadow-[0_1px_0_hsl(240_12%_5%/0.03)]";

/** Un botón chico redondeado, para acciones dentro de una caja. */
export const BOTON_CHICO =
  "inline-flex h-8 items-center gap-1.5 rounded-full border border-foreground/[0.12] bg-card px-3 text-[12.5px] font-medium transition-colors hover:border-foreground/30 disabled:opacity-50";

/* ───────────── Tiempo ───────────── */

/** "hace 5 min", "hace 2 h", "ayer", "hace 3 días", "el 12 nov". */
export function hace(iso: string | null | undefined, ahora = Date.now()) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  const min = Math.round((ahora - t) / 60_000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  if (d === 1) return "ayer";
  if (d < 7) return `hace ${d} días`;
  return `el ${new Date(t).toLocaleDateString("es-UY", { day: "numeric", month: "short" }).replace(".", "")}`;
}

/** "1,2 GB", "340 MB". */
export function pesoLegible(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toLocaleString("es-UY", { maximumFractionDigits: 1 })} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2).toLocaleString("es-UY")} MB`;
  return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString("es-UY")} KB`;
}

/** El primer nombre: "Facu Machado" → "Facu". */
export const primerNombre = (n: string | null | undefined) => n?.trim().split(/\s+/)[0] ?? "";
