"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CalendarPlus,
  Copy,
  Download,
  FileDown,
  FolderOpen,
  Link2,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Presentation,
  RefreshCw,
  Share2,
  Trash2,
} from "lucide-react";
import { MissingConfig } from "@/components/board/MissingConfig";
import { ClientMark } from "@/components/clients/ClientMark";
import {
  BarAction,
  BarButton,
  BarDivider,
  BarPopover,
  BarSegmented,
  ContextBar,
  PanelTitle,
} from "@/components/shell/ContextBar";
import { useConfirm } from "@/components/ui/confirm";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import { useClients } from "@/hooks/useClients";
import { useIntegraciones } from "@/hooks/useIntegraciones";
import { useComentarios } from "@/hooks/useComentarios";
import { usePlani } from "@/hooks/usePlani";
import { useStoredState } from "@/hooks/useStoredState";
import type { GuardadoEstado } from "@/hooks/usePlani";
import { Hint } from "@/components/ui/tooltip";
import { ESTADOS, FORMATOS, FORMATO_ORDEN, MESES, ROLES, TIPOS } from "@/lib/plani/config";
import { copyTexto } from "@/lib/plani/copy";
import { descargar, nombreArchivo } from "@/lib/plani/descargas";
import { enElMes, etiquetaArchivo, etiquetaDia, hoyISO, primerDiaLibre } from "@/lib/plani/fechas";
import { nombreScript, scriptIllustrator } from "@/lib/plani/illustrator";
import { planiRepo } from "@/lib/plani/repo";
import type { CategorySummary } from "@/lib/emojis/types";
import type { Formato, Medio, Pieza, Rol } from "@/lib/plani/types";
import { hasSupabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { BasecampMark, BasecampTarea, TareaPicker } from "../BasecampTarea";
import { FormatDot, medioUrl } from "../bits";
import { HiloComentarios, pendientes } from "../Comentarios";
import { PlaniEmojiProvider } from "../emojis";
import { Lightbox } from "../Lightbox";
import { Calendario, FeedGrid } from "../Overview";
import { RevealTitle } from "../Reveal";
import { EstadoStepper, NuevaPiezaMenu } from "./bits";
import { PiezaCard } from "./PiezaCard";

/** Lleva hasta un día o una pieza y la marca un momento. */
function irA(elId: string) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  el.animate([{ boxShadow: "0 0 0 0 hsl(49 100% 50% / 0)" }, { boxShadow: "0 0 0 6px hsl(49 100% 50% / 0.7)" }, { boxShadow: "0 0 0 0 hsl(49 100% 50% / 0)" }], {
    duration: 1400,
    delay: 350,
    easing: "ease-out",
  });
}

/**
 * Una plani abierta. Arriba, el mes en grande, la etapa y la tarea de Basecamp; después el
 * calendario y el feed como van a quedar; abajo, día por día, cada pieza con su mockup y lo que le
 * toca al rol elegido en la barra (redacción, diseño o CM).
 */
export function PlaniEditor({ id, categories }: { id: string; categories: CategorySummary[] }) {
  return (
    <PlaniEmojiProvider categories={categories}>
      <Editor id={id} />
    </PlaniEmojiProvider>
  );
}

