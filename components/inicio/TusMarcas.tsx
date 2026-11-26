"use client";

import { useMemo, useState, type DragEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Check, Copy, Crosshair, Download, GripVertical, PenLine, Pin, Plus, Search, SquareKanban, X } from "lucide-react";
import { ClientMark } from "@/components/clients/ClientMark";
import { SocialIcon } from "@/components/clients/SocialIcon";
import { abrirPerfil } from "@/components/perfil/abrir";
import { FotoPerfil } from "@/components/perfil/piezas";
import { MarcasDialog } from "@/components/tareas/equipo/MarcasDialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/components/ui/toaster";
import { Hint } from "@/components/ui/tooltip";
import { TONO } from "@/lib/board/flujo";
import { copyPlain } from "@/lib/cards/clipboard";
import { inkOn } from "@/lib/clients/color";
import { downloadLogoFile } from "@/lib/clients/logos";
import { socialLabel, socialUrl } from "@/lib/clients/socials";
import { diasHasta } from "@/lib/inicio/fechas";
import { colorPrincipal, coloresDe, logoParaBajar } from "@/lib/inicio/marcas";
import { tipoFecha } from "@/lib/inicio/repo";
import { fechaCorta, fotoElegida, fueraDeOficina, nombreDe } from "@/lib/perfil";
import { fold } from "@/lib/redaccion/text";
import { cn } from "@/lib/utils";
import { useMarcaActiva } from "./MarcaActiva";
import { BOTON_CHICO, CAJA, Seccion, useAjustesInicio } from "./piezas";
import type { DatosInicio, MiMarca } from "./useInicio";

/**
 * Tus marcas: las que te designaron en el Board y las que sumaste. La de más movimiento va grande
 * ("en foco"); cada una con sus colores, sus acciones rápidas, su gente y lo próximo que se viene.
 */
