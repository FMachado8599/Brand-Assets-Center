"use client";

import { AlertCircle, Loader2, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Piezas que comparten las librerías: el aviso de configuración, los errores y "cargar más". */

export function MissingKey({ env, children }: { env: string; children?: React.ReactNode }) {
  return (
    <div className="mx-auto mb-6 max-w-3xl rounded-2xl border border-destructive/40 bg-card p-4 text-sm">
      <Badge className="mb-2 border-destructive text-destructive">Falta configurar</Badge>
      <p className="text-muted-foreground">
        Agregá <code className="rounded bg-secondary px-1">{env}</code> en las variables de entorno y reiniciá el servidor.{" "}
        {children}
      </p>
    </div>
  );
}

export function SearchError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mx-auto my-6 flex max-w-xl flex-col items-center gap-3 rounded-2xl border bg-card p-5 text-center text-sm">
      <p className="flex items-start gap-2 text-destructive">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        {message}
      </p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RotateCcw /> Reintentar
      </Button>
    </div>
  );
}

export function MoreButton({ loading, onClick, label = "Cargar más" }: { loading: boolean; onClick: () => void; label?: string }) {
  return (
    <div className="mt-8 flex justify-center">
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className="flex h-10 items-center gap-2 rounded-full border bg-card px-5 text-sm font-medium shadow-sm transition hover:bg-secondary disabled:cursor-wait disabled:opacity-70"
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {loading ? "Cargando…" : label}
      </button>
    </div>
  );
}

/** Lo que se ve mientras llega la primera página. */
export function Loading({ className }: { className?: string }) {
  return (
    <p className={cn("flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground", className)}>
      <Loader2 className="h-4 w-4 animate-spin" /> Buscando…
    </p>
  );
}

/** El cuadriculado que muestra la transparencia (stickers, íconos). */
export const CHECKER: React.CSSProperties = {
  backgroundColor: "#ffffff",
  backgroundImage: "conic-gradient(#ece9e1 25%, transparent 0 50%, #ece9e1 0 75%, transparent 0)",
  backgroundSize: "16px 16px",
};
