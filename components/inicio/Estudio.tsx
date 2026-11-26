"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Crown, Disc3, Gift, ListMusic, Loader2, Send } from "lucide-react";
import { ClientMark } from "@/components/clients/ClientMark";
import { abrirPerfil } from "@/components/perfil/abrir";
import { FotoPerfil } from "@/components/perfil/piezas";
import { Avatar } from "@/components/rest/Ranking";
import { abrirJam } from "@/components/spotify/jam/JamBurbuja";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/components/ui/toaster";
import { useRanking } from "@/hooks/useRanking";
import { useSpotifyJam } from "@/hooks/useSpotifyJam";
import { actividadDelEstudio, saludar, type Actividad, type Ocasion } from "@/lib/inicio/repo";
import { formatPuntaje, JUEGOS, type Juego } from "@/lib/rest/juegos";
import { fechaCorta, fotoElegida, nombreDe } from "@/lib/perfil";
import { cn } from "@/lib/utils";
import { Confeti } from "./Confeti";
import { CAJA, Seccion, hace, primerNombre } from "./piezas";
import type { Celebracion, DatosInicio } from "./useInicio";

export function Estudio({ d }: { d: DatosInicio }) {
  return (
    <Seccion id="estudio" titulo="El estudio">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Celebraciones d={d} />
        <div className="grid min-w-0 grid-cols-1 content-start gap-3">
          <Jam />
          <RankingRest />
        </div>
        <LoUltimo d={d} />
      </div>
    </Seccion>
  );
}

/* ───────────── Cumples, aniversarios y bienvenidas ───────────── */

const TEXTO_SALUDO: Record<Ocasion, (n: string) => string> = {
  cumple: (n) => `¡Feliz cumple, ${n}! 🎂`,
  aniversario: (n) => `¡Feliz aniversario en el estudio, ${n}! 🎉`,
  bienvenida: (n) => `¡Te damos la bienvenida al estudio, ${n}! 👋`,
};

function Celebraciones({ d }: { d: DatosInicio }) {
  const hoy = d.celebraciones.filter((c) => c.dias === 0 && c.tipo !== "bienvenida");
  const proximos = d.celebraciones.filter((c) => c.tipo === "cumple" && c.dias > 0).slice(0, 4);
  const nuevos = d.celebraciones.filter((c) => c.tipo === "bienvenida").slice(0, 3);
  const [disparo, setDisparo] = useState(0);

  return (
    <div id="cumple" className={cn(CAJA, "relative flex flex-col overflow-hidden p-5")}>
      {hoy.length > 0 && <Confeti disparo={disparo} cantidad={90} />}
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display text-[1.8rem] leading-none">{hoy.length ? "¡Hoy se festeja!" : "Para festejar"}</h3>
        <Gift className="h-5 w-5 text-muted-foreground" />
      </div>

      {hoy.length > 0 && (
        <ul className="mt-4 space-y-2">
          {hoy.map((c) => (
            <FilaCelebracion key={c.persona.id + c.tipo} c={c} d={d} grande onSaludo={() => setDisparo((n) => n + 1)} />
          ))}
        </ul>
      )}

      {nuevos.length > 0 && (
        <div className="mt-4">
          <p className="eyebrow mb-1.5">Se sumaron</p>
          <ul className="space-y-1.5">
            {nuevos.map((c) => (
              <FilaCelebracion key={c.persona.id} c={c} d={d} />
            ))}
          </ul>
        </div>
      )}

      {proximos.length > 0 && (
        <div className="mt-4">
          <p className="eyebrow mb-1.5">Se vienen</p>
          <ul className="space-y-1.5">
            {proximos.map((c) => (
              <FilaCelebracion key={c.persona.id} c={c} d={d} />
            ))}
          </ul>
        </div>
      )}

      {d.fuera.length > 0 && (
        <div className="mt-4">
          <p className="eyebrow mb-1.5">Hoy no están</p>
          <div className="flex flex-wrap gap-1.5">
            {d.fuera.slice(0, 8).map(({ persona, hasta }) => (
              <button
                key={persona.id}
                type="button"
                onClick={() => abrirPerfil(persona.id)}
                className="inline-flex h-8 items-center gap-1.5 rounded-full bg-foreground/[0.05] py-0.5 pl-0.5 pr-2.5 text-[12px] hover:bg-foreground/[0.08]"
              >
                <FotoPerfil nombre={nombreDe(persona.perfil, persona.nombre)} url={fotoElegida(persona.perfil, persona.avatar_bc) ?? persona.avatar_url} size={26} fuera />
                {primerNombre(nombreDe(persona.perfil, persona.nombre))} · vuelve {fechaCorta(hasta)}
              </button>
            ))}
          </div>
        </div>
      )}

      {!hoy.length && !proximos.length && !nuevos.length && (
        <p className="mt-4 text-sm text-muted-foreground">
          No hay cumples a la vista. Cargá el tuyo (y el día que entraste al estudio) en{" "}
          <Link href="/perfil" className="font-medium text-foreground underline underline-offset-2">
            tu perfil
          </Link>{" "}
          para que te saluden.
        </p>
      )}
    </div>
  );
}

