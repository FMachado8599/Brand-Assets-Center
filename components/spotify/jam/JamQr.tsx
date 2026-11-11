"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { codigoQR } from "@/lib/qr";
import { cn } from "@/lib/utils";
import { apagado, relieve, resplandor, vidrio } from "./estilo";

/** Dibuja el código QR como un solo path (un cuadradito por módulo oscuro). */
function QR({ texto, className }: { texto: string; className?: string }) {
  const m = useMemo(() => codigoQR(texto), [texto]);
  if (!m) return <p className={cn("text-xs", apagado)}>El link es demasiado largo para un QR.</p>;
  const margen = 3;
  const lado = m.length + margen * 2;
  let d = "";
  m.forEach((fila, y) => fila.forEach((oscuro, x) => oscuro && (d += `M${x + margen} ${y + margen}h1v1h-1z`)));
  return (
    // Módulos oscuros sobre blanco: es lo que mejor leen las cámaras.
    <svg viewBox={`0 0 ${lado} ${lado}`} className={cn("rounded-2xl bg-white", className)} shapeRendering="crispEdges" role="img" aria-label="Código QR para unirse al Jam">
      <path d={d} fill="#121212" />
    </svg>
  );
}

/** Tarjeta aparte con el QR del Jam, para unirse desde el celular, y el link para copiar. */
export function JamQr({ link, esquina, className }: { link: string | null; esquina?: ReactNode; className?: string }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      /* sin permiso para copiar: el link igual está a la vista */
    }
  };

  return (
    <section aria-label="Unirse al Jam con el celular" className={cn(vidrio, "p-4", className)}>
      <span aria-hidden className={cn(resplandor, "-top-10 left-1/2 h-28 w-2/3 -translate-x-1/2 bg-[#1ed760]/20")} />
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#1ed760]">Unite desde el celular</p>
          <p className={cn("mt-1 text-xs", apagado)}>Escaneá con la cámara: se abre el Jam en Spotify.</p>
        </div>
        {esquina}
      </div>
      {link ? (
        <>
          <div className="rounded-3xl bg-white p-2 shadow-[0_0_40px_-8px_rgba(30,215,96,0.55)]">
            <QR texto={link} className="block aspect-square w-full" />
          </div>
          <div className="mt-3 flex items-center gap-2">
            <p className={cn("min-w-0 flex-1 truncate text-xs", apagado)} title={link}>
              {link.replace(/^https:\/\//, "")}
            </p>
            <button type="button" onClick={copiar} className={cn(relieve, "h-9 w-9")} aria-label={copiado ? "Link copiado" : "Copiar el link del Jam"}>
              {copiado ? <Check className="h-4 w-4 text-[#1ed760]" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        </>
      ) : (
        <p className={cn("rounded-2xl bg-black/30 p-4 text-sm", apagado)}>
          El DJ todavía no pegó el link del Jam (en /spotify, desde Spotify → Jam → Invitar → Copiar link).
        </p>
      )}
    </section>
  );
}
