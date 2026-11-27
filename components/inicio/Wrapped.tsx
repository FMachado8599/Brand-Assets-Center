"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2, Pause, Play, X } from "lucide-react";
import { ClientMark } from "@/components/clients/ClientMark";
import { Avatar } from "@/components/rest/Ranking";
import { useAccount } from "@/components/shell/AccountProvider";
import { useClients } from "@/hooks/useClients";
import { useMiPerfil } from "@/hooks/useMiPerfil";
import { wrappedDe, type Wrapped as Datos } from "@/lib/inicio/repo";
import { LIBRARY_HUB, MODULES } from "@/lib/modules";
import { juego } from "@/lib/rest/juegos";
import { nombreDe } from "@/lib/perfil";
import { cn } from "@/lib/utils";
import { Confeti } from "./Confeti";
import { pesoLegible, primerNombre } from "./piezas";

const DURA_MS = 6500;
const DIAS = ["", "los lunes", "los martes", "los miércoles", "los jueves", "los viernes", "los sábados", "los domingos"];
const PLATAFORMAS: Record<string, string> = { youtube: "YouTube", instagram: "Instagram", pinterest: "Pinterest" };

/** "board" → "Board", "library" → "Librerías". */
function nombreModulo(m: string | null | undefined) {
  if (!m) return "—";
  if (m === "library") return LIBRARY_HUB.label;
  return MODULES.find((x) => x.href === `/${m}`)?.label ?? m[0].toUpperCase() + m.slice(1);
}

function franja(h: number | null) {
  if (h == null) return null;
  if (h < 12) return { titulo: "Sos de la mañana", detalle: `Tu hora pico: las ${h}. Mate y a lo que hay.` };
  if (h < 15) return { titulo: "Sos del mediodía", detalle: `Tu hora pico: las ${h}. Entre el almuerzo y el café.` };
  if (h < 19) return { titulo: "Sos de la tarde", detalle: `Tu hora pico: las ${h}. Cuando la tarde rinde.` };
  return { titulo: "Sos de la noche", detalle: `Tu hora pico: las ${h}. Ojo con las horas extra.` };
}

type Historia = { id: string; fondo: string; cuerpo: ReactNode };

/**
 * /wrapped: tu año en Herramientas, en historias (como el de Spotify). Se avanza tocando la mitad
 * derecha (o con →), se vuelve con la izquierda (o ←) y Esc vuelve al Inicio. Los datos salen de
 * inicio_wrapped() (supabase/migracion-inicio.sql): tus visitas, lo que hiciste y el estudio.
 */