export function TusMarcas({ d }: { d: DatosInicio }) {
  const { ajustes, cambiar, acomodando } = useAjustesInicio();
  const [elegir, setElegir] = useState(false);
  const foco = d.foco?.marca ?? null;
  const resto = d.misMarcas.filter((m) => m.brand.id !== foco?.brand.id);
  const [arrastrada, setArrastrada] = useState<string | null>(null);

  const soltarSobre = (destino: string) => {
    if (!arrastrada || arrastrada === destino) return;
    const ids = d.misMarcas.map((m) => m.brand.id).filter((id) => id !== arrastrada);
    ids.splice(ids.indexOf(destino), 0, arrastrada);
    cambiar({ marcasOrden: ids });
    setArrastrada(null);
  };

  const sacar = (m: MiMarca) =>
    cambiar((a) =>
      m.fijada ? { marcasFijadas: a.marcasFijadas.filter((x) => x !== m.brand.id) } : { marcasOcultas: [...a.marcasOcultas, m.brand.id] }
    );

  const extra = (
    <>
      {d.yo && d.equipo.data && (
        <button type="button" onClick={() => setElegir(true)} className={BOTON_CHICO}>
          Tus designaciones
        </button>
      )}
      <SumarMarca d={d} />
      {acomodando && ajustes.marcasOcultas.length > 0 && (
        <button type="button" onClick={() => cambiar({ marcasOcultas: [] })} className={BOTON_CHICO}>
          Volver a mostrar {ajustes.marcasOcultas.length}
        </button>
      )}
    </>
  );

  return (
    <Seccion id="marcas" titulo="Tus marcas" extra={extra}>
      {!d.misMarcas.length ? (
        <div className={cn(CAJA, "flex flex-col items-start gap-3 p-6 sm:flex-row sm:items-center")}>
          <p className="max-w-xl text-sm text-muted-foreground">
            {d.cargandoClientes || !d.equipo.loaded
              ? "Buscando tus marcas…"
              : "Todavía no tenés marcas. Elegí en cuáles sos designado (o sumá las que quieras) y acá vas a tener sus colores, su logo, su gente y sus tareas a un click."}
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {foco && (
            <li className="sm:col-span-2 lg:row-span-2">
              <MarcaGrande m={foco} motivo={d.foco!.motivo} />
            </li>
          )}
          {resto.map((m) => (
              <li
                key={m.brand.id}
                draggable={acomodando}
                onDragStart={(e: DragEvent) => {
                  setArrastrada(m.brand.id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => acomodando && arrastrada && e.preventDefault()}
                onDrop={() => soltarSobre(m.brand.id)}
                onDragEnd={() => setArrastrada(null)}
                className={cn(arrastrada === m.brand.id && "opacity-40")}
              >
                <MarcaChica m={m} acomodando={acomodando} onSacar={() => sacar(m)} />
              </li>
          ))}
          {!resto.length && (
            <li className={cn(CAJA, "grid h-full min-h-[8rem] place-items-center p-5 text-center text-sm text-muted-foreground")}>
              Solo tenés esta. Sumá otras con «Sumar marca».
            </li>
          )}
        </ul>
      )}
      {elegir && d.yo && d.equipo.data && (
        <MarcasDialog persona={d.yo} data={d.equipo.data} marcas={d.clients} editable admin={d.equipo.admin} propia onClose={() => setElegir(false)} />
      )}
    </Seccion>
  );
}

/* ───────────── Acciones de una marca ───────────── */

function useAcciones(m: MiMarca) {
  const router = useRouter();
  const { marcaId, setMarca } = useMarcaActiva();
  const b = m.brand;
  const hex = colorPrincipal(b);
  const logo = logoParaBajar(b);
  const activa = marcaId === b.id;
  return {
    hex,
    activa,
    copiarHex: async () => {
      await copyPlain(hex);
      toast(`${hex} copiado`);
    },
    bajarLogo: logo.url
      ? async () => {
          await downloadLogoFile(logo.url!, logo.nombre);
          toast(`Bajando ${logo.nombre}`);
        }
      : null,
    redaccion: () => router.push(`/redaccion?cliente=${b.id}`),
    board: () => router.push(`/board?marca=${b.id}`),
    modoMarca: () => {
      setMarca(activa ? null : b.id);
      toast(activa ? "Modo marca apagado" : `Modo marca: ${b.name}. Redacción, Tarjetas, Ads y Presentaciones arrancan con ella.`);
    },
  };
}

const ICONO = "grid h-9 w-9 place-items-center rounded-full border border-foreground/[0.12] bg-card transition-colors hover:border-foreground/30 disabled:opacity-40";

function Acciones({ m, grande = false }: { m: MiMarca; grande?: boolean }) {
  const a = useAcciones(m);
  const botones = [
    { label: `Copiar ${a.hex}`, icono: Copy, onClick: a.copiarHex },
    { label: a.bajarLogo ? "Bajar el logo" : "Sin logo cargado", icono: Download, onClick: a.bajarLogo ?? undefined, disabled: !a.bajarLogo },
    { label: "Escribir en Redacción", icono: PenLine, onClick: a.redaccion },
    { label: "Sus tareas en el Board", icono: SquareKanban, onClick: a.board },
  ];
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {botones.map((x) => {
        const Icono = x.icono;
        return (
          <Hint key={x.label} label={x.label}>
            <button type="button" onClick={x.onClick} disabled={x.disabled} aria-label={x.label} className={ICONO}>
              <Icono className="h-4 w-4" />
            </button>
          </Hint>
        );
      })}
      <Hint label={a.activa ? "Apagar el modo marca" : "Modo marca: toda la app arranca con esta marca"}>
        <button
          type="button"
          onClick={a.modoMarca}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium transition-colors",
            a.activa ? "border-transparent bg-primary text-primary-foreground" : "border-foreground/[0.12] bg-card hover:border-foreground/30",
            !grande && "px-2.5"
          )}
        >
          {a.activa ? <Check className="h-4 w-4" /> : <Crosshair className="h-4 w-4" />}
          {grande || a.activa ? (a.activa ? "Modo marca" : "Modo marca") : null}
        </button>
      </Hint>
    </div>
  );
}

function Colores({ m, max = 6 }: { m: MiMarca; max?: number }) {
  const colores = coloresDe(m.brand).slice(0, max);
  return (
    <div className="flex items-center gap-1">
      {colores.map((c) => (
        <Hint key={c.hex} label={`${c.name ? `${c.name} · ` : ""}${c.hex} · copiar`}>
          <button
            type="button"
            onClick={async () => {
              await copyPlain(c.hex);
              toast(`${c.hex} copiado`);
            }}
            aria-label={`Copiar ${c.hex}`}
            className="h-6 w-6 rounded-full ring-1 ring-inset ring-foreground/15 transition-transform hover:scale-110"
            style={{ background: c.hex }}
          />
        </Hint>
      ))}
    </div>
  );
}

