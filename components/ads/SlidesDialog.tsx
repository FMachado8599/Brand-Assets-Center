"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import { Check, ImagePlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import { MAX_CARDS, readCards, type AdCard } from "./pieces";
import { moveItem, SlideGrid } from "./SlideGrid";

const isFileDrag = (e: DragEvent) => [...e.dataTransfer.types].includes("Files");

/**
 * Ordenar los slides de un carrusel: se arrastran, se sacan y se suman más.
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

  const move = (from: number, to: number) => setOrder((prev) => moveItem(prev, from, to));

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
            Arrastralos para cambiar el orden. {added.length > 0 && "Los nuevos están marcados. "}Podés soltar más fotos acá. Nada
            cambia hasta «Listo».
          </DialogDescription>
        </DialogHeader>

        <SlideGrid
          cards={order}
          onMove={move}
          onRemove={(c) => setOrder((prev) => prev.filter((x) => x.id !== c.id))}
          isNew={isNew}
          canRemove={order.length > 1}
        >
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
        </SlideGrid>
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
