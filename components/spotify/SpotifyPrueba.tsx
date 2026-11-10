"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Music, Pause, Play, Search, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { esIOS, useSpotifyPlayer, type EstadoReproductor } from "@/hooks/useSpotifyPlayer";
import type { CancionSpotify, CuentaSpotify } from "@/lib/spotify/types";
import { cn } from "@/lib/utils";

const ESTADOS: Record<EstadoReproductor, string> = {
  apagado: "Sin conectar",
  cargando: "Conectando el reproductor…",
  listo: "Listo en este navegador",
  "sin-premium": "Hace falta Spotify Premium para escuchar acá",
  "sin-soporte": "Este navegador no puede reproducir Spotify",
  reconectar: "La conexión con Spotify venció: volvé a conectar",
  error: "Hubo un error: mirá el registro",
};

const minutos = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function SpotifyPrueba({ configurado, cuenta }: { configurado: boolean; cuenta: CuentaSpotify | null }) {
  const router = useRouter();
  const player = useSpotifyPlayer(Boolean(cuenta));
  const { estado, actual, recibido } = player;
  const [ios, setIos] = useState(false);
  const [localhost, setLocalhost] = useState<string | null>(null);

  useEffect(() => {
    setIos(esIOS());
    if (window.location.hostname === "localhost") {
      setLocalhost(`${window.location.protocol}//127.0.0.1:${window.location.port || "80"}/spotify`);
    }
    // Vuelta de /api/spotify/callback: ?spotify=conectado o ?spotify=error&motivo=…
    const params = new URLSearchParams(window.location.search);
    const resultado = params.get("spotify");
    if (!resultado) return;
    if (resultado === "conectado") toast("Spotify conectado");
    else toast(params.get("motivo") ?? "No se pudo conectar Spotify", "error");
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  // Mientras suena, el progreso avanza solo (el SDK avisa solo cuando cambia algo).
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!actual || actual.paused) return;
    const id = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, [actual]);
  const posicion = actual ? Math.min(actual.duration, actual.position + (actual.paused ? 0 : Date.now() - recibido)) : 0;
  const cancion = actual?.track_window.current_track ?? null;

  const desconectar = async () => {
    await fetch("/api/spotify/desconectar", { method: "POST" });
    toast("Spotify desconectado");
    router.refresh();
  };

  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-[6.5rem] sm:px-6">
      <div className="mb-8 text-center">
        <p className="eyebrow">Prueba técnica · fase 1</p>
        <h1 className="mt-2 font-display text-4xl leading-none tracking-[-0.01em] sm:text-5xl">Spotify</h1>
        <p className="mx-auto mt-3 max-w-lg text-sm text-muted-foreground">
          Conectá tu cuenta y escuchá en este navegador. El audio va directo de Spotify a esta pestaña y hace falta
          Premium. Todavía no hay cola compartida ni radio.
        </p>
      </div>

      {localhost && (
        <Aviso>
          Spotify no acepta <code>localhost</code> como dirección de vuelta. Abrí{" "}
          <a href={localhost} className="font-medium underline underline-offset-4">
            {localhost}
          </a>{" "}
          (vas a tener que iniciar sesión de nuevo ahí).
        </Aviso>
      )}

      {!configurado ? (
        <Aviso>
          Faltan <code>SPOTIFY_CLIENT_ID</code>, <code>SPOTIFY_CLIENT_SECRET</code> o <code>INTEGRACIONES_SECRET</code> en
          las variables del servidor (ver README → Spotify).
        </Aviso>
      ) : !cuenta ? (
        <div className="rounded-xl border bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">Tu cuenta de Spotify todavía no está conectada.</p>
          <Button asChild className="mt-4">
            <a href="/api/spotify/conectar?volver=/spotify">Conectar Spotify</a>
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">
              Conectado como <strong className="font-semibold">{cuenta.nombre}</strong>
            </span>
            <Button variant="ghost" size="sm" onClick={desconectar}>
              Desconectar
            </Button>
          </div>

          <section aria-label="Reproductor" className="rounded-xl border bg-card p-4">
            <p className={cn("flex items-center gap-2 text-xs font-medium", estado === "listo" || estado === "cargando" ? "text-muted-foreground" : "text-destructive")}>
              {estado === "cargando" && <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" />}
              {ESTADOS[estado]}
            </p>
            {estado === "reconectar" && (
              <Button asChild size="sm" className="mt-3">
                <a href="/api/spotify/conectar?volver=/spotify">Volver a conectar</a>
              </Button>
            )}

            <div className="mt-4 flex items-center gap-4">
              {cancion?.album.images[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cancion.album.images[0].url} alt="" className="h-16 w-16 shrink-0 rounded-md object-cover" />
              ) : (
                <div className="grid h-16 w-16 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                  <Music className="h-6 w-6" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                {cancion ? (
                  <>
                    <p className="truncate font-semibold">{cancion.name}</p>
                    <p className="truncate text-sm text-muted-foreground">{cancion.artists.map((a) => a.name).join(", ")}</p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Buscá una canción para escucharla acá.</p>
                )}
              </div>
              <Button
                size="icon"
                className="shrink-0 rounded-full"
                onClick={player.alternar}
                disabled={!cancion || estado !== "listo"}
                aria-label={actual && !actual.paused ? "Pausar" : "Reproducir"}
              >
                {actual && !actual.paused ? <Pause /> : <Play />}
              </Button>
            </div>

            {cancion && actual && (
              <div className="mt-3 flex items-center gap-3 text-xs tabular-nums text-muted-foreground">
                <span>{minutos(posicion)}</span>
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <div className="h-full bg-foreground" style={{ width: `${actual.duration ? (posicion / actual.duration) * 100 : 0}%` }} />
                </div>
                <span>{minutos(actual.duration)}</span>
              </div>
            )}

            {player.necesitaToque && (
              <p className="mt-3 text-sm">El navegador frenó el audio hasta que lo toques: apretá Reproducir.</p>
            )}

            <div className="mt-4 flex items-center gap-3">
              <Volume2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              {ios ? (
                <p className="text-xs text-muted-foreground">En iPhone y iPad el volumen se maneja con los botones del equipo.</p>
              ) : (
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={player.volumen}
                  onChange={(e) => player.cambiarVolumen(Number(e.target.value))}
                  aria-label="Volumen en este navegador"
                  className="w-full accent-foreground"
                />
              )}
            </div>
          </section>

          <Buscador listo={estado === "listo"} onReproducir={player.reproducir} />

          <section aria-label="Registro del reproductor">
            <h2 className="eyebrow mb-2">Registro</h2>
            {player.eventos.length === 0 ? (
              <p className="text-xs text-muted-foreground">Todavía nada.</p>
            ) : (
              <ol className="space-y-1 font-mono text-xs">
                {player.eventos.map((e, i) => (
                  <li key={player.eventos.length - i} className={e.error ? "text-destructive" : "text-muted-foreground"}>
                    {e.hora} · {e.texto}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}
    </main>
  );
}

function Buscador({ listo, onReproducir }: { listo: boolean; onReproducir: (uri: string) => void }) {
  const [q, setQ] = useState("");
  const [canciones, setCanciones] = useState<CancionSpotify[] | null>(null);
  const [buscando, setBuscando] = useState(false);

  const buscar = async (e: FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    setBuscando(true);
    try {
      const res = await fetch(`/api/spotify/buscar?q=${encodeURIComponent(q.trim())}`);
      const data = (await res.json().catch(() => ({}))) as { canciones?: CancionSpotify[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "No se pudo buscar");
      setCanciones(data.canciones ?? []);
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBuscando(false);
    }
  };

  return (
    <section aria-label="Buscar canciones">
      <form onSubmit={buscar} className="flex gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Canción, artista o álbum" aria-label="Buscar en Spotify" />
        <Button type="submit" variant="outline" disabled={buscando || !q.trim()}>
          {buscando ? <Loader2 className="motion-safe:animate-spin" /> : <Search />}
          Buscar
        </Button>
      </form>
      {canciones && (
        <ul className="mt-3 divide-y rounded-xl border bg-card">
          {canciones.length === 0 && <li className="p-4 text-sm text-muted-foreground">Sin resultados.</li>}
          {canciones.map((c) => (
            <li key={c.uri}>
              <button
                type="button"
                onClick={() => onReproducir(c.uri)}
                disabled={!listo || !c.disponible}
                aria-label={`Reproducir ${c.nombre}, de ${c.artistas}`}
                className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-accent focus-visible:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                {c.portada ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.portada} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
                ) : (
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded bg-muted">
                    <Music className="h-4 w-4 text-muted-foreground" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{c.nombre}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {c.disponible ? `${c.artistas} · ${c.album}` : "No disponible para tu cuenta"}
                  </span>
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{minutos(c.duracion)}</span>
                <Play className="h-4 w-4 shrink-0" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Aviso({ children }: { children: ReactNode }) {
  return <div className="mb-6 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">{children}</div>;
}