function Gente({ m, max = 5 }: { m: MiMarca; max?: number }) {
  if (!m.companeros.length) return null;
  const visibles = m.companeros.slice(0, max);
  return (
    <div className="flex items-center">
      <div className="flex -space-x-2">
        {visibles.map(({ persona, sector }) => {
          const fuera = fueraDeOficina(persona.perfil);
          const nombre = nombreDe(persona.perfil, persona.nombre);
          return (
            <Hint key={persona.id + sector} label={`${nombre} · ${sector}${fuera ? ` · fuera hasta el ${fechaCorta(fuera)}` : ""}`}>
              <button type="button" onClick={() => abrirPerfil(persona.id)} className={cn("rounded-full ring-2 ring-card", fuera && "opacity-45 grayscale")}>
                <FotoPerfil nombre={nombre} url={fotoElegida(persona.perfil, persona.avatar_bc) ?? persona.avatar_url} size={28} fuera={Boolean(fuera)} />
              </button>
            </Hint>
          );
        })}
      </div>
      {m.companeros.length > max && <span className="ml-2 text-xs text-muted-foreground">+{m.companeros.length - max}</span>}
    </div>
  );
}

function ProximaFecha({ m }: { m: MiMarca }) {
  const f = m.proximaFecha;
  if (!f) return null;
  const n = diasHasta(f.cuando);
  const t = tipoFecha(f.tipo);
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full bg-foreground/[0.05] px-2.5 py-1 text-[12px]">
      <span aria-hidden>{t.emoji}</span>
      <span className="min-w-0 truncate">{f.titulo}</span>
      <span className="shrink-0 whitespace-nowrap text-muted-foreground">· {n === 0 ? "hoy" : n === 1 ? "mañana" : `en ${n} días`}</span>
    </span>
  );
}

function Contadores({ m }: { m: MiMarca }) {
  if (!m.tareas.length && !m.avisos) return <span className="text-xs text-muted-foreground">Nada urgente</span>;
  return (
    <span className="flex flex-wrap items-center gap-1.5 text-[12px]">
      {m.vencidas > 0 && (
        <span className="rounded-full px-2 py-0.5 font-medium" style={{ background: TONO.vencida.bg, color: TONO.vencida.fg }}>
          {m.vencidas} {m.vencidas === 1 ? "vencida" : "vencidas"}
        </span>
      )}
      {m.pronto > 0 && (
        <span className="rounded-full px-2 py-0.5 font-medium" style={{ background: TONO.pronto.bg, color: TONO.pronto.fg }}>
          {m.pronto} pronto
        </span>
      )}
      {m.tareas.length - m.vencidas - m.pronto > 0 && (
        <span className="rounded-full bg-foreground/[0.05] px-2 py-0.5">{m.tareas.length - m.vencidas - m.pronto} en curso</span>
      )}
      {m.avisos > 0 && <span className="rounded-full bg-foreground/[0.05] px-2 py-0.5">{m.avisos} sin leer</span>}
    </span>
  );
}

/* ───────────── La grande (en foco) ───────────── */