export function Wrapped() {
  const router = useRouter();
  const account = useAccount();
  const { perfil } = useMiPerfil();
  const { clients } = useClients();
  const anio = new Date().getMonth() === 0 ? new Date().getFullYear() - 1 : new Date().getFullYear();
  const [datos, setDatos] = useState<Datos | null | undefined>(undefined);
  const [i, setI] = useState(0);
  const [pausa, setPausa] = useState(false);
  const [inicio, setInicio] = useState(() => Date.now());
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    if (account?.user) wrappedDe(anio).then(setDatos);
    else if (account?.ready) setDatos(null);
  }, [account?.user, account?.ready, anio]);

  const nombre = primerNombre(perfil ? nombreDe(perfil) : null);

  const historias = useMemo<Historia[]>(() => {
    if (!datos) return [];
    const y = datos.yo;
    const e = datos.estudio;
    const out: Historia[] = [];
    const grande = "font-display text-[clamp(4rem,18vw,9rem)] leading-[0.85] tracking-[-0.03em]";
    const titulo = "font-display text-[clamp(2.2rem,8vw,4rem)] leading-[0.95] tracking-[-0.02em]";

    out.push({
      id: "hola",
      fondo: "bg-ink text-cream",
      cuerpo: (
        <>
          <p className="site-label text-cream/60">Wrapped {anio}</p>
          <p className={cn(titulo, "mt-6")}>
            {nombre ? `${nombre}, este fue` : "Este fue"} tu {anio} <em className="text-primary">en Herramientas.</em>
          </p>
          <p className="mt-6 text-cream/60">Tocá para seguir →</p>
        </>
      ),
    });

    if (y.visitas) {
      out.push({
        id: "dias",
        fondo: "bg-primary text-ink",
        cuerpo: (
          <>
            <p className="site-label text-ink/60">Entraste</p>
            <p className={cn(grande, "mt-4 tabular-nums")}>{y.dias}</p>
            <p className={cn(titulo, "mt-2")}>{y.dias === 1 ? "día" : "días"}</p>
            <p className="mt-6 max-w-sm text-[17px] text-ink/70">
              {y.visitas.toLocaleString("es-UY")} páginas abiertas
              {y.racha > 1 ? `, y una racha de ${y.racha} días seguidos` : ""}.{y.primera ? ` La primera vez fue el ${new Date(`${y.primera}T12:00:00`).toLocaleDateString("es-UY", { day: "numeric", month: "long" })}.` : ""}
            </p>
          </>
        ),
      });
    }

    if (y.herramientas.length) {
      const [top, ...resto] = y.herramientas;
      out.push({
        id: "herramienta",
        fondo: "bg-cream text-ink",
        cuerpo: (
          <>
            <p className="site-label text-ink/55">Tu herramienta del año</p>
            <p className={cn(grande, "mt-4 break-words")}>{nombreModulo(top.modulo)}</p>
            <p className="mt-2 text-[17px] text-ink/60">{top.visitas.toLocaleString("es-UY")} visitas</p>
            {resto.length > 0 && (
              <ol className="mt-8 space-y-2 text-[18px]">
                {resto.map((h, n) => (
                  <li key={h.modulo} className="flex items-baseline gap-3">
                    <span className="w-6 font-display text-2xl text-ink/40">{n + 2}</span>
                    <span className="font-medium">{nombreModulo(h.modulo)}</span>
                    <span className="text-ink/50">{h.visitas}</span>
                  </li>
                ))}
              </ol>
            )}
          </>
        ),
      });
    }

    const f = franja(y.hora);
    if (f) {
      out.push({
        id: "hora",
        fondo: "bg-[#5B8CFF] text-ink",
        cuerpo: (
          <>
            <p className="site-label text-ink/60">Tu horario</p>
            <p className={cn(titulo, "mt-6")}>{f.titulo}.</p>
            <p className="mt-4 text-[18px] text-ink/75">{f.detalle}</p>
            {y.dia_semana ? <p className="mt-8 font-display text-4xl">Y tu día: {DIAS[y.dia_semana]}.</p> : null}
          </>
        ),
      });
    }

    if (y.emojis) {
      out.push({
        id: "emojis",
        fondo: "bg-[#FF8AD8] text-ink",
        cuerpo: (
          <>
            <p className="site-label text-ink/60">Emojis copiados</p>
            <p className={cn(grande, "mt-4 tabular-nums")}>{y.emojis.toLocaleString("es-UY")}</p>
            {y.top_emojis.length > 0 && (
              <>
                <p className="mt-8 text-[17px] text-ink/70">Tus favoritos:</p>
                <p className="mt-2 text-[clamp(3rem,12vw,5rem)] leading-none">{y.top_emojis.map((t) => t.emoji).join(" ")}</p>
              </>
            )}
          </>
        ),
      });
    }

    const archivos = y.conversiones + y.retoques + y.banners + (y.descargas ?? 0);
    if (archivos) {
      out.push({
        id: "archivos",
        fondo: "bg-[#2BD4A4] text-ink",
        cuerpo: (
          <>
            <p className="site-label text-ink/60">Archivos</p>
            <p className={cn(titulo, "mt-6")}>Le diste trabajo a las máquinas.</p>
            <ul className="mt-8 space-y-3 text-[19px]">
              {y.conversiones > 0 && (
                <li>
                  <strong className="font-display text-4xl">{y.conversiones}</strong> archivos convertidos{y.bytes_convertidos ? ` (${pesoLegible(y.bytes_convertidos)})` : ""}
                </li>
              )}
              {(y.descargas ?? 0) > 0 && (
                <li>
                  <strong className="font-display text-4xl">{y.descargas}</strong> descargas{y.plataforma ? `, sobre todo de ${PLATAFORMAS[y.plataforma] ?? y.plataforma}` : ""}
                </li>
              )}
              {y.retoques > 0 && (
                <li>
                  <strong className="font-display text-4xl">{y.retoques}</strong> fondos quitados
                </li>
              )}
              {y.banners > 0 && (
                <li>
                  <strong className="font-display text-4xl">{y.banners}</strong> banners exportados
                </li>
              )}
            </ul>
          </>
        ),
      });
    }

    const textos = y.tarjetas_creadas + y.redacciones_creadas + y.tarjetas_copiadas + y.redacciones_copiadas;
    if (textos) {
      out.push({
        id: "textos",
        fondo: "bg-ink text-cream",
        cuerpo: (
          <>
            <p className="site-label text-cream/55">Palabras</p>
            <p className={cn(titulo, "mt-6")}>
              {y.redacciones_creadas} {y.redacciones_creadas === 1 ? "redacción" : "redacciones"} <em className="text-cream/50">y</em> {y.tarjetas_creadas}{" "}
              {y.tarjetas_creadas === 1 ? "tarjeta" : "tarjetas"}.
            </p>
            {y.redacciones_copiadas + y.tarjetas_copiadas > 0 && (
              <p className="mt-6 text-[18px] text-cream/70">Y copiaste textos {y.redacciones_copiadas + y.tarjetas_copiadas} veces para pegarlos por ahí.</p>
            )}
          </>
        ),
      });
    }

    if (y.tareas) {
      const marca = y.marca ? clients.find((c) => c.id === y.marca) : null;
      out.push({
        id: "tareas",
        fondo: "bg-primary text-ink",
        cuerpo: (
          <>
            <p className="site-label text-ink/60">En el Board</p>
            <p className={cn(grande, "mt-4 tabular-nums")}>{y.tareas}</p>
            <p className={cn(titulo, "mt-2")}>{y.tareas === 1 ? "tarea cerrada" : "tareas cerradas"}</p>
            {marca && (
              <div className="mt-8 flex items-center gap-3">
                <ClientMark brand={marca} className="h-14 w-14 rounded-2xl text-sm" pad="p-[14%]" />
                <p className="text-[18px]">
                  Tu marca del año: <strong>{marca.name}</strong>
                </p>
              </div>
            )}
          </>
        ),
      });
    }

    if (y.partidas) {
      out.push({
        id: "rest",
        fondo: "bg-[#FF5C39] text-ink",
        cuerpo: (
          <>
            <p className="site-label text-ink/60">Rest</p>
            <p className={cn(grande, "mt-4 tabular-nums")}>{y.partidas}</p>
            <p className={cn(titulo, "mt-2")}>{y.partidas === 1 ? "partida" : "partidas"}</p>
            {y.juego && <p className="mt-6 text-[18px] text-ink/75">Tu juego: {juego(y.juego as Parameters<typeof juego>[0])?.nombre ?? y.juego}. Nadie te juzga.</p>}
          </>
        ),
      });
    }

    if (y.percentil != null) {
      out.push({
        id: "percentil",
        fondo: "bg-cream text-ink",
        cuerpo: (
          <>
            <p className="site-label text-ink/55">Al lado del estudio</p>
            <p className={cn(titulo, "mt-6")}>
              Usaste Herramientas más que el <span className="text-[clamp(3rem,12vw,6rem)]">{y.percentil}%</span> del estudio.
            </p>
          </>
        ),
      });
    }

    out.push({
      id: "estudio",
      fondo: "bg-ink text-cream",
      cuerpo: (
        <>
          <p className="site-label text-cream/55">Y el estudio</p>
          <ul className="mt-6 space-y-4 text-[19px]">
            <li>
              <strong className="font-display text-5xl">{e.visitas.toLocaleString("es-UY")}</strong> páginas abiertas entre <strong>{e.personas}</strong> personas
            </li>
            {e.herramienta && (
              <li>
                La herramienta del año: <strong className="font-display text-4xl text-primary">{nombreModulo(e.herramienta)}</strong>
              </li>
            )}
            {e.emoji && (
              <li>
                El emoji del año: <span className="text-5xl">{e.emoji}</span>
              </li>
            )}
            {e.gamer && (
              <li className="flex items-center gap-3">
                <Avatar nombre={e.gamer.nombre} avatar={e.gamer.avatar} size={44} />
                <span>
                  Gamer del año: <strong>{e.gamer.nombre}</strong>, con {e.gamer.partidas} partidas
                </span>
              </li>
            )}
          </ul>
        </>
      ),
    });

    out.push({
      id: "chau",
      fondo: "bg-primary text-ink",
      cuerpo: (
        <>
          <p className={cn(titulo)}>Gracias por {anio}{nombre ? `, ${nombre}` : ""}.</p>
          <p className="mt-4 text-[18px] text-ink/70">Lo hicimos una vez, para todo el equipo. El que viene, más.</p>
          <Link href="/" className="mt-8 inline-flex h-12 items-center rounded-full bg-ink px-6 text-sm font-semibold text-cream">
            Volver al Inicio
          </Link>
        </>
      ),
    });
    return out;
  }, [datos, clients, nombre, anio]);

  const total = historias.length;
  const ir = useCallback(
    (n: number) => {
      setI(Math.max(0, Math.min(total - 1, n)));
      setInicio(Date.now());
      setAhora(Date.now());
    },
    [total]
  );

  // Avanza sola; en pausa (o en la última) se queda.
  useEffect(() => {
    if (!total || pausa) return;
    const id = window.setInterval(() => {
      const t = Date.now();
      setAhora(t);
      if (t - inicio >= DURA_MS && i < total - 1) ir(i + 1);
    }, 80);
    return () => window.clearInterval(id);
  }, [total, pausa, inicio, i, ir]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") ir(i + 1);
      else if (e.key === "ArrowLeft") ir(i - 1);
      else if (e.key === "Escape") router.push("/");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [i, ir, router]);

  if (datos === undefined) {
    return (
      <div className="fixed inset-0 z-[60] grid place-items-center bg-ink text-cream">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }
  if (!datos || !total) {
    return (
      <div className="fixed inset-0 z-[60] grid place-items-center bg-ink p-6 text-center text-cream">
        <div>
          <p className="font-display text-4xl">Tu Wrapped todavía no está</p>
          <p className="mt-2 text-cream/60">Hace falta iniciar sesión y que esté corrida supabase/migracion-inicio.sql.</p>
          <Link href="/" className="mt-6 inline-flex h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-ink">
            Volver al Inicio
          </Link>
        </div>
      </div>
    );
  }

  const h = historias[Math.min(i, total - 1)];
  const avance = pausa ? (ahora - inicio) / DURA_MS : Math.min(1, (ahora - inicio) / DURA_MS);
  return (
    <div className={cn("fixed inset-0 z-[60] overflow-hidden transition-colors duration-500", h.fondo)}>
      {h.id === "chau" && <Confeti />}
      {/* Las barritas de arriba, una por historia. */}
      <div className="absolute inset-x-0 top-0 z-10 flex gap-1 p-3">
        {historias.map((x, n) => (
          <span key={x.id} className="h-1 flex-1 overflow-hidden rounded-full bg-current/20" style={{ backgroundColor: "color-mix(in srgb, currentColor 20%, transparent)" }}>
            <span className="block h-full rounded-full bg-current" style={{ width: `${n < i ? 100 : n > i ? 0 : Math.min(100, avance * 100)}%` }} />
          </span>
        ))}
      </div>
      <div className="absolute right-3 top-6 z-20 flex items-center gap-1">
        <button type="button" onClick={() => setPausa((p) => !p)} aria-label={pausa ? "Seguir" : "Pausar"} className="grid h-10 w-10 place-items-center rounded-full hover:bg-black/10">
          {pausa ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
        </button>
        <Link href="/" aria-label="Cerrar" className="grid h-10 w-10 place-items-center rounded-full hover:bg-black/10">
          <X className="h-5 w-5" />
        </Link>
      </div>

      {/* Tocar a la izquierda vuelve, a la derecha avanza. */}
      <button type="button" aria-label="Anterior" onClick={() => ir(i - 1)} className="absolute inset-y-0 left-0 z-[5] w-1/3 cursor-w-resize" />
      <button type="button" aria-label="Siguiente" onClick={() => ir(i + 1)} className="absolute inset-y-0 right-0 z-[5] w-2/3 cursor-e-resize" />

      <div key={h.id} className="pointer-events-none relative z-[6] mx-auto flex h-full max-w-2xl flex-col justify-center px-6 duration-500 animate-in fade-in-0 slide-in-from-bottom-4 sm:px-10 [&_a]:pointer-events-auto">
        {h.cuerpo}
      </div>

      <div className="absolute inset-x-0 bottom-4 z-10 flex items-center justify-center gap-2 text-sm opacity-60">
        <ChevronLeft className="h-4 w-4" /> {i + 1} de {total} <ChevronRight className="h-4 w-4" />
      </div>
    </div>
  );
}
