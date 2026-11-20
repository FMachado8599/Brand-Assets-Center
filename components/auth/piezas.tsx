"use client";

import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

/** El largo mínimo (el servidor lo vuelve a revisar: esto es solo para avisar antes). */
export const LARGO_MINIMO = 12;

const campo =
  "h-11 w-full rounded-2xl border bg-card px-4 text-[15px] shadow-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-foreground/40 disabled:opacity-60";

export function Campo({ label, hint, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[13px] font-medium">{label}</span>
      <input {...props} className={cn(campo, className)} />
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

/** Una contraseña, con el ojito para verla. Nunca se guarda en el navegador más allá del formulario. */
export function CampoContrasena({ label, hint, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label: string; hint?: ReactNode }) {
  const [ver, setVer] = useState(false);
  const id = useId();
  // El ojito va fuera del <label>: si no, el nombre del campo para un lector de pantalla incluiría el botón.
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-[13px] font-medium">
        {label}
      </label>
      <span className="relative block">
        <input {...props} id={id} type={ver ? "text" : "password"} spellCheck={false} autoCapitalize="none" className={cn(campo, "pr-11")} />
        <button
          type="button"
          onClick={() => setVer((v) => !v)}
          aria-label={ver ? "Ocultar la contraseña" : "Ver la contraseña"}
          className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          {ver ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </span>
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

/** Pide a una de las rutas de /api/auth/contrasena y devuelve su respuesta (o el error en palabras). */
export async function pedirAuth<T extends Record<string, unknown>>(ruta: string, body?: Record<string, unknown>): Promise<T & { error?: string }> {
  try {
    const res = await fetch(`/api/auth/contrasena/${ruta}`, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok && !data.error) return { ...data, error: "No se pudo completar. Probá de nuevo." };
    return data;
  } catch {
    return { error: "No hay conexión. Probá de nuevo." } as T & { error?: string };
  }
}

export const boton =
  "inline-flex h-11 w-full items-center justify-center gap-2 rounded-full text-sm font-semibold transition disabled:pointer-events-none disabled:opacity-50";
