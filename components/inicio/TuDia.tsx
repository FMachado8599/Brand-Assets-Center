"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AtSign, CheckCircle2, ChevronRight } from "lucide-react";
import { ClientMark } from "@/components/clients/ClientMark";
import { marcarLeidas } from "@/hooks/useNotificaciones";
import { TONO } from "@/lib/board/flujo";
import { aISO, diasEntre, hoyISO, lunesDe, sumarDias } from "@/lib/inicio/fechas";
import { colorPrincipal } from "@/lib/inicio/marcas";
import { proximaVez, tipoFecha, tuSemana } from "@/lib/inicio/repo";
import { MOTIVO_LABEL, type Grupo } from "@/lib/notificaciones/prioridad";
import { fechaCorta, nombreDe } from "@/lib/perfil";
import { cn } from "@/lib/utils";
import { CAJA, Seccion, hace, primerNombre } from "./piezas";
import type { DatosInicio } from "./useInicio";

export function TuDia({ d }: { d: DatosInicio }) {
  return (
    <Seccion id="dia" titulo="Tu día">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <LoTuyo d={d} />
        <div className="grid min-w-0 grid-cols-1 content-start gap-3">
          <TuSemana d={d} />
          <Calendario d={d} />
        </div>
      </div>
    </Seccion>
  );
}

/* ───────────── Lo tuyo hoy ───────────── */

