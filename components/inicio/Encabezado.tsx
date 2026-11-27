"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Loader2,
  Moon,
  RefreshCw,
  Sparkles,
  Sun,
} from "lucide-react";
import { ClientMark } from "@/components/clients/ClientMark";
import { inkOn } from "@/lib/clients/color";
import { cuentasRegresivas, hoyISO } from "@/lib/inicio/fechas";
import { colorPrincipal } from "@/lib/inicio/marcas";
import { fechaLarga, saludoDe } from "@/lib/inicio/saludo";
import { STUDIO } from "@/lib/site";
import { cn } from "@/lib/utils";
import { Confeti } from "./Confeti";
import { BarraRapida } from "./Rapido";
import { primerNombre, useAjustesInicio } from "./piezas";
import type { DatosInicio } from "./useInicio";

/**
 * Arriba de todo: el saludo (cambia con la hora y el día), la fecha, el clima de Montevideo y las
 * cuentas regresivas. Lo tiñe el color de la marca en foco; los viernes después de las 17 se pone
 * amarillo. Abajo, la barra rápida (pegar un link, un HEX o soltar un archivo) y el resumen del día.
 */
export function Encabezado({ d, acciones }: { d: DatosInicio; acciones: (viernes: boolean) => ReactNode }) {
  const { ajustes } = useAjustesInicio();
  // La hora es la del navegador: se arma después de montar (el servidor no la sabe).
  const [ahora, setAhora] = useState<Date | null>(null);
  useEffect(() => {
    setAhora(new Date());
    const id = window.setInterval(() => setAhora(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const nombre = primerNombre(d.nombre);
  const saludo = ahora ? saludoDe(nombre || null, ahora, { cumple: d.cumpleHoy }) : null;
  const viernes = Boolean(saludo?.viernes);
  const cuentas = useMemo(() => (ahora ? cuentasRegresivas(ahora, ajustes.vacaciones) : []), [ahora, ajustes.vacaciones]);
  const foco = d.foco?.marca.brand ?? null;
  const tinte = foco ? colorPrincipal(foco) : null;

  return (
    <header
      className={cn(
        "relative isolate overflow-hidden rounded-[1.75rem] px-5 pb-5 pt-6 sm:px-8 sm:pb-7 sm:pt-8",
        viernes ? "bg-primary text-ink" : "grain bg-ink text-cream dark:ring-1 dark:ring-cream/10"
      )}
    >
      {/* El color de la marca en foco, como una luz desde la esquina. */}
      {!viernes && tinte && (
        <div
          aria-hidden
          className="pointer-events-none absolute -right-[18%] -top-[60%] -z-10 h-[150%] w-[75%] rounded-full opacity-60 blur-3xl transition-colors duration-700"
          style={{ background: `radial-gradient(closest-side, ${tinte}, transparent)` }}
        />
      )}
      {d.cumpleHoy && <Confeti />}

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className={cn("site-label", viernes ? "text-ink/60" : "text-cream/55")}>
          {STUDIO} <span className={viernes ? "text-ink" : "text-primary"}>\</span> {viernes ? "Modo viernes" : "Herramientas"}
        </p>
        <div className="flex items-center gap-2">
          <span className={cn("site-label h-[11px]", viernes ? "text-ink/60" : "text-cream/55")}>{ahora ? fechaLarga(ahora) : ""}</span>
          <Clima viernes={viernes} />
        </div>
      </div>

      <h1 className="mt-6 max-w-4xl text-balance font-display text-[clamp(2.5rem,6.5vw,5.25rem)] leading-[0.92] tracking-[-0.02em]">
        {saludo ? (
          <span className="duration-700 animate-in fade-in-0">
            {saludo.titulo} <em className={viernes ? "text-ink/45" : "text-cream/45"}>{saludo.bajada}</em>
          </span>
        ) : (
          <span className="opacity-0">Hola.</span>
        )}
      </h1>

      {/* La marca en foco y las cuentas regresivas. */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {d.foco && (
          <a
            href="#marcas"
            className="inline-flex h-9 items-center gap-2 rounded-full py-1 pl-1 pr-3 text-[13px] font-medium transition-transform hover:scale-[1.02]"
            style={{ background: tinte ?? undefined, color: tinte ? inkOn(tinte) : undefined }}
          >
            <ClientMark brand={d.foco.marca.brand} className="h-7 w-7 rounded-full text-[9px]" pad="p-[16%]" />
            <span>
              <span className="opacity-70">En foco:</span> {d.foco.marca.brand.name}
            </span>
          </a>
        )}
        {d.urgentes.length > 0 && (
          <a
            href="#dia"
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium",
              viernes ? "bg-ink/10" : "bg-cream/10 text-cream/85 hover:bg-cream/15"
            )}
          >
            🔥 {d.urgentes.length} {d.urgentes.length === 1 ? "tarea vence" : "tareas vencen"} ya
          </a>
        )}
        {cuentas.map((c) => (
          <span
            key={c.id}
            className={cn("inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px]", viernes ? "bg-ink/10" : "bg-cream/10 text-cream/80")}
          >
            <span aria-hidden>{c.emoji}</span> {c.texto}
          </span>
        ))}
      </div>

      <div className="mt-6 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <BarraRapida oscuro={!viernes} />
        <div className="flex flex-wrap items-center gap-2">{acciones(viernes)}</div>
      </div>

      <Resumen d={d} viernes={viernes} />
    </header>
  );
}

/* ───────────── Clima ───────────── */

type Clima = {
  temperatura: number;
  codigo: number;
  deDia: boolean;
  hoy: { max: number | null; min: number | null; lluvia: number | null; codigo: number | null };
};

/** El ícono y el nombre del tiempo según el código WMO de Open-Meteo. */
function tiempo(codigo: number, deDia: boolean) {
  if (codigo === 0) return { Icono: deDia ? Sun : Moon, texto: "Despejado" };
  if (codigo <= 2) return { Icono: deDia ? CloudSun : CloudMoon, texto: "Algo nublado" };
  if (codigo === 3) return { Icono: Cloud, texto: "Nublado" };
  if (codigo === 45 || codigo === 48) return { Icono: CloudFog, texto: "Niebla" };
  if (codigo >= 51 && codigo <= 57) return { Icono: CloudDrizzle, texto: "Llovizna" };
  if ((codigo >= 61 && codigo <= 67) || (codigo >= 80 && codigo <= 82)) return { Icono: CloudRain, texto: "Lluvia" };
  if ((codigo >= 71 && codigo <= 77) || codigo === 85 || codigo === 86) return { Icono: CloudSnow, texto: "Nieve" };
  if (codigo >= 95) return { Icono: CloudLightning, texto: "Tormenta" };
  return { Icono: Cloud, texto: "" };
}

/** Lo que conviene saber antes de salir. */
export function avisoDelClima(c: Clima) {
  if ((c.hoy.lluvia ?? 0) >= 50 || (c.codigo >= 61 && c.codigo <= 82) || c.codigo >= 95) return "Llevá paraguas ☔";
  if ((c.hoy.max ?? c.temperatura) >= 30) return "Hidratate 🥵";
  if ((c.hoy.min ?? c.temperatura) <= 6) return "Abrigate 🧣";
  return null;
}

function Clima({ viernes }: { viernes: boolean }) {
  const [c, setC] = useState<Clima | null>(null);
  useEffect(() => {
    fetch("/api/inicio/clima")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && typeof j.temperatura === "number" && setC(j))
      .catch(() => {});
  }, []);
  if (!c) return null;
  const { Icono, texto } = tiempo(c.codigo, c.deDia);
  const aviso = avisoDelClima(c);
  return (
    <span
      title={`${texto} en Montevideo${c.hoy.max != null ? ` · máx. ${Math.round(c.hoy.max)}° mín. ${Math.round(c.hoy.min ?? 0)}°` : ""}`}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-medium duration-500 animate-in fade-in-0",
        viernes ? "bg-ink/10" : "bg-cream/10 text-cream/85"
      )}
    >
      <Icono className="h-4 w-4" />
      {Math.round(c.temperatura)}°
      {aviso && <span className={cn("hidden sm:inline", viernes ? "text-ink/70" : "text-cream/60")}>· {aviso}</span>}
    </span>
  );
}

