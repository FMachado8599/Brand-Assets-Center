"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, CircleDashed, Clapperboard, GalleryHorizontalEnd, ImageIcon, ImagePlus, Loader2, X, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import { adaptation, defaultPlacements, PIECE_TYPES, PLACEMENTS, type PieceType, type Placement } from "@/lib/ads/placements";
import { ratioLabel } from "@/lib/ads/reel";
import { cn } from "@/lib/utils";
import { MAX_CARDS, newPiece, readCards, type AdCard, type Piece } from "./pieces";
import { moveItem, SlideGrid } from "./SlideGrid";

const ICONS: Record<PieceType, LucideIcon> = {
  post: ImageIcon,
  carrusel: GalleryHorizontalEnd,
  reel: Clapperboard,
  historia: CircleDashed,
};

const STEPS = ["Pieza", "Archivos", "Mockups"];

/**
 * Agregar una pieza en tres pasos: qué es (post, carrusel, reel o historia), sus archivos y en qué mockups
 * verla. Los mockups vienen marcados según la proporción: 9:16 → historia y Reels; 4:5 o 1:1 → feed.
 */
export function AddPieceDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (piece: Piece) => void;
}) {
  const [step, setStep] = useState(0);
  const [type, setType] = useState<PieceType | null>(null);
  const [cards, setCards] = useState<AdCard[]>([]);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [reading, setReading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const multiple = type === "carrusel";

  // Cada vez que se abre, de cero.
  useEffect(() => {
    if (!open) return;
    setStep(0);
    setType(null);
    setCards([]);
    setPlacements([]);
  }, [open]);

  const addFiles = async (files: File[]) => {
    if (!files.length) return;
    setReading(true);
    const room = multiple ? MAX_CARDS - cards.length : 1;
    const read = await readCards(files.slice(0, room), (message) => toast(message, "error"));
    setReading(false);
    if (!read.length) return;
    const next = multiple ? [...cards, ...read] : read;
    setCards(next);
    setPlacements(defaultPlacements(next[0].media));
    if (files.length > room) toast(`Un carrusel lleva hasta ${MAX_CARDS} archivos: se usaron los primeros.`);
    if (!multiple) setStep(2);
  };

  const removeCard = (c: AdCard) => {
    URL.revokeObjectURL(c.media.url);
    setCards((prev) => prev.filter((x) => x.id !== c.id));
  };

  const close = (keep: boolean) => {
    if (!keep) cards.forEach((c) => URL.revokeObjectURL(c.media.url));
    onOpenChange(false);
  };

  const finish = () => {
    if (!type || !cards.length || !placements.length) return;
    onAdd(newPiece(type, cards, PLACEMENTS.map((p) => p.id).filter((id) => placements.includes(id))));
    close(true);
  };

  const first = cards[0]?.media ?? null;

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close(false))}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <ol className="mb-1 flex items-center gap-2 text-[11px] font-medium text-muted-foreground" aria-label="Pasos">
            {STEPS.map((label, i) => (
              <li key={label} className={cn("flex items-center gap-1.5", i === step && "text-foreground")} aria-current={i === step ? "step" : undefined}>
                <span className={cn("grid h-4 w-4 place-items-center rounded-full border text-[10px]", i < step && "border-foreground bg-foreground text-background", i === step && "border-foreground")}>
                  {i < step ? <Check className="h-2.5 w-2.5" /> : i + 1}
                </span>
                {label}
              </li>
            ))}
          </ol>
          <DialogTitle>{["¿Qué pieza es?", multiple ? "Los archivos del carrusel" : "El archivo", "¿En qué mockups verla?"][step]}</DialogTitle>
          <DialogDescription>
            {
              [
                "Como en Planificación: cada pieza se sube por separado y se ve en los mockups que elijas.",
                multiple
                  ? `De 2 a ${MAX_CARDS}. Arrastralos (o usá las flechas) para ordenarlos como van en el carrusel. Ideal: 1080×1350 (4:5) o 1080×1080 (1:1).`
                   : "Una imagen o un video. Ideal: 1080×1920 (9:16) para reels e historias, 1080×1350 (4:5) para el feed.",
                "Vienen marcados los de su proporción. Los demás muestran cómo la adapta Meta si el anuncio sale también ahí (ubicaciones Advantage+).",
              ][step]
            }
          </DialogDescription>
        </DialogHeader>

        {step === 0 && (
          <div className="grid gap-2 sm:grid-cols-2">
            {PIECE_TYPES.map((p) => {
              const Icon = ICONS[p.id];
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setType(p.id);
                    setCards([]);
                    setStep(1);
                  }}
                  className="flex items-start gap-3 rounded-2xl border bg-card p-3 text-left outline-none ring-ring transition-colors hover:border-foreground/40 hover:bg-secondary/50 focus-visible:ring-2"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-secondary">
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold">{p.label}</span>
                    <span className="block text-xs text-muted-foreground">{p.hint}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            {cards.length > 0 && multiple && (
              <SlideGrid cards={cards} onMove={(from, to) => setCards((prev) => moveItem(prev, from, to))} onRemove={removeCard} className="-m-2 max-h-[24rem]">
                {cards.length < MAX_CARDS && (
                  <li>
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        addFiles([...e.dataTransfer.files]);
                      }}
                      disabled={reading}
                      className="flex aspect-[4/5] w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-foreground/15 px-1 text-center text-xs text-muted-foreground outline-none ring-ring transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:ring-2 disabled:cursor-wait"
                    >
                      {reading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
                      Sumar más
                      <span className="text-[10px]">o soltalos acá</span>
                    </button>
                  </li>
                )}
              </SlideGrid>
            )}
            {cards.length > 0 && !multiple && (
              <ul className="flex flex-wrap gap-2">
                {cards.map((c, i) => (
                  <li key={c.id} className="relative">
                    <span className="block h-20 w-16 overflow-hidden rounded-lg bg-secondary">
                      {c.media.kind === "video" ? (
                        <video src={c.media.url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.media.url} alt="" className="h-full w-full object-cover" />
                      )}
                    </span>
                    <span className="absolute left-1 top-1 rounded bg-ink/75 px-1 text-[10px] font-semibold tabular-nums text-cream">{i + 1}</span>
                    <button
                      type="button"
                      aria-label={`Quitar ${c.media.name}`}
                      onClick={() => removeCard(c)}
                      className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-foreground text-background"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {!cards.length && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  addFiles([...e.dataTransfer.files]);
                }}
                disabled={reading}
                className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-foreground/10 px-4 py-8 text-center outline-none ring-ring transition-colors hover:border-foreground/25 focus-visible:ring-2 disabled:cursor-wait"
              >
                {reading ? <Loader2 className="h-6 w-6 animate-spin" /> : <ImagePlus className="h-6 w-6" />}
                <span className="text-sm font-medium">{multiple ? (cards.length ? "Sumar más archivos" : "Elegí los archivos del carrusel") : "Elegí la imagen o el video"}</span>
                <span className="text-xs text-muted-foreground">O arrastralos acá.</span>
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*"
              multiple={multiple}
              className="hidden"
              onChange={(e) => {
                addFiles([...(e.target.files ?? [])]);
                e.target.value = "";
              }}
            />
          </div>
        )}

        {step === 2 && first && (
          <ul className="grid gap-1.5" role="group" aria-label="Mockups">
            {PLACEMENTS.map((p) => {
              const on = placements.includes(p.id);
              const note = adaptation(p.id, first);
              return (
                <li key={p.id}>
                  <label className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-2.5 transition-colors", on ? "border-foreground/40 bg-secondary/60" : "hover:bg-secondary/40")}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => setPlacements((prev) => (on ? prev.filter((x) => x !== p.id) : [...prev, p.id]))}
                      className="mt-0.5 h-4 w-4 accent-foreground"
                    />
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-baseline gap-x-2 text-sm font-medium">
                        {p.label}
                        {note && <span className="text-[11px] font-normal text-amber-700">{note}</span>}
                      </span>
                      <span className="block text-xs text-muted-foreground">{p.hint}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex items-center justify-between gap-2 border-t pt-3">
          <div className="min-w-0 text-xs text-muted-foreground">
            {step > 0 && first && `${cards.length > 1 ? `${cards.length} archivos · ` : ""}${ratioLabel(first)} · ${first.width}×${first.height}`}
          </div>
          <div className="flex shrink-0 gap-2">
            {step > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setStep(step - 1)}>
                <ArrowLeft /> Atrás
              </Button>
            )}
            {step === 1 && (multiple || cards.length > 0) && (
              <Button size="sm" disabled={(multiple ? cards.length < 2 : !cards.length) || reading} onClick={() => setStep(2)}>
                Seguir
              </Button>
            )}
            {step === 2 && (
              <Button size="sm" disabled={!placements.length} onClick={finish}>
                <Check /> Listo
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
