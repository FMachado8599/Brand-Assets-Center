"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownToLine, Copy, Film, ImageDown, Megaphone, RefreshCw, Search, WandSparkles, X } from "lucide-react";
import { ClientMark } from "@/components/clients/ClientMark";
import { toast } from "@/components/ui/toaster";
import { useClients } from "@/hooks/useClients";
import { copyPlain } from "@/lib/cards/clipboard";
import { findLinks } from "@/lib/downloads/links";
import { entregarArchivos, esImagen, esVideo, type Destino } from "@/lib/inicio/entrega";
import { buscarHex, type ColorEncontrado } from "@/lib/inicio/marcas";
import { cn } from "@/lib/utils";
import { abrirBuscador } from "./Buscador";

/** ¿Está escribiendo en un campo? Ahí el Ctrl+V es suyo. */
export function escribiendo(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

/** Lo que se hace con un texto pegado en el Inicio: links → Descargas, un HEX → de qué marca es, el resto → el buscador. */
export function usarTexto(texto: string, router: ReturnType<typeof useRouter>, mostrarHex: (hex: string) => boolean) {
  const t = texto.trim();
  if (!t) return;
  if (findLinks(t).length) {
    router.push(`/descargas?links=${encodeURIComponent(t.slice(0, 4000))}`);
    return;
  }
  if (mostrarHex(t)) return;
  abrirBuscador(t);
}

/** La barra del encabezado: se pega un link, un HEX o se escribe para buscar. */
export function BarraRapida({ oscuro }: { oscuro: boolean }) {
  const router = useRouter();
  const { clients } = useClients();
  const [texto, setTexto] = useState("");
  const [hex, setHex] = useState<{ hex: string; resultados: ColorEncontrado[] } | null>(null);

  const mostrarHex = (t: string) => {
    const r = buscarHex(t, clients);
    if (!r) return false;
    setHex(r);
    return true;
  };

  // Ctrl+V en cualquier parte del Inicio (fuera de un campo) hace lo mismo que pegar en la barra.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (escribiendo(e.target) || e.clipboardData?.files.length) return;
      const t = e.clipboardData?.getData("text") ?? "";
      if (!t.trim()) return;
      e.preventDefault();
      usarTexto(t, router, (x) => {
        const r = buscarHex(x, clients);
        if (r) setHex(r);
        return Boolean(r);
      });
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [router, clients]);

  return (
    <div className="relative min-w-0">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          usarTexto(texto, router, mostrarHex);
          setTexto("");
        }}
        className={cn(
          "flex h-12 items-center gap-2 rounded-full pl-4 pr-1.5 transition-colors",
          oscuro ? "bg-cream/[0.08] ring-1 ring-cream/10 focus-within:ring-cream/30" : "bg-ink/10 ring-1 ring-ink/10 focus-within:ring-ink/40"
        )}
      >
        <Search className={cn("h-4 w-4 shrink-0", oscuro ? "text-cream/50" : "text-ink/60")} />
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onPaste={(e) => {
            const t = e.clipboardData.getData("text");
            if (findLinks(t).length || buscarHex(t, clients)) {
              e.preventDefault();
              usarTexto(t, router, mostrarHex);
            }
          }}
          placeholder="Pegá un link, un HEX o soltá un archivo…"
          aria-label="Pegá un link, un HEX o buscá"
          className={cn(
            "min-w-0 flex-1 bg-transparent text-[15px] outline-none focus-visible:ring-0 focus-visible:ring-offset-0",
            oscuro ? "placeholder:text-cream/40" : "placeholder:text-ink/50"
          )}
        />
        <button
          type="button"
          onClick={() => abrirBuscador(texto)}
          className={cn(
            "hidden h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium sm:flex",
            oscuro ? "text-cream/60 hover:bg-cream/10 hover:text-cream" : "text-ink/70 hover:bg-ink/10"
          )}
        >
          <kbd className="font-ui">⌘K</kbd> buscar
        </button>
      </form>
      {hex && <HexResultado hex={hex.hex} resultados={hex.resultados} cerrar={() => setHex(null)} />}
    </div>
  );
}

