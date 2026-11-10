"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toaster";
import { useAccount } from "@/components/shell/AccountProvider";
import { useConfirm } from "@/components/ui/confirm";
import { useSpotifyJam } from "@/hooks/useSpotifyJam";
import { useStoredState } from "@/hooks/useStoredState";
import { cn } from "@/lib/utils";
import { avisarBurbuja, BURBUJA_KEY } from "./jam/JamBurbuja";
import { JamAhora } from "./jam/JamAhora";
import { JamCola } from "./jam/JamCola";
import { JamQr } from "./jam/JamQr";
import { apagado, pildoraVerde, resplandor } from "./jam/estilo";
import { useTic } from "./jam/piezas";

const CONECTAR = "/api/spotify/conectar?volver=/spotify";

/** El Jam entero en una página: lo que suena, la cola con el buscador, el QR y lo del DJ. */
export function SpotifyJam({ configurado }: { configurado: boolean }) {
  const account = useAccount();
  const { estado, error, posicion, sumar, refrescar } = useSpotifyJam(configurado, 8_000);
  const [burbuja, setBurbuja] = useStoredState<boolean>(BURBUJA_KEY, true);
  const [errorConexion, setErrorConexion] = useState<string | null>(null);
  useTic(Boolean(estado?.sonando));

  useEffect(() => {
    // Vuelta de /api/spotify/callback: ?spotify=conectado o ?spotify=error&motivo=…
    const params = new URLSearchParams(window.location.search);
    const resultado = params.get("spotify");
    if (!resultado) return;
    if (resultado === "conectado") toast("Listo: sos el DJ del Jam");
    else setErrorConexion(params.get("motivo") ?? "No se pudo conectar Spotify");
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  const soyDJ = Boolean(estado?.dj && account?.user?.id === estado.dj.usuario);

  return (
    <main className="mx-auto max-w-5xl px-4 pb-16 pt-[6.5rem] sm:px-6">
      <div className="mb-8 text-center">
        <p className="eyebrow">Spotify</p>
        <h1 className="mt-2 font-display text-4xl leading-none tracking-[-0.01em] sm:text-5xl">El Jam del estudio</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">
          Una sola música para todos: el DJ la pone desde su Spotify y cualquiera suma canciones desde acá o desde la burbuja,
          en cualquier parte de la app. Para escucharla, unite al Jam desde Spotify.
        </p>
      </div>

      {errorConexion && <Aviso>{errorConexion}</Aviso>}
      {!configurado && (
        <Aviso>
          Faltan <code>SPOTIFY_CLIENT_ID</code>, <code>SPOTIFY_CLIENT_SECRET</code> o <code>INTEGRACIONES_SECRET</code> en las
          variables del servidor (ver README → Spotify).
        </Aviso>
      )}

      {/* El escenario: oscuro, con la luz verde de Spotify detrás. */}
      <div className="relative isolate overflow-clip rounded-[36px] bg-[#0a0a0a] p-3 shadow-[0_40px_100px_-40px_rgba(0,0,0,0.8)] sm:p-5">
        <span aria-hidden className={cn(resplandor, "-left-24 -top-24 h-72 w-72 bg-[#1ed760]/20")} />
        <span aria-hidden className={cn(resplandor, "-bottom-32 right-0 h-80 w-[28rem] bg-[#1ed760]/10")} />
        {!estado ? (
          <Escenario>{error ?? (configurado ? "Leyendo el Jam…" : "Spotify no está configurado.")}</Escenario>
        ) : !estado.dj ? (
          <Escenario>
            <p className="text-2xl font-bold text-white">Todavía no hay Jam</p>
            <p className={cn("mx-auto mt-2 max-w-md text-sm", apagado)}>
              Quien lo arme tiene que tener Spotify Premium: arrancá un Jam en tu Spotify y conectá tu cuenta acá para ser el DJ.
            </p>
            <a href={CONECTAR} aria-disabled={!configurado} className={cn(pildoraVerde, "mt-6")}>
              Conectar Spotify y ser el DJ
            </a>
          </Escenario>
        ) : (
          <div className="grid gap-3 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="flex min-w-0 flex-col gap-3 sm:gap-5">
              <JamAhora
                estado={estado}
                posicion={posicion()}
                grande
                acciones={
                  estado.link ? (
                    <a href={estado.link} target="_blank" rel="noopener noreferrer" className={pildoraVerde}>
                      Unirse al Jam
                      <ExternalLink className="h-4 w-4" aria-hidden />
                    </a>
                  ) : (
                    <span aria-disabled className={pildoraVerde} title="El DJ todavía no pegó el link del Jam">
                      Unirse al Jam
                    </span>
                  )
                }
              />
              <JamCola estado={estado} sumar={sumar} listaClassName="max-h-[28rem]" />
            </div>
            <JamQr link={estado.link} className="self-start" />
          </div>
        )}
      </div>

      {estado?.dj && <PanelDJ estado={{ dj: estado.dj, link: estado.link }} soyDJ={soyDJ} configurado={configurado} alCambiar={refrescar} />}

      <div className="mt-6 flex items-center justify-between gap-4 rounded-xl border bg-card p-4">
        <div>
          <p className="text-sm font-medium">Burbuja del Jam en toda la app</p>
          <p className="text-xs text-muted-foreground">Abajo a la derecha, en cualquier módulo. Ocultarla no cambia nada del Jam.</p>
        </div>
        <Switch
          checked={burbuja}
          onCheckedChange={(v) => {
            setBurbuja(v);
            avisarBurbuja(v);
          }}
          aria-label="Mostrar la burbuja del Jam en toda la app"
        />
      </div>
    </main>
  );
}

function PanelDJ({
  estado,
  soyDJ,
  configurado,
  alCambiar,
}: {
  estado: { dj: { nombre: string; spotify: string }; link: string | null };
  soyDJ: boolean;
  configurado: boolean;
  alCambiar: () => void;
}) {
  const confirm = useConfirm();
  const [link, setLink] = useState(estado.link ?? "");
  const [guardando, setGuardando] = useState(false);
  useEffect(() => setLink(estado.link ?? ""), [estado.link]);

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    const res = await fetch("/api/spotify/jam", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ link }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setGuardando(false);
    if (!res.ok) return toast(data.error ?? "No se pudo guardar el link", "error");
    toast(link.trim() ? "Link del Jam guardado" : "Link del Jam borrado");
    alCambiar();
  };

  const terminar = async () => {
    const ok = await confirm({
      title: "¿Terminar el Jam en la app?",
      description: "La burbuja desaparece para todos. Tu Spotify sigue igual: el Jam lo cerrás desde ahí.",
      confirmLabel: "Terminar",
      destructive: true,
    });
    if (!ok) return;
    const res = await fetch("/api/spotify/jam", { method: "DELETE" });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return toast(data.error ?? "No se pudo terminar el Jam", "error");
    toast("Jam terminado");
    alCambiar();
  };

  return (
    <section aria-label="El DJ" className="mt-6 rounded-xl border bg-card p-4 sm:p-5">
      <p className="eyebrow">El DJ</p>
      {soyDJ ? (
        <>
          <p className="mt-2 text-sm">
            Sos vos, con tu cuenta de Spotify <strong className="font-semibold">{estado.dj.spotify}</strong>. Lo que suene en tu
            Spotify es lo que suena en el Jam.
          </p>
          <form onSubmit={guardar} className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://spotify.link/…"
              aria-label="Link del Jam"
              inputMode="url"
            />
            <Button type="submit" disabled={guardando || link.trim() === (estado.link ?? "")}>
              Guardar link
            </Button>
          </form>
          <p className="mt-2 text-xs text-muted-foreground">
            En Spotify: Jam → Invitar → Copiar link. Con el link, la gente se une desde la burbuja o con el QR.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <a href={CONECTAR}>Volver a conectar Spotify</a>
            </Button>
            <Button variant="ghost" size="sm" onClick={terminar}>
              Terminar el Jam
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-2 text-sm">
            <strong className="font-semibold">{estado.dj.nombre}</strong> (en Spotify, {estado.dj.spotify}).
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            ¿Armás vos el Jam? Conectá tu Spotify y pasás a ser el DJ, en lugar de {estado.dj.nombre}.
          </p>
          <Button asChild variant="outline" size="sm" className="mt-3">
            <a href={CONECTAR} aria-disabled={!configurado}>
              Ser el DJ
            </a>
          </Button>
        </>
      )}
    </section>
  );
}

function Escenario({ children }: { children: ReactNode }) {
  return <div className={cn("px-4 py-16 text-center text-sm", apagado)}>{children}</div>;
}

function Aviso({ children }: { children: ReactNode }) {
  return <div className="mb-6 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">{children}</div>;
}