function MarcaGrande({ m, motivo }: { m: MiMarca; motivo: string }) {
  const b = m.brand;
  const hex = colorPrincipal(b);
  const tinta = inkOn(hex);
  return (
    <article className={cn(CAJA, "relative flex h-full flex-col overflow-hidden")}>
      <div className="relative flex items-end gap-4 px-5 pb-5 pt-6" style={{ background: hex, color: tinta }}>
        <ClientMark brand={b} className="h-20 w-20 rounded-2xl text-lg shadow-lg ring-2 ring-white/20" pad="p-[14%]" />
        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] opacity-70">En foco · {motivo}</p>
          <h3 className="mt-1 truncate font-display text-[2.6rem] leading-none tracking-[-0.02em]">{b.name}</h3>
          {m.sectores.length > 0 && <p className="mt-1 truncate text-[13px] opacity-75">Sos {m.sectores.join(" y ").toLowerCase()}</p>}
        </div>
        <Link href={`/clientes/${b.id}`} aria-label={`La ficha de ${b.name}`} className="grid h-10 w-10 shrink-0 place-items-center rounded-full transition-transform hover:rotate-45" style={{ background: `${tinta}1f` }}>
          <ArrowUpRight className="h-5 w-5" />
        </Link>
      </div>
      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Colores m={m} max={8} />
          <Acciones m={m} grande />
        </div>
        {m.tareas.length > 0 && (
          <ul className="divide-y divide-foreground/[0.07] rounded-xl border border-foreground/[0.07]">
            {m.tareas.slice(0, 4).map(({ t, tono, fecha, valida }) => (
              <li key={t.id}>
                <Link href={`/board?tarea=${t.id}`} className="flex items-center gap-3 px-3 py-2.5 hover:bg-foreground/[0.03]">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: TONO[tono].fg }} />
                  <span className="min-w-0 flex-1 truncate text-sm">{t.titulo}</span>
                  <span className="shrink-0 text-xs" style={{ color: TONO[tono].fg }}>
                    {valida ? "Validar" : TONO[tono].label}
                    {fecha ? ` · ${fechaCorta(fecha)}` : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Contadores m={m} />
            <ProximaFecha m={m} />
          </div>
          <div className="flex items-center gap-3">
            <Redes m={m} />
            <Gente m={m} />
          </div>
        </div>
      </div>
    </article>
  );
}

function Redes({ m }: { m: MiMarca }) {
  const redes = (m.brand.socials ?? []).slice(0, 4);
  if (!redes.length) return null;
  return (
    <div className="flex items-center gap-1">
      {redes.map((s) => (
        <Hint key={`${s.network}:${s.handle}`} label={socialLabel(s)}>
          <a href={socialUrl(s)} target="_blank" rel="noopener noreferrer" className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground">
            <SocialIcon network={s.network} className="h-4 w-4" />
          </a>
        </Hint>
      ))}
    </div>
  );
}

/* ───────────── Las chicas ───────────── */

function MarcaChica({ m, acomodando, onSacar }: { m: MiMarca; acomodando: boolean; onSacar: () => void }) {
  const b = m.brand;
  return (
    <article className={cn(CAJA, "flex h-full flex-col gap-3 p-4", acomodando && "cursor-grab active:cursor-grabbing")}>
      <div className="flex items-start gap-3">
        {acomodando && <GripVertical className="mt-3 h-4 w-4 shrink-0 text-muted-foreground" />}
        <Link href={`/clientes/${b.id}`} className="shrink-0">
          <ClientMark brand={b} className="h-12 w-12 rounded-xl text-xs" pad="p-[14%]" />
        </Link>
        <div className="min-w-0 flex-1">
          <Link href={`/clientes/${b.id}`} className="block truncate font-display text-[1.6rem] leading-tight hover:underline">
            {b.name}
          </Link>
          <p className="truncate text-xs text-muted-foreground">
            {m.fijada ? (
              <span className="inline-flex items-center gap-1">
                <Pin className="h-3 w-3" /> La sumaste vos
              </span>
            ) : (
              m.sectores.join(" · ")
            )}
          </p>
        </div>
        {acomodando ? (
          <Hint label="Sacarla del Inicio">
            <button type="button" onClick={onSacar} aria-label={`Sacar ${b.name}`} className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-foreground/5">
              <X className="h-4 w-4" />
            </button>
          </Hint>
        ) : (
          <Colores m={m} max={3} />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Contadores m={m} />
        <ProximaFecha m={m} />
      </div>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
        <Acciones m={m} />
        <Gente m={m} max={3} />
      </div>
    </article>
  );
}

/* ───────────── Sumar una marca a mano ───────────── */

function SumarMarca({ d }: { d: DatosInicio }) {
  const { ajustes, cambiar } = useAjustesInicio();
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState(false);
  const mias = new Set(d.misMarcas.map((m) => m.brand.id));
  const opciones = useMemo(() => {
    const t = fold(q.trim());
    return d.clients.filter((c) => !mias.has(c.id) && (!t || fold(c.name).includes(t))).slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, d.clients, d.misMarcas]);

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger asChild>
        <button type="button" className={BOTON_CHICO}>
          <Plus className="h-3.5 w-3.5" /> Sumar marca
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-2">
        <div className="flex items-center gap-2 rounded-lg border px-2.5">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cliente…" className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none focus-visible:ring-0 focus-visible:ring-offset-0" />
        </div>
        <ul className="mt-1 max-h-72 overflow-y-auto">
          {opciones.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => {
                  cambiar({
                    marcasFijadas: [...ajustes.marcasFijadas.filter((x) => x !== c.id), c.id],
                    marcasOcultas: ajustes.marcasOcultas.filter((x) => x !== c.id),
                  });
                  toast(`${c.name} quedó en tus marcas`);
                  setAbierto(false);
                  setQ("");
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-foreground/5"
              >
                <ClientMark brand={c} className="h-7 w-7 rounded-lg text-[9px]" pad="p-[14%]" />
                <span className="truncate">{c.name}</span>
                <span className="ml-auto h-3 w-3 shrink-0 rounded-full" style={{ background: c.color }} />
              </button>
            </li>
          ))}
          {!opciones.length && <li className="px-2 py-3 text-center text-sm text-muted-foreground">No hay más con ese nombre.</li>}
        </ul>
        {ajustes.marcasOcultas.length > 0 && (
          <button
            type="button"
            onClick={() => cambiar({ marcasOcultas: [] })}
            className="mt-1 w-full rounded-lg px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-foreground/5"
          >
            Volver a mostrar las {ajustes.marcasOcultas.length} que sacaste
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