/* ───────────── Resumen con IA ───────────── */

/** Lo que se le pasa a la IA: lo mismo que ya muestra el Inicio, en frases cortas. */
function hechosDe(d: DatosInicio) {
  const hechos: string[] = [];
  const nombreMarca = (id: string | null) => (id ? (d.marcaPorId.get(id)?.name ?? null) : null);
  for (const m of d.misTareas.slice(0, 6)) {
    const marca = nombreMarca(m.t.brand_id) ?? m.t.proyecto;
    const cuando = m.tono === "vencida" ? "vencida" : m.tono === "pronto" ? "vence hoy o mañana" : m.fecha ? `entrega ${m.fecha}` : "sin fecha";
    hechos.push(`${m.valida ? "Tenés que validar" : "Tarea tuya"}: «${m.t.titulo}» (${marca}), ${cuando}.`);
  }
  if (d.misTareas.length > 6) hechos.push(`En total tenés ${d.misTareas.length} tareas abiertas.`);
  const menciones = d.avisos.grupos.filter((g) => g.noLeidas && g.menciones);
  if (menciones.length) hechos.push(`Tenés ${menciones.length} ${menciones.length === 1 ? "mención" : "menciones"} sin leer en Basecamp.`);
  for (const c of d.celebraciones.filter((x) => x.dias === 0)) {
    const n = primerNombre(c.persona.perfil?.nombre_visible || c.persona.nombre);
    if (c.tipo === "cumple") hechos.push(`Hoy cumple años ${n}.`);
    if (c.tipo === "aniversario") hechos.push(`Hoy ${n} cumple ${c.anios} ${c.anios === 1 ? "año" : "años"} en el estudio.`);
  }
  for (const f of d.fuera.slice(0, 4)) hechos.push(`${primerNombre(f.persona.perfil?.nombre_visible || f.persona.nombre)} está fuera de oficina hasta el ${f.hasta}.`);
  if (d.foco && d.foco.motivo !== "La marca del día") hechos.push(`La marca con más movimiento hoy es ${d.foco.marca.brand.name} (${d.foco.motivo}).`);
  return hechos;
}