function FilaCelebracion({ c, d, grande, onSaludo }: { c: Celebracion; d: DatosInicio; grande?: boolean; onSaludo?: () => void }) {
  const nombre = nombreDe(c.persona.perfil, c.persona.nombre);
  const corto = primerNombre(nombre);
  const esYo = c.persona.id === d.yo?.id;
  const detalle =
    c.tipo === "cumple"
      ? c.dias === 0
        ? esYo
          ? "¡Es tu cumple!"
          : "Cumple años hoy"
        : c.dias === 1
          ? "Cumple mañana"
          : `Cumple en ${c.dias} días`
      : c.tipo === "aniversario"
        ? `${c.anios} ${c.anios === 1 ? "año" : "años"} en el estudio`
        : c.dias === 0
          ? "Entró hoy"
          : `Entró hace ${-c.dias} ${c.dias === -1 ? "día" : "días"}`;
  const puedeSaludar = !esYo && (c.dias === 0 || c.tipo === "bienvenida") && Boolean(d.yo);
  return (
    <li className={cn("flex items-center gap-3", grande && "rounded-2xl bg-primary/20 p-2.5")}>
      <button type="button" onClick={() => abrirPerfil(c.persona.id)} className="shrink-0">
        <FotoPerfil nombre={nombre} url={fotoElegida(c.persona.perfil, c.persona.avatar_bc) ?? c.persona.avatar_url} size={grande ? 44 : 32} acento={c.persona.perfil?.acento} />
      </button>
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate font-medium", grande ? "text-[15px]" : "text-sm")}>
          {c.tipo === "cumple" ? "🎂 " : c.tipo === "aniversario" ? "🎉 " : "👋 "}
          {nombre}
        </span>
        <span className="block truncate text-xs text-muted-foreground">{detalle}</span>
      </span>
      {puedeSaludar && <BotonSaludo personaId={c.persona.id} ocasion={c.tipo} nombre={corto} onSaludo={onSaludo} />}
    </li>
  );
}

function BotonSaludo({ personaId, ocasion, nombre, onSaludo }: { personaId: string; ocasion: Ocasion; nombre: string; onSaludo?: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState(TEXTO_SALUDO[ocasion](nombre));
  const [mandando, setMandando] = useState(false);
  const [listo, setListo] = useState(false);

  const mandar = async () => {
    setMandando(true);
    try {
      await saludar(personaId, ocasion, texto);
      setListo(true);
      setAbierto(false);
      onSaludo?.();
      toast(`Le llegó tu saludo a ${nombre} 🎉`);
    } catch (e) {
      const m = (e as Error).message;
      toast(/ya le mandaste/i.test(m) ? "Ya le mandaste ese saludo hoy" : /inicio_saludar|schema cache|PGRST202/i.test(m) ? "Falta correr supabase/migracion-inicio.sql" : m, "error");
    } finally {
      setMandando(false);
    }
  };

  if (listo) return <span className="shrink-0 text-[12px] font-medium text-muted-foreground">¡Saludado!</span>;
  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger asChild>
        <button type="button" className="h-8 shrink-0 rounded-full bg-ink px-3 text-[12.5px] font-semibold text-cream transition-transform hover:scale-[1.03] dark:bg-cream dark:text-ink">
          Saludar
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3">
        <p className="eyebrow">Le llega a la campanita</p>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value.slice(0, 280))}
          rows={3}
          className="mt-2 w-full resize-none rounded-xl border bg-background p-2.5 text-sm outline-none focus:border-foreground/30"
        />
        <button
          type="button"
          onClick={mandar}
          disabled={mandando || !texto.trim()}
          className="mt-2 inline-flex h-9 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {mandando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Mandar saludo
        </button>
      </PopoverContent>
    </Popover>
  );
}

