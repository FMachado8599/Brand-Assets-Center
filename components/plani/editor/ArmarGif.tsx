"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { ArrowLeft, ArrowRight, ImagePlus, Loader2, Sparkles, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import { formatKb, renderGif, type RenderedGif } from "@/lib/gif/encode";
import { byOrder, readFiles } from "@/lib/gif/parse";
import { DEFAULT_GIF_SETTINGS, type Frame, type GifSettings } from "@/lib/gif/types";
import { medidaDe } from "@/lib/plani/config";
import type { Medio, Pieza } from "@/lib/plani/types";
import { borrarMedio, subirMedio, SubidaError } from "@/lib/plani/upload";
import { cn } from "@/lib/utils";

/**
 * Armar el GIF de un banner con la herramienta de GIF: se sueltan los frames (en el orden de su
 * número: banner_1, banner_2…), se elige cuánto dura cada uno y el peso máximo, y el GIF se arma en
 * el navegador a la medida del banner. "Usar" lo sube al Drive como material final de la pieza.
 */
export function ArmarGif({
  pieza,
  open,
  onOpenChange,
  onListo,
}: {
  pieza: Pieza;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onListo: (medios: Medio[]) => void;
}) {
  const { w, h } = medidaDe(pieza);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [segundos, setSegundos] = useState(DEFAULT_GIF_SETTINGS.defaultDuration);
  const [maxKb, setMaxKb] = useState(DEFAULT_GIF_SETTINGS.maxKb);
  const [loop, setLoop] = useState(true);
  const [gif, setGif] = useState<(RenderedGif & { url: string }) | null>(null);
  const [armando, setArmando] = useState(false);
  const [subiendo, setSubiendo] = useState<number | null>(null);
  const [encima, setEncima] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) return;
    setFrames([]);
    setGif(null);
  }, [open]);
  useEffect(() => () => frames.forEach((f) => URL.revokeObjectURL(f.url)), [frames]);
  useEffect(() => () => gif && URL.revokeObjectURL(gif.url), [gif]);

  const settings: GifSettings = useMemo(
    () => ({ ...DEFAULT_GIF_SETTINGS, defaultDuration: segundos, unit: "s", loop, maxKb, fit: maxKb > 0 }),
    [segundos, loop, maxKb]
  );

  const sumar = async (files: File[]) => {
    const { frames: nuevos, invalid } = await readFiles(files);
    if (invalid.length) toast(`${invalid.length === 1 ? "Un archivo no es" : `${invalid.length} archivos no son`} una imagen`, "error");
    // Todos van al mismo GIF, en el orden del número de su nombre.
    setFrames((prev) => [...prev, ...nuevos.sort(byOrder)].map((f, i) => ({ ...f, order: i, durationMs: null, durationSource: "default" })));
    setGif(null);
  };

  const mover = (i: number, d: -1 | 1) =>
    setFrames((prev) => {
      const next = [...prev];
      const j = i + d;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      setGif(null);
      return next.map((f, k) => ({ ...f, order: k }));
    });

  const armar = async () => {
    if (!frames.length) return;
    setArmando(true);
    try {
      const r = await renderGif({ key: pieza.id, name: pieza.titulo || "banner", width: w, height: h, frames, warnings: [] }, settings);
      setGif({ ...r, url: URL.createObjectURL(r.blob) });
    } catch (e) {
      toast((e as Error).message || "No se pudo armar el GIF", "error");
    } finally {
      setArmando(false);
    }
  };

  const usar = async () => {
    if (!gif) return;
    const nombre = `${(pieza.titulo || "banner").replace(/[<>:"/\\|?*]+/g, "-").slice(0, 60)} ${w}x${h}.gif`;
    setSubiendo(0);
    try {
      const medio = await subirMedio(pieza.id, new File([gif.blob], nombre, { type: "image/gif" }), "final", setSubiendo);
      // Un banner tiene un solo archivo final: el GIF nuevo reemplaza al anterior.
      const viejos = pieza.medios.filter((m) => m.rol === "final");
      onListo([...pieza.medios.filter((m) => m.rol !== "final"), { ...medio, ancho: w, alto: h }]);
      viejos.forEach((m) => borrarMedio(m.drive_id));
      toast("Listo: el GIF quedó como material final");
      onOpenChange(false);
    } catch (e) {
      toast(e instanceof SubidaError ? e.message : "No se pudo subir el GIF", "error");
    } finally {
      setSubiendo(null);
    }
  };

  const soltar = (e: DragEvent) => {
    e.preventDefault();
    setEncima(false);
    sumar([...e.dataTransfer.files]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Armar el GIF</DialogTitle>
          <DialogDescription>
            Soltá los frames del banner ({w}×{h} px), en orden. Se arma acá mismo con la herramienta de GIF y queda como material final.
          </DialogDescription>
        </DialogHeader>

        <div
          onDragOver={(e) => (e.preventDefault(), setEncima(true))}
          onDragLeave={() => setEncima(false)}
          onDrop={soltar}
          className={cn("rounded-2xl border-2 border-dashed border-foreground/15 p-3 transition-colors", encima && "border-primary bg-primary/10")}
        >
          {frames.length ? (
            <ol className="flex gap-2 overflow-x-auto pb-1">
              {frames.map((f, i) => (
                <li key={f.id} className="group relative shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.url} alt={f.filename} title={f.filename} className="h-20 w-auto max-w-[9rem] rounded-md bg-white object-contain shadow-sm" />
                  <span className="absolute left-1 top-1 rounded bg-ink/70 px-1 text-[10px] font-semibold text-cream">{i + 1}</span>
                  <span className="absolute inset-x-0 bottom-0 flex justify-between p-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <button type="button" aria-label="Antes" onClick={() => mover(i, -1)} className="grid h-5 w-5 place-items-center rounded-full bg-card shadow">
                      <ArrowLeft className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      aria-label="Sacar"
                      onClick={() => {
                        setFrames((prev) => prev.filter((x) => x.id !== f.id));
                        setGif(null);
                      }}
                      className="grid h-5 w-5 place-items-center rounded-full bg-card shadow"
                    >
                      <X className="h-3 w-3" />
                    </button>
                    <button type="button" aria-label="Después" onClick={() => mover(i, 1)} className="grid h-5 w-5 place-items-center rounded-full bg-card shadow">
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  </span>
                </li>
              ))}
              <li className="shrink-0">
                <button
                  type="button"
                  onClick={() => input.current?.click()}
                  className="grid h-20 w-20 place-items-center rounded-md border border-dashed border-foreground/20 text-muted-foreground hover:text-foreground"
                  aria-label="Sumar frames"
                >
                  <ImagePlus className="h-4 w-4" />
                </button>
              </li>
            </ol>
          ) : (
            <button type="button" onClick={() => input.current?.click()} className="flex h-24 w-full flex-col items-center justify-center gap-1.5 text-sm text-muted-foreground">
              <ImagePlus className="h-5 w-5" /> Soltá los frames acá o tocá para elegirlos
            </button>
          )}
          <input
            ref={input}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              sumar([...(e.target.files ?? [])]);
              e.target.value = "";
            }}
          />
        </div>

        <div className="flex flex-wrap items-end gap-4 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Cada frame (segundos)</span>
            <input
              type="number"
              min={0.1}
              max={30}
              step={0.1}
              value={segundos}
              onChange={(e) => {
                setSegundos(Math.max(0.1, Number(e.target.value) || 1));
                setGif(null);
              }}
              className="h-9 w-24 rounded-xl border border-foreground/[0.08] bg-card px-3 tabular-nums outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Peso máximo (KB, 0 = sin límite)</span>
            <input
              type="number"
              min={0}
              max={5000}
              value={maxKb}
              onChange={(e) => {
                setMaxKb(Math.max(0, Math.round(Number(e.target.value) || 0)));
                setGif(null);
              }}
              className="h-9 w-24 rounded-xl border border-foreground/[0.08] bg-card px-3 tabular-nums outline-none"
            />
          </label>
          <label className="flex h-9 items-center gap-2">
            <input
              type="checkbox"
              checked={loop}
              onChange={(e) => {
                setLoop(e.target.checked);
                setGif(null);
              }}
            />
            Que se repita
          </label>
          <button
            type="button"
            onClick={armar}
            disabled={!frames.length || armando}
            className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground px-4 font-semibold text-background disabled:opacity-45"
          >
            {armando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Armar
          </button>
        </div>

        {gif && (
          <div className="flex flex-col items-center gap-2 rounded-2xl bg-[#ececee] p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={gif.url} alt="El GIF armado" className="max-w-full bg-white shadow-sm" style={{ width: Math.min(w, 560) }} />
            <p className={cn("text-xs", gif.fits ? "text-muted-foreground" : "font-medium text-destructive")}>
              {formatKb(gif.blob.size)}
              {maxKb > 0 && (gif.fits ? ` · entra en ${maxKb} KB` : ` · se pasa de ${maxKb} KB aun con menos colores`)} · {gif.colors} colores
            </p>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-foreground/[0.06] pt-4">
          <button type="button" onClick={() => onOpenChange(false)} className="h-10 rounded-full px-4 text-sm font-medium hover:bg-secondary">
            Cancelar
          </button>
          <button
            type="button"
            onClick={usar}
            disabled={!gif || subiendo !== null}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm disabled:opacity-45"
          >
            {subiendo !== null && <Loader2 className="h-4 w-4 animate-spin" />}
            {subiendo !== null ? `Subiendo… ${Math.round(subiendo * 100)}%` : "Usar como material final"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
