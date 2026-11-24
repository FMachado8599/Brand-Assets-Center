"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { YoutubeStatus } from "@/lib/downloads/types";
import { PlatformIcon } from "./PlatformIcon";

/** Mientras YouTube no está, se vuelve a preguntar cada tanto: el aviso se va solo cuando prenden la PC. */
const RECHECK_MS = 60_000;

/**
 * Si el servicio de YouTube (la PC de la oficina) está prendido. Se pregunta al abrir la página, al volver
 * a la pestaña y, mientras está apagado, cada minuto. null mientras no se sabe (no se muestra nada).
 * `report` deja que una fila de YouTube actualice lo que se sabe sin esperar la próxima pregunta.
 */
export function useYoutubeStatus() {
  const [status, setStatus] = useState<YoutubeStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const inFlight = useRef(false);

  const check = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setChecking(true);
    try {
      const res = await fetch("/api/descargas/youtube/estado", { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as YoutubeStatus | null;
      if (res.ok && data && typeof data.disponible === "boolean") setStatus(data);
    } catch {
      /* sin conexión: queda lo que se sabía */
    } finally {
      inFlight.current = false;
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    check();
    const onVisible = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [check]);

  const off = status?.disponible === false;
  useEffect(() => {
    if (!off) return;
    const id = setInterval(() => document.visibilityState === "visible" && check(), RECHECK_MS);
    return () => clearInterval(id);
  }, [off, check]);

  return { status, checking, check, report: setStatus };
}

/** El aviso arriba de la lista cuando YouTube no se puede usar. Instagram y Pinterest no dependen de la PC. */
export function YoutubeNotice({ status, checking, onCheck }: { status: YoutubeStatus | null; checking: boolean; onCheck: () => void }) {
  if (!status || status.disponible) return null;
  // Sin strictNullChecks, TypeScript no achica la unión por `disponible`: se dice a mano.
  const off = status as Extract<YoutubeStatus, { disponible: false }>;
  const unconfigured = off.motivo === "sin-configurar";
  return (
    <div
      role="status"
      className="mb-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-amber-900"
    >
      <PlatformIcon platform="youtube" className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{unconfigured ? "YouTube no está configurado" : "YouTube no está disponible ahora"}</p>
        <p className="mt-0.5 text-xs text-amber-900/80" title={off.mensaje}>
          {unconfigured
            ? off.mensaje
            : "Los videos de YouTube los baja el servicio de la PC de la oficina, y ahora está apagado. Cuando lo prendan, este aviso se va solo."}{" "}
          Instagram y Pinterest andan igual.
        </p>
      </div>
      {!unconfigured && (
        <Button variant="outline" size="sm" onClick={onCheck} disabled={checking} className="shrink-0 border-amber-300 bg-white/70">
          {checking ? <Loader2 className="animate-spin" /> : <RotateCcw />} Revisar
        </Button>
      )}
    </div>
  );
}
