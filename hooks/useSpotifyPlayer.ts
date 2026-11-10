"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Reproductor de Spotify en este navegador (Web Playback SDK), con la cuenta de quien lo usa.
 * El audio va directo de Spotify a esta pestaña: la app no toca ni retransmite el sonido.
 * Requiere Premium; en iOS el volumen no se puede cambiar desde la página y el primer play
 * tiene que salir de un toque de la persona.
 */

export type EstadoReproductor =
  | "apagado" // sin cuenta conectada
  | "cargando"
  | "listo" // el navegador aparece como dispositivo de Spotify
  | "sin-premium"
  | "sin-soporte" // el navegador no puede reproducir (ej: sin EME)
  | "reconectar" // la conexión con Spotify venció
  | "error";

export type EventoReproductor = { hora: string; texto: string; error?: boolean };

const SDK_URL = "https://sdk.scdn.co/spotify-player.js";
const MARGEN_MS = 60_000;
const MAX_EVENTOS = 40;

let sdk: Promise<void> | null = null;

function cargarSdk() {
  if (window.Spotify) return Promise.resolve();
  sdk ??= new Promise<void>((resolve, reject) => {
    window.onSpotifyWebPlaybackSDKReady = () => resolve();
    const script = document.createElement("script");
    script.src = SDK_URL;
    script.async = true;
    script.onerror = () => {
      sdk = null;
      script.remove();
      reject(new Error("No se pudo cargar el reproductor de Spotify"));
    };
    document.body.appendChild(script);
  });
  return sdk;
}

export const esIOS = () =>
  typeof navigator !== "undefined" &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

class ErrorToken extends Error {
  constructor(
    message: string,
    readonly reconectar: boolean
  ) {
    super(message);
  }
}

export function useSpotifyPlayer(conectado: boolean) {
  const [estado, setEstado] = useState<EstadoReproductor>(conectado ? "cargando" : "apagado");
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [actual, setActual] = useState<Spotify.PlaybackState | null>(null);
  /** Cuándo llegó `actual`: con eso se calcula el progreso sin pedirle nada a Spotify. */
  const [recibido, setRecibido] = useState(0);
  const [volumen, setVolumenState] = useState(0.5);
  /** El navegador bloqueó el audio: hace falta un toque de la persona. */
  const [necesitaToque, setNecesitaToque] = useState(false);
  const [eventos, setEventos] = useState<EventoReproductor[]>([]);
  const player = useRef<Spotify.Player | null>(null);
  const token = useRef<{ accessToken: string; expira: number } | null>(null);

  const anotar = useCallback((texto: string, error = false) => {
    const hora = new Date().toLocaleTimeString("es", { hour12: false });
    setEventos((prev) => [{ hora, texto, error }, ...prev].slice(0, MAX_EVENTOS));
  }, []);

  const pedirToken = useCallback(async () => {
    if (token.current && token.current.expira - Date.now() > MARGEN_MS) return token.current.accessToken;
    const res = await fetch("/api/spotify/token", { cache: "no-store" });
    const data = (await res.json().catch(() => ({}))) as { accessToken?: string; expira?: number; error?: string; reconectar?: boolean };
    if (!res.ok || !data.accessToken || !data.expira) {
      throw new ErrorToken(data.error ?? "No se pudo obtener el permiso de Spotify", Boolean(data.reconectar));
    }
    token.current = { accessToken: data.accessToken, expira: data.expira };
    return data.accessToken;
  }, []);

  useEffect(() => {
    if (!conectado) {
      setEstado("apagado");
      return;
    }
    let alive = true;
    let creado: Spotify.Player | null = null;
    setEstado("cargando");
    anotar("Cargando el reproductor de Spotify…");

    cargarSdk()
      .then(() => {
        if (!alive || !window.Spotify) return;
        creado = new window.Spotify.Player({
          name: "Herramientas · Cámara TBWA",
          volume: 0.5,
          getOAuthToken: (cb) => {
            pedirToken()
              .then(cb)
              .catch((e: ErrorToken) => {
                if (!alive) return;
                setEstado(e.reconectar ? "reconectar" : "error");
                anotar(e.message, true);
              });
          },
        });
        player.current = creado;

        creado.addListener("ready", ({ device_id }) => {
          setDeviceId(device_id);
          setEstado("listo");
          anotar("Listo: este navegador aparece como dispositivo en Spotify");
        });
        creado.addListener("not_ready", () => {
          setDeviceId(null);
          setEstado("cargando");
          anotar("El dispositivo se desconectó de Spotify; reintentando…", true);
        });
        creado.addListener("player_state_changed", (state) => {
          setActual(state);
          setRecibido(Date.now());
          if (state && !state.paused) setNecesitaToque(false);
        });
        creado.addListener("autoplay_failed", () => {
          setNecesitaToque(true);
          anotar("El navegador bloqueó la reproducción automática: hace falta un toque", true);
        });
        creado.addListener("initialization_error", ({ message }) => {
          setEstado("sin-soporte");
          anotar(`Este navegador no puede reproducir Spotify (${message})`, true);
        });
        creado.addListener("authentication_error", ({ message }) => {
          token.current = null;
          setEstado("reconectar");
          anotar(`Spotify rechazó el permiso (${message})`, true);
        });
        creado.addListener("account_error", ({ message }) => {
          setEstado("sin-premium");
          anotar(`La cuenta no puede reproducir acá: hace falta Premium (${message})`, true);
        });
        creado.addListener("playback_error", ({ message }) => {
          anotar(`No se pudo reproducir (${message})`, true);
        });

        return creado.connect().then((ok) => {
          if (!ok && alive) {
            setEstado("error");
            anotar("Spotify no aceptó conectar el reproductor", true);
          }
        });
      })
      .catch((e: Error) => {
        if (!alive) return;
        setEstado("error");
        anotar(e.message, true);
      });

    return () => {
      alive = false;
      creado?.disconnect();
      player.current = null;
      setDeviceId(null);
      setActual(null);
    };
  }, [conectado, pedirToken, anotar]);

  /**
   * Manda una canción a este navegador. Tiene que llamarse desde un click: activateElement deja
   * el audio habilitado antes de que llegue la orden de Spotify (si no, iOS la toma como autoplay).
   */
  const reproducir = useCallback(
    async (uri: string) => {
      const p = player.current;
      if (!p || !deviceId) return;
      const activado = p.activateElement();
      try {
        const accessToken = await pedirToken();
        await activado;
        const res = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(deviceId)}`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ uris: [uri] }),
        });
        if (res.ok) return;
        const data = (await res.json().catch(() => ({}))) as { error?: { message?: string; reason?: string } };
        const motivo =
          data.error?.reason === "PREMIUM_REQUIRED"
            ? "Hace falta Spotify Premium"
            : res.status === 404
              ? "Spotify todavía no ve este navegador como dispositivo"
              : res.status === 429
                ? "Spotify pidió esperar un poco"
                : data.error?.message ?? `error ${res.status}`;
        anotar(`No se pudo reproducir: ${motivo}`, true);
      } catch (e) {
        anotar((e as Error).message, true);
      }
    },
    [deviceId, pedirToken, anotar]
  );

  const alternar = useCallback(() => {
    const p = player.current;
    if (!p) return;
    p.activateElement();
    p.togglePlay().catch((e: Error) => anotar(e.message, true));
  }, [anotar]);

  const cambiarVolumen = useCallback((v: number) => {
    setVolumenState(v);
    player.current?.setVolume(v).catch(() => {});
  }, []);

  return { estado, deviceId, actual, recibido, volumen, necesitaToque, eventos, reproducir, alternar, cambiarVolumen };
}