/** Un link que no se adivina: 32 bytes al azar (la base pide al menos 32 caracteres). */
function nuevoToken() {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function Editor({ id }: { id: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const store = usePlani(id);
  const { plani, piezas, dias, loading, error, guardado } = store;
  const { clients, loading: clientsLoading } = useClients();
  const { basecampOk, data: integraciones } = useIntegraciones();
  const [rol, setRol] = useStoredState<Rol>("plani:rol", "redaccion");
  const [nuevaOpen, setNuevaOpen] = useState(false);
  // El día que se tocó en el calendario: la pieza nueva va ahí.
  const [nuevaFecha, setNuevaFecha] = useState<string | null>(null);
  const [pickTarea, setPickTarea] = useState(false);
  const [lightbox, setLightbox] = useState<{ medios: Medio[]; index: number } | null>(null);
  const [bajando, setBajando] = useState<number | null>(null);
  const comentarios = useComentarios(id);

  const brand = plani ? clients.find((c) => c.id === plani.brand_id) ?? null : null;

  useEffect(() => {
    if (plani && brand) document.title = `${brand.name} · ${MESES[plani.mes - 1]} ${plani.anio} · Planificación`;
  }, [plani, brand]);

  const porId = useMemo(() => new Map(piezas.map((p) => [p.id, p])), [piezas]);

  /** Las historias que adaptan otra pieza de la plani van adentro del bloque de esa pieza. */
  const adaptacionesDe = useMemo(() => {
    const map = new Map<string, Pieza[]>();
    for (const p of piezas) if (p.adapta_de && porId.has(p.adapta_de)) map.set(p.adapta_de, [...(map.get(p.adapta_de) ?? []), p]);
    return map;
  }, [piezas, porId]);
  const esAdaptacion = useCallback((p: Pieza) => !!p.adapta_de && porId.has(p.adapta_de), [porId]);

  /** Ir a una pieza (si es una adaptación, al bloque de la pieza que adapta). */
  const irAPieza = useCallback(
    (pid: string) => {
      const p = porId.get(pid);
      irA(`pieza-${p?.adapta_de && porId.has(p.adapta_de) ? p.adapta_de : pid}`);
    },
    [porId]
  );

  const otrosCopys = useMemo(() => piezas.map(copyTexto).filter(Boolean), [piezas]);

  const crear = useCallback(
    async (fecha: string, formato: Formato, extra: Partial<Pieza> = {}) => {
      const nueva = await store.addPieza(fecha, formato, extra);
      if (nueva) setTimeout(() => irA(`pieza-${extra.adapta_de ?? nueva.id}`), 80);
    },
    [store]
  );

  const borrar = useCallback(
    async (piezaId: string) => {
      const p = porId.get(piezaId);
      if (!p) return;
      const conMaterial = p.medios.length > 0;
      const ok = await confirm({
        title: "¿Eliminar la pieza?",
        description: conMaterial
          ? "Se borran sus copys e indicaciones. El material final queda en la carpeta del Drive."
          : "Se borran sus copys e indicaciones. No se puede deshacer.",
        confirmLabel: "Eliminar",
        destructive: true,
      });
      if (ok) store.removePieza(piezaId);
    },
    [porId, confirm, store]
  );

  const adaptar = useCallback(
    (piezaId: string) => {
      const p = porId.get(piezaId);
      if (!p) return;
      // Va en el mismo bloque, con el mismo título: es la misma pieza en otro formato.
      crear(p.fecha, "historia", {
        adapta_de: p.id,
        titulo: "",
        plataformas: ["instagram"],
        instrucciones:
          p.formato === "reel"
            ? "Compartir el reel en historia (o adaptarlo: mismo video con stickers)."
            : `Adaptación a historia.\n${p.formato === "carrusel" ? p.slides[0]?.instruccion ?? "" : p.instrucciones}`.trim(),
        referencias: p.referencias,
        assets: p.assets,
      });
    },
    [porId, crear]
  );

  const abrir = useCallback(
    (m: Medio, p: Pieza) => {
      const lista = p.medios.filter((x) => x.rol === "final");
      setLightbox({ medios: lista, index: Math.max(0, lista.findIndex((x) => x.id === m.id)) });
    },
    []
  );

  const descargarIllustrator = () => {
    if (!plani || !brand) return;
    if (!piezas.length) return toast("La plani todavía no tiene piezas", "error");
    const blob = new Blob([scriptIllustrator(plani, brand.name, piezas)], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = nombreScript(plani, brand.name);
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast("En Illustrator: Archivo → Secuencias de comandos → Otra secuencia de comandos… y elegí el .jsx");
  };

  /** Todo el material de la plani en un .zip, con una carpeta por día. */
  const descargarTodo = async () => {
    if (!plani || !brand || bajando !== null) return;
    const archivos = piezas.flatMap((p) => {
      const padre = p.adapta_de ? porId.get(p.adapta_de) : null;
      const titulo = p.titulo || padre?.titulo || "";
      return p.medios.map((m) => ({
        carpeta: `${etiquetaArchivo(p.fecha)} ${etiquetaDia(p.fecha).split(" ")[0]}`,
        nombre: nombreArchivo(p, m, titulo),
        url: medioUrl(m),
        tamano: m.tamano,
      }));
    });
    if (!archivos.length) return toast("Todavía no hay material subido", "error");
    setBajando(0);
    try {
      await descargar(archivos, `${brand.name} - ${MESES[plani.mes - 1]} ${plani.anio}`, setBajando);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBajando(null);
    }
  };

  const linkCliente = plani?.share_token && typeof window !== "undefined" ? `${window.location.origin}/p/${plani.share_token}` : "";
  const compartir = async (on: boolean) => {
    if (!plani) return;
    const ok = await store.updatePlani({ compartida: on, share_token: plani.share_token ?? nuevoToken() });
    if (ok) toast(on ? "Listo: el cliente ya puede ver la plani con su link" : "El link del cliente dejó de funcionar");
  };
  const nuevoLink = async () => {
    const ok = await confirm({
      title: "¿Cambiar el link del cliente?",
      description: "El link anterior deja de funcionar. Hay que mandarle el nuevo.",
      confirmLabel: "Cambiar",
    });
    if (ok && (await store.updatePlani({ share_token: nuevoToken(), compartida: true }))) toast("Link nuevo listo");
  };
  const copiarLink = async () => {
    try {
      await navigator.clipboard.writeText(linkCliente);
      toast("Link copiado");
    } catch {
      toast("No se pudo copiar", "error");
    }
  };

  const eliminarPlani = async () => {
    if (!plani || !brand) return;
    const ok = await confirm({
      title: `¿Eliminar la plani de ${MESES[plani.mes - 1]}?`,
      description: `Se borran sus ${piezas.length} piezas con copys e indicaciones. El material final queda en el Drive. No se puede deshacer.`,
      confirmLabel: "Eliminar",
      destructive: true,
    });
    if (!ok) return;
    const { error } = await planiRepo.remove(plani.id);
    if (error) return toast(error.message, "error");
    toast("Plani eliminada");
    router.push("/planificacion");
  };

  if (!hasSupabase) return <MissingConfig />;

  const sugerida = plani ? primerDiaLibre(plani.anio, plani.mes, new Set(piezas.map((p) => p.fecha))) : hoyISO();
  const conMaterial = piezas.filter((p) => p.medios.some((m) => m.rol === "final")).length;
  const programadas = piezas.filter((p) => p.programada).length;
  const aprobadas = piezas.filter((p) => p.estado_cliente === "aprobada").length;

  const bar = (
    <ContextBar>
      <BarButton label="Todas las planis" icon={ArrowLeft} onClick={() => router.push("/planificacion")} />
      {plani && brand && (
        <>
          <BarDivider />
          <span className="flex max-w-[12rem] items-center gap-2 px-1.5">
            <ClientMark brand={brand} className="h-7 w-7 rounded-full text-[10px]" pad="p-[18%]" />
            <span className="hidden truncate text-sm font-semibold tracking-tight text-cream lg:inline">
              {brand.name} · {MESES[plani.mes - 1]}
            </span>
          </span>
          <BarDivider />
          <BarSegmented<Rol> label="Ver como" value={rol} onChange={(v) => setRol(v)} options={ROLES.map((r) => ({ value: r.value, label: r.label }))} />
          <BarDivider />
          <BarButton label="Presentación" icon={Presentation} onClick={() => router.push(`/planificacion/${plani.id}/presentacion`)} />
          {rol === "diseno" ? (
            <BarButton label="Mesas de trabajo para Illustrator (.jsx)" icon={FileDown} onClick={descargarIllustrator} />
          ) : rol === "cm" ? (
            <BarButton
              label={bajando !== null ? `Bajando… ${Math.round(bajando * 100)}%` : "Bajar todo el material (.zip)"}
              icon={Download}
              glyph={bajando !== null ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : undefined}
              onClick={descargarTodo}
            />
          ) : (
            <BarButton label="Descargas: las mesas de Illustrator en Diseño y el material en CM" icon={Download} disabled />
          )}
          <BarPopover label="Comentarios" icon={MessageSquare} badge={pendientes(comentarios.items) || undefined} align="end" className="w-[24rem]">
            <PanelTitle title="Comentarios" hint="Los generales de la plani. Los de cada pieza, en su bloque." />
            <HiloComentarios
              comentarios={comentarios.porPieza.get("") ?? []}
              modo="estudio"
              yo={comentarios.yo}
              compacto
              onEnviar={(texto, paraCliente) => comentarios.comentar(null, texto, !paraCliente)}
              onResolver={comentarios.resolver}
              onBorrar={comentarios.borrar}
            />
            <PendientesEnPiezas piezas={piezas} porId={porId} porPieza={comentarios.porPieza} onIr={irAPieza} />
          </BarPopover>
          <BarPopover label="Más" icon={MoreHorizontal} align="end" className="w-72">
            <PanelTitle title="Plani" hint={`${TIPOS[plani.tipo].label} · ${MESES[plani.mes - 1]} ${plani.anio}`} />
            <div className="mb-3 rounded-xl bg-secondary/60 p-3">
              <div className="flex items-center gap-2">
                <Share2 className="h-4 w-4" />
                <span className="flex-1 text-sm font-semibold">Para el cliente</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={!!plani.compartida}
                  aria-label="Compartir con el cliente"
                  onClick={() => compartir(!plani.compartida)}
                  className={cn("relative h-5 w-9 rounded-full transition-colors", plani.compartida ? "bg-foreground" : "bg-foreground/20")}
                >
                  <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-card shadow transition-[left]", plani.compartida ? "left-[1.125rem]" : "left-0.5")} />
                </button>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {plani.compartida
                  ? "Con este link ve la presentación, comenta y aprueba cada pieza. No ve lo interno."
                  : "Activalo para mandarle un link privado donde ve la plani, comenta y aprueba."}
              </p>
              {plani.compartida && linkCliente && (
                <div className="mt-2 flex gap-1">
                  <button
                    type="button"
                    onClick={copiarLink}
                    className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full bg-foreground px-3 text-xs font-semibold text-background hover:opacity-90"
                  >
                    <Copy className="h-3.5 w-3.5" /> Copiar link
                  </button>
                  <a
                    href={linkCliente}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-8 items-center rounded-full border border-black/[0.08] bg-card px-3 text-xs font-medium hover:bg-secondary"
                  >
                    Ver
                  </a>
                  <button
                    type="button"
                    onClick={nuevoLink}
                    title="Cambiar el link (el anterior deja de andar)"
                    aria-label="Cambiar el link"
                    className="grid h-8 w-8 place-items-center rounded-full border border-black/[0.08] bg-card hover:bg-secondary"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
            <div className="space-y-1">
              {plani.drive_carpeta_id && (
                <a
                  href={`https://drive.google.com/drive/folders/${plani.drive_carpeta_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-9 items-center gap-2 rounded-lg px-2 text-sm hover:bg-secondary"
                >
                  <FolderOpen className="h-4 w-4" /> Abrir la carpeta en Drive
                </a>
              )}
              {basecampOk && (
                <button type="button" onClick={() => setPickTarea(true)} className="flex h-9 w-full items-center gap-2 rounded-lg px-2 text-sm hover:bg-secondary">
                  <Link2 className="h-4 w-4" /> {plani.bc_tarea_id ? "Cambiar la tarea de Basecamp" : "Vincular tarea de Basecamp"}
                </button>
              )}
              <button type="button" onClick={eliminarPlani} className="flex h-9 w-full items-center gap-2 rounded-lg px-2 text-sm text-destructive hover:bg-destructive/10">
                <Trash2 className="h-4 w-4" /> Eliminar la plani
              </button>
            </div>
          </BarPopover>
          <EstadoGuardado estado={guardado} />
          <NuevaPiezaMenu
            fecha={nuevaFecha ?? sugerida}
            conFecha
            onCrear={(f, fmt) => crear(f, fmt)}
            open={nuevaOpen}
            onOpenChange={(o) => {
              setNuevaOpen(o);
              if (!o) setNuevaFecha(null);
            }}
          >
            <BarAction label="Nueva pieza" icon={Plus}>
              Pieza
            </BarAction>
          </NuevaPiezaMenu>
        </>
      )}
    </ContextBar>
  );

  if (loading || (plani && clientsLoading && !brand)) {
    return (
      <>
        {bar}
        <main className="mx-auto max-w-6xl px-4 pb-20 pt-28 sm:px-6">
          <span className="skeleton block h-4 w-40 rounded-full" />
          <span className="skeleton mt-5 block h-24 w-2/3 rounded-3xl" />
          <span className="skeleton mt-10 block h-72 rounded-3xl" />
        </main>
      </>
    );
  }

  if (error || !plani) {
    return (
      <>
        {bar}
        <main className="mx-auto flex max-w-md flex-col items-center px-4 pb-16 pt-40 text-center">
          <p className="eyebrow">Planificación</p>
          <h1 className="mt-3 font-display text-4xl">{error ? "No se pudo abrir" : "No encontramos esa plani"}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error ?? "Puede que la hayan eliminado."}</p>
          <Link href="/planificacion" className="mt-6 inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm">
            <ArrowLeft className="h-4 w-4" /> Ver todas
          </Link>
        </main>
      </>
    );
  }

  const cliente = brand ?? { id: plani.brand_id, name: "Cliente", color: "#52525B", created_at: "", logo_url: null, logo_bg: "light" as const };
  const fueraDelMes = dias.filter((d) => !enElMes(d.fecha, plani.anio, plani.mes)).length;

  return (
    <>
      {bar}
      <main className="mx-auto max-w-6xl px-4 pb-24 pt-24 sm:px-6 md:pt-28">
        {/* ───── Portada ───── */}
        <header className="grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
          <div className="min-w-0">
            <p className="site-label flex items-center gap-2 text-ink/50">
              <Link href={`/clientes/${cliente.id}`} className="hover:text-ink">
                {cliente.name}
              </Link>
              <span className="text-primary">\</span> {TIPOS[plani.tipo].label}
            </p>
            <RevealTitle className="mt-4 font-display text-[clamp(3.4rem,11vw,8rem)] leading-[0.86] tracking-[-0.025em]" deps={[plani.id]}>
              {MESES[plani.mes - 1]} <em className="text-ink/25">{plani.anio}</em>
            </RevealTitle>
          </div>
          <dl className="grid grid-cols-4 gap-x-5 gap-y-1 md:text-right">
            {FORMATO_ORDEN.map((f) => {
              const n = piezas.filter((p) => p.formato === f).length;
              return (
                <div key={f} className={cn(!n && "opacity-35")}>
                  <dt className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted-foreground md:justify-end">
                    <FormatDot formato={f} className="h-2 w-2" /> {FORMATOS[f].plural}
                  </dt>
                  <dd className="font-display text-4xl leading-tight tabular-nums">{n}</dd>
                </div>
              );
            })}
          </dl>
        </header>

        <div className="mt-8 rounded-[1.75rem] border border-black/[0.06] bg-card/80 p-4 sm:p-5">
          <EstadoStepper value={plani.estado} onChange={(estado) => store.updatePlani({ estado })} />
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 border-t border-black/[0.06] pt-3 text-xs text-muted-foreground">
            <span>
              <b className="font-semibold text-foreground tabular-nums">{conMaterial}</b> de {piezas.length} con material final
            </span>
            <span>
              <b className="font-semibold text-foreground tabular-nums">{aprobadas}</b> aprobadas por el cliente
            </span>
            <span>
              <b className="font-semibold text-foreground tabular-nums">{programadas}</b> programadas
            </span>
            <span className="ml-auto">{ESTADOS.find((e) => e.value === plani.estado)?.hint}</span>
          </div>
        </div>

        <div className="mt-4">
          {plani.bc_tarea_id ? (
            <BasecampTarea tareaId={plani.bc_tarea_id} onDesvincular={() => store.updatePlani({ bc_tarea_id: null })} />
          ) : basecampOk ? (
            <button
              type="button"
              onClick={() => setPickTarea(true)}
              className="flex w-full items-center gap-2.5 rounded-2xl border border-dashed border-foreground/15 px-4 py-3 text-left text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
            >
              <BasecampMark /> Vincular la tarea de Basecamp de esta plani: el brief, la gente asignada y la etapa se ven acá.
            </button>
          ) : integraciones && !integraciones.basecamp ? (
            <p className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
              <BasecampMark className="h-3.5 w-3.5" /> Con Basecamp conectado (desde Clientes), la tarea de la plani se ve acá.
            </p>
          ) : null}
        </div>

        {/* ───── Calendario y feed ───── */}
        <section className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]" aria-label="Resumen del mes">
          <div>
            <h2 className="mb-3 font-display text-3xl leading-none">Calendario</h2>
            <Calendario
              anio={plani.anio}
              mes={plani.mes}
              piezas={piezas}
              onDia={(f) => irA(`dia-${f}`)}
              onAgregar={(f) => {
                setNuevaFecha(f);
                setNuevaOpen(true);
              }}
            />
          </div>
          <div>
            <h2 className="mb-3 font-display text-3xl leading-none">Feed</h2>
            <FeedGrid piezas={piezas} onPieza={irAPieza} className="max-w-sm" />
          </div>
        </section>

        {/* ───── Día por día ───── */}
        <section className="mt-14 space-y-12" aria-label="Piezas">
          {fueraDelMes > 0 && (
            <p className="rounded-2xl bg-primary/20 px-4 py-2.5 text-sm">
              {fueraDelMes === 1 ? "Hay un día" : `Hay ${fueraDelMes} días`} con piezas fuera de {MESES[plani.mes - 1]}.
            </p>
          )}
          {dias.length === 0 ? (
            <div className="mx-auto flex max-w-md flex-col items-center py-12 text-center">
              <p className="eyebrow">Día por día</p>
              <h2 className="mt-3 font-display text-4xl leading-tight">La plani está vacía</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Tocá un día del calendario o agregá la primera pieza: post, carrusel, reel o historia.
              </p>
              <NuevaPiezaMenu fecha={sugerida} conFecha align="center" onCrear={(f, fmt) => crear(f, fmt)}>
                <button type="button" className="mt-6 inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-95">
                  <CalendarPlus className="h-4 w-4" /> Primera pieza
                </button>
              </NuevaPiezaMenu>
            </div>
          ) : (
            dias
              .map((d) => ({ ...d, piezas: d.piezas.filter((p) => !esAdaptacion(p)) }))
              .filter((d) => d.piezas.length)
              .map((d) => (
              <div key={d.fecha} id={`dia-${d.fecha}`} className="scroll-mt-24">
                <div className="mb-4 flex items-end gap-3 border-b border-foreground/15 pb-2">
                  <h2 className="font-display text-[2.6rem] leading-none tracking-[-0.01em]">{etiquetaDia(d.fecha)}</h2>
                  <span className="pb-1 text-xs text-muted-foreground">
                    {d.piezas.map((p) => FORMATOS[p.formato].label + (adaptacionesDe.get(p.id)?.length ? " + historia" : "")).join(" + ")}
                  </span>
                  <NuevaPiezaMenu fecha={d.fecha} onCrear={(f, fmt) => crear(f, fmt)}>
                    <button
                      type="button"
                      aria-label={`Agregar una pieza el ${etiquetaDia(d.fecha)}`}
                      className="ml-auto mb-0.5 inline-flex h-8 items-center gap-1.5 rounded-full border border-black/[0.08] bg-card px-3 text-xs font-medium shadow-sm transition-colors hover:bg-secondary"
                    >
                      <Plus className="h-3.5 w-3.5" /> Pieza
                    </button>
                  </NuevaPiezaMenu>
                </div>
                <div className="space-y-4">
                  {d.piezas.map((p) => (
                    <PiezaCard
                      key={p.id}
                      pieza={p}
                      adaptaciones={adaptacionesDe.get(p.id) ?? []}
                      brand={cliente}
                      rol={rol}
                      update={store.updatePieza}
                      onDuplicar={store.duplicarPieza}
                      onBorrar={borrar}
                      onAdaptar={adaptar}
                      onOpen={abrir}
                      comentarios={comentarios}
                      otrosCopys={otrosCopys}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
          {dias.length > 0 && (
            <div className="flex justify-center">
              <NuevaPiezaMenu fecha={sugerida} conFecha align="center" onCrear={(f, fmt) => crear(f, fmt)}>
                <button type="button" className="inline-flex h-10 items-center gap-2 rounded-full border border-black/[0.08] bg-card px-5 text-sm font-medium shadow-sm transition-colors hover:bg-secondary">
                  <Plus className="h-4 w-4" /> Otra pieza
                </button>
              </NuevaPiezaMenu>
            </div>
          )}
        </section>
      </main>

      <Lightbox
        medios={lightbox?.medios ?? []}
        index={lightbox?.index ?? null}
        onIndex={(i) => setLightbox((l) => (l ? { ...l, index: i } : l))}
        onClose={() => setLightbox(null)}
      />

      <Dialog open={pickTarea} onOpenChange={setPickTarea}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Tarea de Basecamp</DialogTitle>
            <DialogDescription>Las tareas abiertas de {cliente.name}. Primero las que parecen la plani del mes.</DialogDescription>
          </DialogHeader>
          <TareaPicker
            brandId={plani.brand_id}
            mes={plani.mes}
            onPick={(t) => {
              store.updatePlani({ bc_tarea_id: t.id });
              setPickTarea(false);
              toast("Tarea vinculada");
            }}
          />
        </DialogContent>
      </Dialog>

    </>
  );
}


/** En el panel de comentarios: las piezas que tienen algo sin resolver, para ir directo. */
function PendientesEnPiezas({
  piezas,
  porId,
  porPieza,
  onIr,
}: {
  piezas: Pieza[];
  porId: Map<string, Pieza>;
  porPieza: Map<string, import("@/lib/plani/types").Comentario[]>;
  onIr: (id: string) => void;
}) {
  const con = piezas.filter((p) => pendientes(porPieza.get(p.id)) > 0);
  if (!con.length) return null;
  return (
    <div className="mt-4 border-t border-black/[0.06] pt-3">
      <p className="eyebrow mb-1.5">Sin resolver en piezas</p>
      <ul className="space-y-0.5">
        {con.map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => onIr(p.id)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-secondary">
              <FormatDot formato={p.formato} className="h-2 w-2" />
              <span className="flex-1 truncate">
                {etiquetaDia(p.fecha)} · {p.titulo || (p.adapta_de ? porId.get(p.adapta_de)?.titulo : "") || FORMATOS[p.formato].label}
              </span>
              <span className="text-xs font-semibold tabular-nums">{pendientes(porPieza.get(p.id))}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** ¿Hay conexión? (sin internet, lo que se escribe no llega a la base). */
function useEnLinea() {
  const [enLinea, setEnLinea] = useState(true);
  useEffect(() => {
    const actualizar = () => setEnLinea(navigator.onLine);
    actualizar();
    window.addEventListener("online", actualizar);
    window.addEventListener("offline", actualizar);
    return () => {
      window.removeEventListener("online", actualizar);
      window.removeEventListener("offline", actualizar);
    };
  }, []);
  return enLinea;
}

/**
 * Cómo está el guardado, en un punto (sin texto: no mueve la barra). Verde: todo en la nube.
 * Amarillo: guardando. Rojo: sin conexión o algo no se pudo guardar. El detalle, al pasar el mouse.
 */
function EstadoGuardado({ estado }: { estado: GuardadoEstado }) {
  const enLinea = useEnLinea();
  const rojo = !enLinea || estado === "error";
  const label = !enLinea
    ? "Sin conexión: los cambios no se están guardando"
    : estado === "error"
    ? "Algo no se pudo guardar: se volvió a leer lo que hay en la nube"
    : estado === "saving"
    ? "Guardando en la nube…"
    : "Todo guardado en la nube";
  return (
    <Hint label={label}>
      <span role="status" aria-label={label} className="grid h-9 w-7 shrink-0 place-items-center">
        <span
          className={cn(
            "h-2.5 w-2.5 rounded-full transition-colors duration-300",
            rojo ? "bg-red-500 shadow-[0_0_0_3px_rgb(239_68_68/0.25)]" : estado === "saving" ? "animate-pulse bg-primary" : "bg-emerald-500"
          )}
        />
      </span>
    </Hint>
  );
}