function Resumen({ d, viernes }: { d: DatosInicio; viernes: boolean }) {
  const clave = `inicio:resumen:${hoyISO()}`;
  const [texto, setTexto] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      setTexto(sessionStorage.getItem(clave));
    } catch {
      /* sin almacenamiento */
    }
  }, [clave]);

  const listo = d.equipo.loaded && d.flujo.loaded;
  const pedir = async () => {
    const hechos = hechosDe(d);
    if (!hechos.length) {
      setTexto("Hoy no hay nada urgente a tu nombre. Buen día para adelantar algo (o para un dino en Rest).");
      return;
    }
    setCargando(true);
    setError(null);
    try {
      const r = await fetch("/api/inicio/resumen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hechos, nombre: primerNombre(d.nombre) }),
      });
      const j = (await r.json().catch(() => ({}))) as { texto?: string; error?: string };
      if (!r.ok || !j.texto) throw new Error(j.error ?? "No se pudo armar el resumen");
      setTexto(j.texto);
      try {
        sessionStorage.setItem(clave, j.texto);
      } catch {
        /* sin almacenamiento */
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className={cn("mt-5 border-t pt-4", viernes ? "border-ink/15" : "border-cream/10")}>
      {texto ? (
        <div className="flex items-start gap-3">
          <Sparkles className={cn("mt-1 h-4 w-4 shrink-0", viernes ? "text-ink" : "text-primary")} />
          <p className={cn("max-w-3xl text-[15px] leading-relaxed", viernes ? "text-ink/80" : "text-cream/80")}>{texto}</p>
          <button
            type="button"
            onClick={pedir}
            disabled={cargando}
            aria-label="Volver a resumir"
            title="Volver a resumir"
            className={cn("ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-full transition-colors", viernes ? "hover:bg-ink/10" : "text-cream/50 hover:bg-cream/10 hover:text-cream")}
          >
            {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={pedir}
            disabled={cargando || !listo}
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-full px-4 text-[13px] font-semibold transition-transform hover:scale-[1.02] disabled:opacity-50",
              viernes ? "bg-ink text-cream" : "bg-primary text-primary-foreground"
            )}
          >
            {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {listo ? "Resumime el día" : "Mirando tu día…"}
          </button>
          <span className={cn("text-[13px]", viernes ? "text-ink/60" : "text-cream/50")}>
            {error ?? "Tus tareas, las menciones y quién está, en dos frases."}
          </span>
          {d.equipo.sinMigracion && (
            <Link href="/board" className="text-[13px] underline underline-offset-2">
              Sin el Board todavía
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
