"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import { ArrowLeft, ArrowRight, Check, ImagePlus, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import { MAX_CARDS, readCards, type AdCard } from "./pieces";

const isFileDrag = (e: DragEvent) => [...e.dataTransfer.types].includes("Files");

/**
 * Ordenar los slides de un carrusel: se arrastran (o se mueven con las flechas), se sacan y se suman más.
 * Se abre al sumar slides (los nuevos quedan al final, marcados) y con "Ordenar slides". Nada cambia hasta "Listo".
 */
export function SlidesDialog({
  open,
  cards,
  pending,
  onCancel,
  onApply,
}: {
  open: boolean;
  /** Los slides que ya tiene el carrusel. */
  cards: AdCard[];
  /** Los que se acaban de sumar (van al final). */
  pending: AdCard[];
  onCancel: (added: AdCard[]) => void;
  onApply: (order: AdCard[], dropped: AdCard[]) => void;
}) {
  const [order, setOrder] = useState<AdCard[]>([]);
  const [added, setAdded] = useState<AdCard[]>([]);
  const [reading, setReading] = useState(false);
  const [fileOver, setFileOver] = useState(false);
  const dragging = useRef<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Se arma una sola vez al abrir: lo que cambie afuera mientras está abierto no pisa lo que se está ordenando.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setOrder([...cards, ...pending]);
      setAdded(pending);
    }
    wasOpen.current = open;
  }, [open, cards, pending]);

  const isNew = (c: AdCard) => added.some((a) => a.id === c.id);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length || from === to) return;
    setOrder((prev) => {
      const next = [...prev];
      const [card] = next.splice(from, 1);
      next.splice(to, 0, card);
      return next;
    });
  };

  const addFiles = async (files: File[]) => {
    const room = MAX_CARDS - order.length;
    if (room <= 0) return toast(`Un carrusel lleva hasta ${MAX_CARDS} slides.`);
    setReading(true);
    const read = await readCards(files.slice(0, room), (m) => toast(m, "error"));
    setReading(false);
    if (files.length > room) toast(`Un carrusel lleva hasta ${MAX_CARDS} slides: se sumaron los primeros.`);
    setOrder((prev) => [...prev, ...read]);
    setAdded((prev) => [...prev, ...read]);
  };

  const cancel = () => onCancel(added);
  const apply = () => {
    const dropped = [...cards, ...added].filter((c) => !order.some((o) => o.id === c.id));
    onApply(order, dropped);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && cancel()}>
      <DialogContent
        className={cn("max-w-3xl", fileOver && "ring-4 ring-primary")}
        onDragOver={(e) => {
          if (!isFileDrag(e)) return;
          e.preventDefault();
          setFileOver(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFileOver(false);
        }}
        onDrop={(e) => {
          if (!isFileDrag(e)) return;
          e.preventDefault();
          setFileOver(false);
          addFiles([...e.dataTransfer.files].filter((f) => /^(image|video)\//.test(f.type)));
        }}
      >
        <DialogHeader>
          <DialogTitle>Ordenar slides</DialogTitle>
          <DialogDescription>
            Arrastralos para cambiar el orden (o usá las flechas). {added.length > 0 && "Los nuevos están marcados. "}Podés soltar más fotos acá. Nada
            cambia hasta «Listo».
          </DialogDescription>
        </DialogHeader>

        <ol className="grid grid-cols-3 gap-3 overflow-y-auto overflow-x-hidden p-2 sm:grid-cols-5" aria-label="Slides del carrusel">
          {order.map((c, i) => (
            <li
              key={c.id}
              draggable
              onDragStart={(e) => {
                dragging.current = i;
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", c.id);
              }}
              onDragOver={(e) => {
                if (isFileDrag(e) || dragging.current === null) return;
                e.preventDefault();
                if (dragging.current !== i) {
                  move(dragging.current, i);
                  dragging.current = i;
                }
              }}
              onDragEnd={() => (dragging.current = null)}
              className="group relative cursor-grab active:cursor-grabbing"
            >
              <span className={cn("relative block aspect-[4/5] overflow-hidden rounded-xl bg-secondary ring-2", isNew(c) ? "ring-primary" : "ring-transparent")}>
                {c.media.kind === "video" ? (
                  <video src={c.media.url} muted playsInline preload="metadata" className="pointer-events-none h-full w-full object-cover" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.media.url} alt="" draggable={false} className="h-full w-full object-cover" />
                )}
                {isNew(c) && <span className="absolute bottom-1.5 left-1.5 rounded-md bg-primary px-1.5 text-[10px] font-semibold leading-5 text-primary-foreground">Nuevo</span>}
              </span>
              <span className="absolute left-1.5 top-1.5 rounded-md bg-ink/80 px-1.5 text-[11px] font-semibold tabular-nums leading-5 text-cream">{i + 1}</span>
              <button
                type="button"
                aria-label={`Sacar el slide ${i + 1}`}
                onClick={() => setOrder((prev) => prev.filter((x) => x.id !== c.id))}
                disabled={order.length === 1}
                className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full bg-foreground text-background shadow disabled:hidden"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <span className="mt-1 flex items-center justify-between gap-1">
                <button
                  type="button"
                  aria-label={`Mover el slide ${i + 1} a la izquierda`}
                  onClick={() => move(i, i - 1)}
                  disabled={i === 0}
                  className="grid h-6 w-6 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                </button>
                <span className="min-w-0 truncate text-[10px] text-muted-foreground" title={c.media.name}>
                  {c.media.name}
                </span>
                <button
                  type="button"
                  aria-label={`Mover el slide ${i + 1} a la derecha`}
                  onClick={() => move(i, i + 1)}
                  disabled={i === order.length - 1}
                  className="grid h-6 w-6 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30"
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </span>
            </li>
          ))}
          {order.length < MAX_CARDS && (
            <li>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={reading}
                className="flex aspect-[4/5] w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-foreground/15 text-center text-xs text-muted-foreground outline-none ring-ring transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:ring-2"
              >
                {reading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
                Sumar más
              </button>
            </li>
          )}
        </ol>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={(e) => {
            addFiles([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />

        <div className="flex items-center justify-between gap-2 border-t pt-3">
          <span className="text-xs text-muted-foreground">
            {order.length} {order.length === 1 ? "slide" : "slides"} · hasta {MAX_CARDS}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={cancel}>
              Cancelar
            </Button>
            <Button size="sm" onClick={apply}>
              <Check /> Listo
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
