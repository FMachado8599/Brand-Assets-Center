"use client";

import { useRef } from "react";
import { AlertTriangle, Check, Copy, Download, ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Hint } from "@/components/ui/tooltip";
import { adaptation, PIECE_TYPES, PLACEMENTS, placementInfo, type PieceType, type Placement } from "@/lib/ads/placements";
import { ratioLabel } from "@/lib/ads/reel";
import { cn } from "@/lib/utils";
import type { MockupInput } from "./draw";
import { MockupView } from "./MockupView";
import { isLowRes, isOffRatio, MAX_CARDS, type AdCard, type Piece } from "./pieces";

export type MockupTarget = { piece: Piece; card: AdCard; cardIndex: number; placement: Placement };

/** Los avisos de un archivo: si no es 9:16 para historia/Reels y si le falta resolución. */
function warnings(piece: Piece) {
  const out: string[] = [];
  const nineSixteen = piece.placements.some((p) => placementInfo(p).kind !== "feed");
  for (const [i, c] of piece.cards.entries()) {
    const m = c.media;
    const who = piece.cards.length > 1 ? `El ${i + 1}: ` : "";
    if (nineSixteen && isOffRatio(m)) out.push(`${who}es ${ratioLabel(m)}: en historias y Reels Meta lo muestra con fondo (o lo amplía con IA). Para estar seguro, armá una versión 9:16.`);
    if (isLowRes(m)) out.push(`${who}mide ${m.width}×${m.height}: se puede ver borroso. Meta pide 1080 de ancho.`);
  }
  return out;
}

/**
 * Una pieza: arriba su tipo, sus archivos y en qué mockups se ve; abajo, los mockups en fila (en un carrusel,
 * uno por archivo en cada lugar).
 */
