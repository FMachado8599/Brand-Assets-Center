"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown, ExternalLink, ListMusic, QrCode, X } from "lucide-react";
import { useAccount } from "@/components/shell/AccountProvider";
import { useSpotifyJam } from "@/hooks/useSpotifyJam";
import { useStoredState } from "@/hooks/useStoredState";
import { cn } from "@/lib/utils";
import { hundido, pildoraVerde, relieve } from "./estilo";
import { JamAhora } from "./JamAhora";
import { JamCola } from "./JamCola";
import { JamQr } from "./JamQr";
import { Ecualizador, Tapa, useTic } from "./piezas";

/** Preferencia de cada persona (en su cuenta): mostrar o no la burbuja. Se cambia en /spotify. */
export const BURBUJA_KEY = "spotify:burbuja";

/**
 * La burbuja vive en el marco de la app y lee la preferencia una sola vez: cuando /spotify la
 * cambia, se lo avisa con este evento para que aparezca o desaparezca sin recargar.
 */
export function avisarBurbuja(mostrar: boolean) {
  window.dispatchEvent(new CustomEvent<boolean>(BURBUJA_KEY, { detail: mostrar }));
}

const entra = "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-200";
const angosta = () => window.matchMedia("(max-width: 639px)").matches;

/**
 * El Jam flotando sobre toda la app (abajo a la derecha), para quien tiene sesión, si hay un Jam
 * armado y no la ocultó. Primero es una burbuja con la tapa; al tocarla se abre lo que suena, y de
 * ahí la cola (hacia arriba, con el buscador) y el QR (al costado). En /spotify no aparece: está la
 * página entera.
 */
export function JamBurbuja() {
  const account = useAccount();
  const pathname = usePathname();
  const [mostrar, setMostrar] = useStoredState<boolean>(BURBUJA_KEY, true);
  const [abierta, setAbierta] = useState(false);
  const [cola, setCola] = useState(false);
  const [qr, setQr] = useState(false);

  useEffect(() => {
    const alCambiar = (e: Event) => setMostrar((e as CustomEvent<boolean>).detail);
    window.addEventListener(BURBUJA_KEY, alCambiar);
    return () => window.removeEventListener(BURBUJA_KEY, alCambiar);
  }, [setMostrar]);

  const activa = Boolean(account?.user) && mostrar && pathname !== "/spotify";
  const { estado, posicion, sumar } = useSpotifyJam(activa, abierta ? 10_000 : 20_000);
  useTic(Boolean(activa && estado?.sonando));

  // Esc cierra de a una cosa: primero la cola y el QR, después la tarjeta.
  useEffect(() => {
    if (!abierta) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (cola || qr) {
        setCola(false);
        setQr(false);
      } else setAbierta(false);
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [abierta, cola, qr]);

  if (!activa || !estado?.dj) return null;
  const c = estado.actual;
  const fraccion = c?.duracion ? posicion() / c.duracion : 0;

  if (!abierta) {
    return (
      <button
        type="button"
        onClick={() => setAbierta(true)}
        aria-label={c ? `Jam: suena ${c.nombre}, de ${c.artistas}. Abrir` : "Jam en pausa. Abrir"}
        className={cn("group fixed bottom-4 right-4 z-50 h-16 w-16 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[#1ed760]", entra)}
      >
        <span
          aria-hidden
          className={cn(
            "absolute -inset-2 rounded-full bg-[#1ed760]/35 blur-xl transition-opacity",
            estado.sonando ? "opacity-100 motion-safe:animate-pulse" : "opacity-40"
          )}
        />
        <span className="absolute inset-0 rounded-full bg-[#121212] p-1 shadow-[0_14px_34px_-10px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.12)] transition-transform group-hover:scale-105 group-active:scale-95">
          <Tapa src={c?.portada ?? null} luz={false} className="h-full w-full rounded-full" />
        </span>
        {/* El progreso de la canción, como un anillo. */}
        <svg viewBox="0 0 64 64" aria-hidden className="absolute inset-0 -rotate-90">
          <circle cx="32" cy="32" r="30.5" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="3" />
          <circle
            cx="32"
            cy="32"
            r="30.5"
            fill="none"
            stroke="#1ed760"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={`${Math.max(0.001, fraccion) * 191.6} 191.6`}
            className="drop-shadow-[0_0_4px_rgba(30,215,96,0.8)] transition-[stroke-dasharray] duration-1000 ease-linear"
          />
        </svg>
        <span className="absolute -bottom-0.5 -right-0.5 grid h-7 w-7 place-items-center rounded-full border border-white/10 bg-[#121212] shadow-lg">
          <Ecualizador sonando={estado.sonando} />
        </span>
      </button>
    );
  }

  const alternarCola = () => {
    setCola((v) => !v);
    if (angosta()) setQr(false);
  };
  const alternarQr = () => {
    setQr((v) => !v);
    if (angosta()) setCola(false);
  };

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex items-end gap-3 max-sm:left-4 max-sm:flex-col max-sm:items-stretch">
      {qr && (
        <JamQr
          link={estado.link}
          className={cn("pointer-events-auto w-60 shrink-0 max-sm:w-auto", entra)}
          esquina={
            <button type="button" onClick={() => setQr(false)} className={cn(relieve, "h-8 w-8")} aria-label="Cerrar el QR">
              <X className="h-4 w-4" />
            </button>
          }
        />
      )}
      <div className="flex w-[380px] flex-col gap-3 max-sm:w-auto">
        {cola && (
          <JamCola
            estado={estado}
            sumar={sumar}
            autoFocus
            className={cn("pointer-events-auto max-h-[min(60vh,520px)]", entra)}
          />
        )}
        <JamAhora
          estado={estado}
          posicion={posicion()}
          className={cn("pointer-events-auto", entra)}
          esquina={
            <button type="button" onClick={() => setAbierta(false)} className={cn(relieve, "h-8 w-8 self-start")} aria-label="Achicar a la burbuja">
              <ChevronDown className="h-4 w-4" />
            </button>
          }
          acciones={
            <>
              {estado.link ? (
                <a href={estado.link} target="_blank" rel="noopener noreferrer" className={cn(pildoraVerde, "flex-1")}>
                  Unirse al Jam
                  <ExternalLink className="h-4 w-4" aria-hidden />
                </a>
              ) : (
                <span aria-disabled className={cn(pildoraVerde, "flex-1")} title="El DJ todavía no pegó el link del Jam">
                  Unirse al Jam
                </span>
              )}
              <button type="button" onClick={alternarQr} aria-pressed={qr} className={cn(relieve, "h-11 w-11", qr && hundido)} aria-label="QR para unirse desde el celular">
                <QrCode className="h-5 w-5" />
              </button>
              <button type="button" onClick={alternarCola} aria-expanded={cola} className={cn(relieve, "relative h-11 w-11", cola && hundido)} aria-label="Cola y buscador">
                <ListMusic className="h-5 w-5" />
                {estado.siguientes.length > 0 && (
                  <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[#1ed760] px-1 text-[10px] font-bold tabular-nums text-black">
                    {estado.siguientes.length}
                  </span>
                )}
              </button>
            </>
          }
        />
      </div>
    </div>
  );
}