/* ───────────── El Jam ───────────── */

function Jam() {
  const { estado, error } = useSpotifyJam(true, 20_000);
  const c = estado?.actual ?? null;
  return (
    <div className={cn(CAJA, "flex items-center gap-3 p-4")}>
      {c?.portada ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={c.portada} alt="" className={cn("h-16 w-16 shrink-0 rounded-xl object-cover shadow-md", estado?.sonando && "motion-safe:animate-[spin_12s_linear_infinite] rounded-full")} />
      ) : (
        <span className="grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-[#1DB954]/15 text-[#1DB954]">
          <Disc3 className="h-7 w-7" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="eyebrow">{estado?.sonando ? "Suena en el Jam" : "El Jam del estudio"}</p>
        {c ? (
          <>
            <p className="mt-0.5 truncate text-[15px] font-semibold">{c.nombre}</p>
            <p className="truncate text-[13px] text-muted-foreground">
              {c.artistas}
              {estado?.dj ? ` · DJ ${primerNombre(estado.dj.nombre)}` : ""}
            </p>
          </>
        ) : (
          <p className="mt-0.5 text-sm text-muted-foreground">{error || !estado?.dj ? "Nadie armó el Jam todavía." : "Está en silencio. ¿Ponemos algo?"}</p>
        )}
      </div>
      {estado?.dj ? (
        <button
          type="button"
          onClick={() => abrirJam(true)}
          aria-label="Sumar una canción"
          title="Sumar una canción"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#1DB954] text-white transition-transform hover:scale-105"
        >
          <ListMusic className="h-4 w-4" />
        </button>
      ) : (
        <Link href="/spotify" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border hover:border-foreground/30" aria-label="Ir al Jam">
          <ChevronRight className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}

/* ───────────── El ranking de Rest ───────────── */

const PICANTE = [
  (n: string) => `¿Nadie le va a ganar a ${n}?`,
  (n: string) => `${n} está agrandado.`,
  () => "Récord a batir.",
  () => "Hay revancha hasta el domingo.",
];

function RankingRest() {
  return (
    <div className={cn(CAJA, "p-4")}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="eyebrow">Rest · esta semana</p>
        <Link href="/rest" className="inline-flex items-center gap-0.5 text-[12.5px] text-muted-foreground hover:text-foreground">
          Jugar <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <ul className="mt-2 divide-y divide-foreground/[0.06]">
        {JUEGOS.map((j, i) => (
          <Lider key={j.id} j={j} i={i} />
        ))}
      </ul>
    </div>
  );
}

function Lider({ j, i }: { j: Juego; i: number }) {
  const { filas, loading, estado } = useRanking(j.id, j.id === "buscaminas" ? "principiante" : "", "semana", 1);
  const primero = filas.find((f) => f.puesto === 1) ?? null;
  const frase = !primero
    ? "Corona libre esta semana."
    : primero.yo
      ? "Sos vos. Por ahora."
      : PICANTE[(i + new Date().getDate()) % PICANTE.length](primerNombre(primero.nombre));
  return (
    <li className="flex items-center gap-2.5 py-2">
      <Link href={j.href} className="w-[5.5rem] shrink-0 truncate font-display text-[1.25rem] leading-none hover:underline">
        {j.nombre}
      </Link>
      {loading ? (
        <span className="skeleton h-5 flex-1 rounded-full" />
      ) : estado !== "ok" ? (
        <span className="flex-1 text-xs text-muted-foreground">Sin ranking acá</span>
      ) : primero ? (
        <>
          <Avatar nombre={primero.nombre} avatar={primero.avatar} size={24} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1 truncate text-[13px] font-medium">
              <Crown className="h-3 w-3 shrink-0 text-[color:var(--tono-pronto)]" /> {primerNombre(primero.nombre)} · {formatPuntaje(j.id, primero.puntaje)}
            </span>
            <span className="block truncate text-[11.5px] text-muted-foreground">
              {frase}
            </span>
          </span>
        </>
      ) : (
        <span className="flex-1 text-[13px] text-muted-foreground">{frase}</span>
      )}
    </li>
  );
}

/* ───────────── Lo último que pasó ───────────── */

function textoDe(a: Actividad, marca: string | null) {
  const quien = a.nombre ? primerNombre(a.nombre) : null;
  switch (a.tipo) {
    case "logos":
      return `${quien ?? "Alguien"} subió ${a.cantidad === 1 ? "un archivo de logo" : `${a.cantidad} archivos de logo`}${marca ? ` de ${marca}` : ""}`;
    case "tarjetas":
      return `${quien ?? "Alguien"} creó ${a.cantidad === 1 ? "una tarjeta" : `${a.cantidad} tarjetas`}${marca ? ` de ${marca}` : ""}`;
    case "cliente":
      return `Nuevo cliente: ${a.titulo ?? marca ?? ""}`;
    case "nuevo":
      return `${a.nombre ?? "Alguien"} entró por primera vez a Herramientas 👋`;
    case "presentacion": {
      const mes = a.mes ? ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][a.mes - 1] : "";
      return `${quien ?? "Alguien"} arrancó ${a.titulo ? `«${a.titulo}»` : `una presentación${marca ? ` de ${marca}` : ""}`}${mes ? ` (${mes})` : ""}`;
    }
  }
}

function LoUltimo({ d }: { d: DatosInicio }) {
  const [items, setItems] = useState<Actividad[] | null>(null);
  useEffect(() => {
    actividadDelEstudio().then(setItems);
  }, []);

  // Muchos clientes nuevos el mismo día (una importación) van en una sola fila.
  const filas: (Actividad & { varios?: string[] })[] = [];
  for (const a of items ?? []) {
    const ant = filas[filas.length - 1];
    if (a.tipo === "cliente" && ant?.tipo === "cliente" && ant.cuando.slice(0, 10) === a.cuando.slice(0, 10)) {
      ant.varios = [...(ant.varios ?? [ant.titulo ?? ""]), a.titulo ?? ""];
      continue;
    }
    filas.push({ ...a });
  }

  return (
    <div className={cn(CAJA, "p-5")}>
      <h3 className="font-display text-[1.8rem] leading-none">Lo último que pasó</h3>
      {!items ? (
        <div className="mt-4 space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-10 rounded-xl" />
          ))}
        </div>
      ) : !filas.length ? (
        <p className="mt-4 text-sm text-muted-foreground">Tranqui por acá: en las últimas semanas no se subió nada nuevo.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {filas.slice(0, 7).map((a, i) => {
            const marca = a.brand_id ? (d.marcaPorId.get(a.brand_id) ?? null) : null;
            const texto = a.varios && a.varios.length > 1 ? `Se sumaron ${a.varios.length} clientes: ${a.varios.slice(0, 3).join(", ")}${a.varios.length > 3 ? "…" : ""}` : textoDe(a, marca?.name ?? null);
            const href = a.tipo === "presentacion" && a.ref ? `/presentaciones/${a.ref}` : marca ? `/clientes/${marca.id}` : null;
            const cuerpo = (
              <>
                {a.tipo === "cliente" && marca ? (
                  <ClientMark brand={marca} className="h-8 w-8 rounded-lg text-[9px]" pad="p-[14%]" />
                ) : (
                  <Avatar nombre={a.nombre ?? "?"} avatar={a.avatar} size={32} />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] leading-snug">{texto}</span>
                  <span className="block text-[11.5px] text-muted-foreground">{hace(a.cuando)}</span>
                </span>
                {marca && a.tipo !== "cliente" && <ClientMark brand={marca} className="h-7 w-7 rounded-md text-[8px]" pad="p-[14%]" />}
              </>
            );
            return (
              <li key={`${a.tipo}${a.cuando}${i}`}>
                {href ? (
                  <Link href={href} className="flex items-start gap-3 hover:opacity-80">
                    {cuerpo}
                  </Link>
                ) : (
                  <span className="flex items-start gap-3">{cuerpo}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