export function PieceRow({
  piece,
  index,
  scale,
  exporting,
  inputFor,
  onPatch,
  onRemove,
  onAddCards,
  onRemoveCard,
  onDownloadPiece,
  onCopy,
  onDownload,
  onSource,
}: {
  piece: Piece;
  index: number;
  scale: number;
  exporting: boolean;
  inputFor: (t: MockupTarget) => Omit<MockupInput, "source">;
  onPatch: (patch: Partial<Piece>) => void;
  onRemove: () => void;
  onAddCards: (files: File[]) => void;
  onRemoveCard: (cardId: string) => void;
  onDownloadPiece: () => void;
  onCopy: (t: MockupTarget) => void;
  onDownload: (t: MockupTarget) => void;
  onSource: (key: string, el: HTMLImageElement | HTMLVideoElement | null) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const first = piece.cards[0].media;
  const total = piece.cards.length;
  const warns = warnings(piece);
  const placements = PLACEMENTS.map((p) => p.id).filter((id) => piece.placements.includes(id));
  const adapted = piece.cards.some((c) => isOffRatio(c.media)) && placements.some((p) => placementInfo(p).kind !== "feed");
  const color = piece.ctaColor ?? piece.cards[0].colors.cta;
  const count = placements.length * total;

  const toggle = (id: Placement) => {
    const on = placements.includes(id);
    if (on && placements.length === 1) return;
    onPatch({ placements: on ? placements.filter((p) => p !== id) : [...placements, id] });
  };

  return (
    <section className="rounded-3xl border bg-card/70 p-4 shadow-sm" aria-label={`Pieza ${index + 1}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="font-display text-2xl leading-none tabular-nums text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
        <Select value={piece.type} onValueChange={(type) => onPatch({ type: type as PieceType })}>
          <SelectTrigger className="h-8 w-[7.5rem] rounded-full text-xs font-semibold" aria-label="Tipo de pieza">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PIECE_TYPES.map((t) => (
              <SelectItem key={t.id} value={t.id} className="text-xs">
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={first.name}>
            {first.name}
            {total > 1 && <span className="text-muted-foreground"> y {total - 1} más</span>}
          </p>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            {warns.length > 0 && (
              <Hint label={<span className="block max-w-xs space-y-1">{warns.map((w) => <span key={w} className="block">{w}</span>)}</span>}>
                <span className="inline-flex" tabIndex={0} aria-label={warns.join(" ")}>
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                </span>
              </Hint>
            )}
            {total > 1 ? `${total} archivos · ` : ""}
            {ratioLabel(first)} · {first.width}×{first.height}
          </p>
        </div>

        <div className="flex items-center gap-1">
          {(piece.type === "carrusel" || total > 1) && total < MAX_CARDS && (
            <Hint label="Sumar archivos al carrusel">
              <Button variant="ghost" size="iconSm" aria-label="Sumar archivos al carrusel" onClick={() => fileRef.current?.click()}>
                <ImagePlus />
              </Button>
            </Hint>
          )}
          <Hint label="Color del botón (sale del creativo)">
            <label className="relative grid h-8 w-8 cursor-pointer place-items-center rounded-md">
              <span className="h-5 w-5 rounded-full ring-1 ring-black/15" style={{ background: color }} />
              <span className="sr-only">Color del botón</span>
              <input type="color" value={color} className="absolute inset-0 cursor-pointer opacity-0" onChange={(e) => onPatch({ ctaColor: e.target.value })} />
            </label>
          </Hint>
          {piece.ctaColor && (
            <button type="button" onClick={() => onPatch({ ctaColor: null })} className="text-[11px] font-medium text-muted-foreground hover:text-foreground">
              Color automático
            </button>
          )}
          <Hint label={count > 1 ? `Descargar sus ${count} mockups (.zip)` : "Descargar su mockup"}>
            <Button variant="ghost" size="iconSm" aria-label={`Descargar los mockups de la pieza ${index + 1}`} onClick={onDownloadPiece} disabled={exporting}>
              <Download />
            </Button>
          </Hint>
          <Hint label="Quitar la pieza">
            <Button variant="ghost" size="iconSm" aria-label={`Quitar la pieza ${index + 1}`} onClick={onRemove}>
              <X />
            </Button>
          </Hint>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={(e) => {
            onAddCards([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="Mockups de esta pieza">
        {PLACEMENTS.map((p) => {
          const on = placements.includes(p.id);
          const note = adaptation(p.id, first);
          return (
            <Hint key={p.id} label={note ? `${p.hint} ${note}.` : p.hint}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => toggle(p.id)}
                className={cn(
                  "inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[11px] font-medium outline-none ring-ring transition-colors focus-visible:ring-2",
                  on ? "border-foreground bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground"
                )}
              >
                {on && <Check className="h-3 w-3" />}
                {p.label}
                {note && <span className={cn("h-1.5 w-1.5 rounded-full", on ? "bg-amber-300" : "bg-amber-500")} aria-hidden />}
              </button>
            </Hint>
          );
        })}
        {adapted && (
          <span className="ml-auto flex gap-1 rounded-full bg-secondary p-0.5" role="radiogroup" aria-label="Cómo lo adapta Meta en historias y Reels">
            {(
              [
                ["contain", "Con fondo"],
                ["cover", "Recortado"],
              ] as const
            ).map(([value, label]) => (
              <Hint key={value} label={value === "contain" ? "Entero, con el mismo creativo desenfocado de fondo" : "Llenando la pantalla: se pierde arriba y abajo"}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={piece.fit === value}
                  onClick={() => onPatch({ fit: value })}
                  className={cn(
                    "h-6 rounded-full px-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground",
                    piece.fit === value && "bg-card text-foreground shadow-sm"
                  )}
                >
                  {label}
                </button>
              </Hint>
            ))}
          </span>
        )}
      </div>

      <div className="-mx-4 mt-4 flex snap-x gap-5 overflow-x-auto px-4 pb-3">
        {placements.flatMap((placement) =>
          piece.cards.map((card, cardIndex) => {
            const key = `${piece.id}:${card.id}:${placement}`;
            const target = { piece, card, cardIndex, placement };
            const note = adaptation(placement, card.media);
            const name = `${placementInfo(placement).label}${total > 1 ? ` · ${cardIndex + 1}/${total}` : ""}`;
            return (
              <figure key={key} className="flex shrink-0 snap-start flex-col items-center gap-1.5">
                <MockupView {...inputFor(target)} scale={scale} onSource={(el) => onSource(key, el)} />
                <figcaption className="flex max-w-full items-center gap-0.5">
                  <span className="mr-1 min-w-0 text-xs font-medium">
                    {name}
                    {note && <span className="block text-[10px] font-normal text-amber-700">{note}</span>}
                  </span>
                  <Hint label="Copiar la imagen">
                    <Button variant="ghost" size="iconSm" aria-label={`Copiar el mockup ${name}`} onClick={() => onCopy(target)} disabled={exporting}>
                      <Copy />
                    </Button>
                  </Hint>
                  <Hint label="Descargar la imagen">
                    <Button variant="ghost" size="iconSm" aria-label={`Descargar el mockup ${name}`} onClick={() => onDownload(target)} disabled={exporting}>
                      <Download />
                    </Button>
                  </Hint>
                  {total > 1 && (
                    <Hint label="Sacar este archivo del carrusel">
                      <Button variant="ghost" size="iconSm" aria-label={`Sacar el archivo ${cardIndex + 1} del carrusel`} onClick={() => onRemoveCard(card.id)}>
                        <X />
                      </Button>
                    </Hint>
                  )}
                </figcaption>
              </figure>
            );
          })
        )}
      </div>
    </section>
  );
}