function HexResultado({ hex, resultados, cerrar }: { hex: string; resultados: ColorEncontrado[]; cerrar: () => void }) {
  const router = useRouter();
  return (
    <div className="floating mt-2 rounded-2xl p-3 text-foreground duration-200 animate-in fade-in-0 slide-in-from-top-1">
      <div className="flex items-center gap-3">
        <span className="h-10 w-10 shrink-0 rounded-xl ring-1 ring-inset ring-foreground/10" style={{ background: hex }} />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-sm font-semibold">{hex}</p>
          <p className="text-xs text-muted-foreground">
            {!resultados.length ? "No es de ninguna marca del estudio." : resultados[0].exacto ? "Es de:" : "No es exacto, pero se parece a:"}
          </p>
        </div>
        <button type="button" onClick={cerrar} aria-label="Cerrar" className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-foreground/5">
          <X className="h-4 w-4" />
        </button>
      </div>
      {resultados.length > 0 && (
        <ul className="mt-2 space-y-1">
          {resultados.map((r) => (
            <li key={r.brand.id} className="flex items-center gap-2.5 rounded-xl px-1.5 py-1.5 hover:bg-foreground/[0.04]">
              <ClientMark brand={r.brand} className="h-8 w-8 rounded-lg text-[9px]" pad="p-[14%]" />
              <button type="button" onClick={() => router.push(`/clientes/${r.brand.id}`)} className="min-w-0 flex-1 text-left">
                <span className="block truncate text-sm font-medium">{r.brand.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {r.nombre} · {r.hex}
                </span>
              </button>
              <span className="h-6 w-6 rounded-md ring-1 ring-inset ring-foreground/10" style={{ background: r.hex }} />
              <button
                type="button"
                onClick={async () => {
                  await copyPlain(r.hex);
                  toast(`${r.hex} copiado`);
                }}
                aria-label={`Copiar ${r.hex}`}
                className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ───────────── Soltar archivos ───────────── */

type Opcion = { destino: Destino; href: string; label: string; detalle: string; icono: typeof RefreshCw; sirve: (f: File[]) => boolean };

const OPCIONES: Opcion[] = [
  { destino: "conversor", href: "/conversor", label: "Convertir", detalle: "A otro formato", icono: RefreshCw, sirve: () => true },
  { destino: "compresor", href: "/conversor", label: "Comprimir", detalle: "Que pese menos", icono: ArrowDownToLine, sirve: (f) => f.some((x) => esImagen(x) || esVideo(x) || x.type === "application/pdf") },
  { destino: "retoque", href: "/retoque", label: "Quitar el fondo", detalle: "PNG transparente", icono: WandSparkles, sirve: (f) => f.some(esImagen) },
  { destino: "gif", href: "/gif", label: "Armar un GIF", detalle: "Con los frames", icono: Film, sirve: (f) => f.filter(esImagen).length >= 1 },
  { destino: "ads", href: "/ads", label: "Verlo en Ads", detalle: "En los mockups de Instagram", icono: Megaphone, sirve: (f) => f.some((x) => esImagen(x) || esVideo(x)) },
];

/**
 * Soltar archivos en el Inicio: aparece un panel para elegir qué hacer con ellos y la herramienta los
 * recibe al abrir (lib/inicio/entrega.ts). Se arrastra sobre cualquier parte de la página.
 */
export function SoltarArchivos() {
  const router = useRouter();
  const [arrastrando, setArrastrando] = useState(false);
  const [archivos, setArchivos] = useState<File[] | null>(null);

  useEffect(() => {
    let profundidad = 0;
    const conArchivos = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const enter = (e: DragEvent) => {
      if (!conArchivos(e)) return;
      profundidad++;
      setArrastrando(true);
    };
    const leave = (e: DragEvent) => {
      if (!conArchivos(e)) return;
      profundidad = Math.max(0, profundidad - 1);
      if (!profundidad) setArrastrando(false);
    };
    const over = (e: DragEvent) => {
      if (conArchivos(e)) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (!conArchivos(e)) return;
      e.preventDefault();
      profundidad = 0;
      setArrastrando(false);
      const f = Array.from(e.dataTransfer?.files ?? []);
      if (f.length) setArchivos(f);
    };
    // Una imagen pegada (Ctrl+V de una captura) también vale.
    const paste = (e: ClipboardEvent) => {
      if (escribiendo(e.target)) return;
      const f = Array.from(e.clipboardData?.files ?? []);
      if (f.length) {
        e.preventDefault();
        setArchivos(f);
      }
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    window.addEventListener("paste", paste);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
      window.removeEventListener("paste", paste);
    };
  }, []);

  const elegir = (o: Opcion) => {
    if (!archivos) return;
    entregarArchivos(o.destino, archivos);
    setArchivos(null);
    router.push(o.href);
  };

  if (!arrastrando && !archivos) return null;
  const opciones = archivos ? OPCIONES.filter((o) => o.sirve(archivos)) : [];
  return (
    <div
      className="fixed inset-0 z-[45] grid place-items-center bg-ink/55 p-4 backdrop-blur-[2px] duration-200 animate-in fade-in-0"
      onClick={() => setArchivos(null)}
    >
      {!archivos ? (
        <div className="pointer-events-none grid place-items-center rounded-[2rem] border-2 border-dashed border-cream/40 px-16 py-14 text-center text-cream">
          <ImageDown className="h-10 w-10" />
          <p className="mt-4 font-display text-4xl">Soltalo acá</p>
          <p className="mt-1 text-sm text-cream/60">Después elegís qué hacer: convertir, comprimir, quitar el fondo…</p>
        </div>
      ) : (
        <div className="w-full max-w-lg rounded-[1.75rem] border bg-card p-5 text-foreground shadow-2xl duration-200 animate-in zoom-in-95" onClick={(e) => e.stopPropagation()}>
          <p className="eyebrow">
            {archivos.length === 1 ? archivos[0].name : `${archivos.length} archivos`}
          </p>
          <p className="mt-1 font-display text-3xl leading-tight">¿Qué hacemos con {archivos.length === 1 ? "esto" : "esto"}?</p>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {opciones.map((o) => {
              const Icono = o.icono;
              return (
                <li key={o.destino}>
                  <button
                    type="button"
                    onClick={() => elegir(o)}
                    className="group flex w-full items-center gap-3 rounded-2xl border bg-background/60 p-3 text-left transition-colors hover:border-foreground/30 hover:bg-background"
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-foreground/[0.06] transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                      <Icono className="h-[18px] w-[18px]" />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold">{o.label}</span>
                      <span className="block text-xs text-muted-foreground">{o.detalle}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <button type="button" onClick={() => setArchivos(null)} className="mt-4 text-sm text-muted-foreground underline-offset-2 hover:underline">
            Nada, me equivoqué
          </button>
        </div>
      )}
    </div>
  );
}