function LoTuyo({ d }: { d: DatosInicio }) {
  const router = useRouter();
  const tareas = d.misTareas.slice(0, 6);
  const menciones = d.avisos.grupos.filter((g) => g.noLeidas > 0 && (g.menciones > 0 || g.nivel === "ahora")).slice(0, 3);

  const abrirAviso = (g: Grupo) => {
    marcarLeidas(g.idsNoLeidas);
    const p = g.principal;
    if (p.enlace?.startsWith("/")) router.push(p.enlace);
    else if (p.app_url && p.origen === "basecamp") window.open(p.app_url, "_blank", "noopener,noreferrer");
    else if (p.tarea_id != null) router.push(`/board?tarea=${p.tarea_id}`);
  };

  const cargando = !d.flujo.loaded || !d.equipo.loaded;
  const sinBoard = d.equipo.sinMigracion || d.flujo.sinMigracion;

  return (
    <div className={cn(CAJA, "flex flex-col p-5")}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display text-[2rem] leading-none">Lo tuyo hoy</h3>
        <Link href="/board" className="inline-flex items-center gap-0.5 text-[13px] text-muted-foreground hover:text-foreground">
          Tu tablero <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {cargando ? (
        <div className="mt-4 space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-12 rounded-xl" />
          ))}
        </div>
      ) : sinBoard ? (
        <p className="mt-4 text-sm text-muted-foreground">El Board todavía no está conectado en este entorno: acá vas a ver tus tareas que vencen.</p>
      ) : !d.yo ? (
        <p className="mt-4 text-sm text-muted-foreground">Tu cuenta todavía no está en el equipo del Board: cuando un admin te sume, acá aparecen tus tareas.</p>
      ) : !tareas.length ? (
        <div className="mt-4 flex items-center gap-3 rounded-xl bg-foreground/[0.04] p-4">
          <CheckCircle2 className="h-6 w-6 shrink-0" style={{ color: TONO.finalizada.fg }} />
          <p className="text-sm">No tenés nada abierto a tu nombre. Día ideal para adelantar algo… o para un dino.</p>
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-foreground/[0.07]">
          {tareas.map(({ t, tono, fecha, valida }) => {
            const marca = t.brand_id ? d.marcaPorId.get(t.brand_id) : null;
            return (
              <li key={t.id}>
                <Link href={`/board?tarea=${t.id}`} className="group flex items-center gap-3 py-2.5">
                  {marca ? (
                    <ClientMark brand={marca} className="h-9 w-9 rounded-lg text-[9px]" pad="p-[14%]" />
                  ) : (
                    <span className="h-9 w-9 shrink-0 rounded-lg bg-foreground/[0.06]" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium group-hover:underline">{t.titulo}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {marca?.name ?? t.proyecto}
                      {t.tablero ? ` · ${t.tablero}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-medium" style={{ background: TONO[tono].bg, color: TONO[tono].fg }}>
                    {valida ? "Validar" : TONO[tono].label}
                    {fecha && <span className="hidden sm:inline"> · {fechaCorta(fecha)}</span>}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {d.misTareas.length > tareas.length && (
        <Link href="/board" className="mt-2 text-[13px] text-muted-foreground hover:text-foreground">
          Y {d.misTareas.length - tareas.length} más en tu tablero →
        </Link>
      )}

      {menciones.length > 0 && (
        <div className="mt-5 border-t border-foreground/[0.07] pt-4">
          <p className="eyebrow mb-2 flex items-center gap-1.5">
            <AtSign className="h-3 w-3" /> Te buscan
          </p>
          <ul className="space-y-1">
            {menciones.map((g) => (
              <li key={g.clave}>
                <button type="button" onClick={() => abrirAviso(g)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-foreground/[0.04]">
                  {g.ultima.brand_name ? (
                    <ClientMark
                      brand={{
                        name: g.ultima.brand_name,
                        color: g.ultima.brand_color ?? "#999",
                        logo_url: g.ultima.brand_logo_url,
                        logo_bg: (g.ultima.brand_logo_bg as "light" | "dark" | "brand" | null) ?? "light",
                        logo_from: g.ultima.brand_logo_from,
                      }}
                      className="h-8 w-8 rounded-lg text-[9px]"
                      pad="p-[14%]"
                    />
                  ) : (
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
                      <AtSign className="h-4 w-4" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{g.principal.titulo ?? g.ultima.proyecto ?? "Basecamp"}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {MOTIVO_LABEL[g.motivo]}
                      {g.autores[0] ? ` · ${g.autores[0]}` : ""} · {hace(g.fecha)}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ───────────── Tu semana ───────────── */

function TuSemana({ d }: { d: DatosInicio }) {
  const [semana, setSemana] = useState<{ cerradas: number; movidas: number } | null>(null);
  const yoId = d.yo?.id ?? null;
  useEffect(() => {
    if (!yoId) return;
    tuSemana(yoId, lunesDe()).then(setSemana);
  }, [yoId]);
  if (!d.yo) return null;

  const pendientes = d.misTareas.length;
  const cerradas = semana?.cerradas ?? 0;
  const total = cerradas + pendientes;
  const parte = total ? cerradas / total : 0;
  const frase =
    !semana ? "Contando…" : !cerradas && !pendientes ? "Semana tranquila." : !cerradas ? "Todavía no cerraste ninguna esta semana. ¡Vamos!" : parte >= 0.6 ? "Semana redonda. 🔥" : parte >= 0.3 ? "Vas bien." : "Arrancando.";

  return (
    <div className={cn(CAJA, "p-5")}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display text-[1.6rem] leading-none">Tu semana</h3>
        <span className="text-[13px] text-muted-foreground">{frase}</span>
      </div>
      <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-foreground/[0.07]">
        <div className="h-full rounded-full transition-[width] duration-700 ease-smooth" style={{ width: `${Math.round(parte * 100)}%`, background: TONO.finalizada.fg }} />
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <span>
          <strong className="font-semibold tabular-nums">{cerradas}</strong> <span className="text-muted-foreground">cerradas</span>
        </span>
        <span>
          <strong className="font-semibold tabular-nums">{pendientes}</strong> <span className="text-muted-foreground">abiertas</span>
        </span>
        {semana && semana.movidas > cerradas && (
          <span>
            <strong className="font-semibold tabular-nums">{semana.movidas - cerradas}</strong> <span className="text-muted-foreground">avanzaste de etapa</span>
          </span>
        )}
      </div>
    </div>
  );
}

/* ───────────── Calendario de dos semanas ───────────── */

type Cosa = { id: string; texto: string; color: string; emoji?: string; href?: string };

function Calendario({ d }: { d: DatosInicio }) {
  const hoy = hoyISO();
  const lunes = lunesDe();
  const dias = useMemo(() => Array.from({ length: 14 }, (_, i) => aISO(sumarDias(lunes, i))), [lunes.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps
  const [elegido, setElegido] = useState(hoy);

  const porDia = useMemo(() => {
    const m = new Map<string, Cosa[]>();
    const sumar = (dia: string, c: Cosa) => m.set(dia, [...(m.get(dia) ?? []), c]);
    for (const { t, fecha } of d.misTareas) {
      if (!fecha) continue;
      const marca = t.brand_id ? d.marcaPorId.get(t.brand_id) : null;
      sumar(fecha < hoy ? hoy : fecha, { id: `t${t.id}`, texto: t.titulo, color: marca ? colorPrincipal(marca) : "#888", href: `/board?tarea=${t.id}` });
    }
    const mias = new Set(d.misMarcas.map((x) => x.brand.id));
    for (const f of d.fechas) {
      if (!mias.has(f.brand_id)) continue;
      const cuando = proximaVez(f, dias[0]);
      if (!cuando) continue;
      const marca = d.marcaPorId.get(f.brand_id);
      sumar(cuando, { id: `f${f.id}`, texto: `${marca?.name ?? ""}: ${f.titulo}`, color: marca ? colorPrincipal(marca) : "#888", emoji: tipoFecha(f.tipo).emoji, href: `/clientes/${f.brand_id}` });
    }
    for (const x of diasEntre(dias[0], dias[13])) sumar(x.fecha, { id: `e${x.fecha}${x.nombre}`, texto: x.nombre, color: "transparent", emoji: x.tipo === "marketing" ? "📣" : "🇺🇾" });
    for (const c of d.celebraciones) {
      if (c.tipo !== "cumple") continue;
      const dia = aISO(sumarDias(new Date(), c.dias));
      sumar(dia, { id: `c${c.persona.id}`, texto: `Cumple ${primerNombre(nombreDe(c.persona.perfil, c.persona.nombre))}`, color: "transparent", emoji: "🎂" });
    }
    return m;
  }, [d.misTareas, d.marcaPorId, d.misMarcas, d.fechas, d.celebraciones, dias, hoy]);

  const delDia = porDia.get(elegido) ?? [];
  return (
    <div className={cn(CAJA, "p-5")}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display text-[1.6rem] leading-none">Estas dos semanas</h3>
        <span className="text-[13px] text-muted-foreground">Entregas, fechas y feriados</span>
      </div>
      <div className="mt-4 grid grid-cols-7 gap-1 text-center">
        {["L", "M", "M", "J", "V", "S", "D"].map((x, i) => (
          <span key={i} className="pb-1 text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            {x}
          </span>
        ))}
        {dias.map((dia) => {
          const cosas = porDia.get(dia) ?? [];
          const feriado = cosas.some((c) => c.emoji === "🇺🇾");
          const pasado = dia < hoy;
          return (
            <button
              key={dia}
              type="button"
              onClick={() => setElegido(dia)}
              className={cn(
                "relative flex aspect-square flex-col items-center justify-center rounded-xl text-sm transition-colors",
                dia === elegido ? "bg-ink text-cream dark:bg-cream dark:text-ink" : "hover:bg-foreground/[0.05]",
                dia === hoy && dia !== elegido && "ring-1 ring-inset ring-foreground/40",
                pasado && dia !== elegido && "text-muted-foreground/60",
                feriado && dia !== elegido && "text-[color:var(--tono-vencida)]"
              )}
            >
              <span className="tabular-nums">{Number(dia.slice(8))}</span>
              <span className="mt-0.5 flex h-1.5 gap-[2px]">
                {cosas.slice(0, 4).map((c) =>
                  c.color === "transparent" ? (
                    <span key={c.id} className="h-1.5 w-1.5 rounded-full bg-primary" />
                  ) : (
                    <span key={c.id} className="h-1.5 w-1.5 rounded-full" style={{ background: c.color }} />
                  )
                )}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-3 min-h-[3rem] border-t border-foreground/[0.07] pt-3">
        <p className="eyebrow mb-1.5">{elegido === hoy ? "Hoy" : fechaCorta(elegido)}</p>
        {!delDia.length ? (
          <p className="text-sm text-muted-foreground">Nada anotado.</p>
        ) : (
          <ul className="space-y-1">
            {delDia.map((c) => {
              const cuerpo = (
                <>
                  {c.emoji ? <span aria-hidden className="w-4 text-center">{c.emoji}</span> : <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c.color }} />}
                  <span className="truncate">{c.texto}</span>
                </>
              );
              return (
                <li key={c.id} className="text-sm">
                  {c.href ? (
                    <Link href={c.href} className="flex items-center gap-2 hover:underline">
                      {cuerpo}
                    </Link>
                  ) : (
                    <span className="flex items-center gap-2">{cuerpo}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

