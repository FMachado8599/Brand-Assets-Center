"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Loader2, Plus, Search, X } from "lucide-react";
import { toast } from "@/components/ui/toaster";
import { useDebounced } from "@/hooks/useDebounced";
import { yaEsta } from "@/lib/spotify/catalogo";
import type { CancionSpotify, EstadoJam } from "@/lib/spotify/types";
import { cn } from "@/lib/utils";
import { apagado, campo, foco, minutos, relieve, resplandor, vidrio } from "./estilo";
import { Tapa } from "./piezas";

type Sumar = (c: CancionSpotify) => Promise<"ok" | "ya-esta" | string>;

/**
 * La cola del Jam con el buscador arriba de todo. Mientras se escribe, los resultados reemplazan a
 * la cola; los que ya están sonando o en la cola se marcan y no se pueden sumar de nuevo.
 */
export function JamCola({
  estado,
  sumar,
  autoFocus = false,
  esquina,
  className,
  listaClassName,
}: {
  estado: EstadoJam;
  sumar: Sumar;
  autoFocus?: boolean;
  esquina?: ReactNode;
  className?: string;
  listaClassName?: string;
}) {
  const [q, setQ] = useState("");
  const [buscada] = useDebounced(q.trim(), 350);
  const [resultados, setResultados] = useState<CancionSpotify[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) input.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (buscada.length < 2) {
      setResultados(null);
      return;
    }
    let vigente = true;
    setBuscando(true);
    fetch(`/api/spotify/buscar?q=${encodeURIComponent(buscada)}`)
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as { canciones?: CancionSpotify[]; error?: string };
        if (!res.ok) throw new Error(data.error ?? "No se pudo buscar");
        if (vigente) setResultados(data.canciones ?? []);
      })
      .catch((e: Error) => vigente && toast(e.message, "error"))
      .finally(() => vigente && setBuscando(false));
    return () => {
      vigente = false;
    };
  }, [buscada]);

  const enBusqueda = q.trim().length >= 2;

  return (
    <section aria-label="Cola del Jam" className={cn(vidrio, "flex min-h-0 flex-col p-4", className)}>
      <span aria-hidden className={cn(resplandor, "-right-10 -top-14 h-36 w-48 bg-[#1ed760]/15")} />
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7a7a7a]" aria-hidden />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && q) {
                e.stopPropagation();
                setQ("");
              }
            }}
            placeholder="Buscá una canción para sumar"
            aria-label="Buscar en Spotify para sumar al Jam"
            className={campo}
          />
          {buscando ? (
            <Loader2 className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7a7a7a] motion-safe:animate-spin" aria-hidden />
          ) : (
            q && (
              <button
                type="button"
                onClick={() => {
                  setQ("");
                  input.current?.focus();
                }}
                className={cn("absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-[#7a7a7a] hover:text-white", foco)}
                aria-label="Borrar la búsqueda"
              >
                <X className="h-4 w-4" />
              </button>
            )
          )}
        </div>
        {esquina}
      </div>

      <div className={cn("-mx-1 mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain px-1", listaClassName)}>
        {enBusqueda ? (
          resultados === null ? (
            <p className={cn("py-6 text-center text-sm", apagado)}>Buscando…</p>
          ) : resultados.length === 0 ? (
            <p className={cn("py-6 text-center text-sm", apagado)}>Sin resultados para «{q.trim()}».</p>
          ) : (
            <ul className="space-y-1">
              {resultados.map((c) => (
                <Resultado key={c.uri} cancion={c} enLaCola={yaEsta(c, estado)} sumar={sumar} />
              ))}
            </ul>
          )
        ) : (
          <>
            <p className="mb-2 flex items-baseline justify-between px-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[#b3b3b3]">
              A continuación
              {estado.siguientes.length > 0 && <span className="tabular-nums">{estado.siguientes.length}</span>}
            </p>
            {estado.siguientes.length === 0 ? (
              <p className={cn("rounded-2xl bg-black/25 px-4 py-6 text-center text-sm", apagado)}>
                La cola está vacía. Buscá arriba y sumá la primera.
              </p>
            ) : (
              <ol className="space-y-1">
                {estado.siguientes.map((c, i) => (
                  <li key={`${c.uri}-${i}`} className="flex items-center gap-3 rounded-2xl px-2 py-1.5">
                    <span className={cn("w-4 shrink-0 text-right text-xs tabular-nums", apagado)}>{i + 1}</span>
                    <Tapa src={c.portada} luz={false} className="h-10 w-10 rounded-lg" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{c.nombre}</span>
                      <span className={cn("block truncate text-xs", apagado)}>{c.artistas}</span>
                    </span>
                    <span className={cn("shrink-0 text-xs tabular-nums", apagado)}>{minutos(c.duracion)}</span>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function Resultado({ cancion: c, enLaCola, sumar }: { cancion: CancionSpotify; enLaCola: boolean; sumar: Sumar }) {
  const [estado, setEstado] = useState<"listo" | "sumando" | "sumada">("listo");
  const ya = enLaCola || estado === "sumada";

  const alSumar = async () => {
    setEstado("sumando");
    const r = await sumar(c);
    if (r === "ok") {
      setEstado("sumada");
      toast(`«${c.nombre}» sumada al Jam`);
    } else {
      setEstado(r === "ya-esta" ? "sumada" : "listo");
      toast(r === "ya-esta" ? "Esa canción ya está en la cola" : r, r === "ya-esta" ? "ok" : "error");
    }
  };

  return (
    <li className={cn("flex items-center gap-3 rounded-2xl px-2 py-1.5 transition-colors", ya ? "bg-[#1ed760]/[0.07]" : "hover:bg-white/5")}>
      <Tapa src={c.portada} luz={false} className="h-10 w-10 rounded-lg" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{c.nombre}</span>
        <span className={cn("block truncate text-xs", apagado)}>
          {c.disponible ? `${c.artistas} · ${c.album}` : "No se puede escuchar en el país del DJ"}
        </span>
      </span>
      {ya ? (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[#1ed760]/40 px-2.5 py-1 text-[11px] font-semibold text-[#1ed760]">
          <Check className="h-3.5 w-3.5" aria-hidden />
          {estado === "sumada" && !enLaCola ? "Sumada" : "Ya está"}
        </span>
      ) : (
        <button
          type="button"
          onClick={alSumar}
          disabled={estado === "sumando" || !c.disponible}
          className={cn(relieve, "h-9 w-9")}
          aria-label={`Sumar ${c.nombre}, de ${c.artistas}, al Jam`}
          title="Sumar al Jam"
        >
          {estado === "sumando" ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" /> : <Plus className="h-4 w-4" />}
        </button>
      )}
    </li>
  );
}
