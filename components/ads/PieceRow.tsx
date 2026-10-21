"use client";

import { useRef, useState, type DragEvent } from "react";
import { AlertTriangle, ChevronDown, Copy, Download, ImagePlus, RefreshCw, Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Hint } from "@/components/ui/tooltip";
import { adaptation, PIECE_TYPES, PLACEMENTS, placementInfo, type PieceType, type Placement } from "@/lib/ads/placements";
import { ratioLabel } from "@/lib/ads/reel";
import { cn } from "@/lib/utils";
import type { MockupInput } from "./draw";
import { MockupView } from "./MockupView";
import { isLowRes, isOffRatio, MAX_CARDS, type AdCard, type Piece } from "./pieces";

export type MockupTarget = { piece: Piece; card: AdCard; cardIndex: number; placement: Placement };

const GROUPS: { kind: "feed" | "reels" | "story"; label: string }[] = [
  { kind: "feed", label: "Feed" },
  { kind: "reels", label: "Reels" },
  { kind: "story", label: "Historias" },
];

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

const filesOf = (e: DragEvent) => [...e.dataTransfer.files].filter((f) => /^(image|video)\//.test(f.type));
const hasFiles = (e: DragEvent) => [...e.dataTransfer.types].includes("Files");

/**
 * Una pieza: arriba, en una línea, su tipo, su archivo y lo que se ajusta; abajo, los mockups en fila (en un
 * carrusel, uno por archivo en cada lugar). Soltar archivos en la fila los suma al carrusel (o reemplaza el
 * archivo de un post); soltar uno sobre un teléfono reemplaza ese archivo.
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
  onReplaceCard,
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
  onReplaceCard: (cardId: string, file: File) => void;
  onRemoveCard: (cardId: string) => void;
  onDownloadPiece: () => void;
  onCopy: (t: MockupTarget) => void;
  onDownload: (t: MockupTarget) => void;
  onSource: (key: string, el: HTMLImageElement | HTMLVideoElement | null) => void;
}) {
  const addRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  /** Qué archivo se reemplaza con el selector de archivos. */
  const replacing = useRef<string | null>(null);
  const [dropOn, setDropOn] = useState<"row" | string | null>(null);
  const first = piece.cards[0].media;
  const total = piece.cards.length;
  const carousel = piece.type === "carrusel" || total > 1;
  const warns = warnings(piece);
  const placements = PLACEMENTS.map((p) => p.id).filter((id) => piece.placements.includes(id));
  const adapted = piece.cards.some((c) => isOffRatio(c.media)) && placements.some((p) => placementInfo(p).kind !== "feed");
  const color = piece.ctaColor ?? piece.cards[0].colors.cta;
  const count = placements.length * total;
  const summary = placements.length <= 2 ? placements.map((p) => placementInfo(p).label).join(" · ") : `${placements.length} mockups`;

  const toggle = (id: Placement, on: boolean) => {
    if (!on && placements.length === 1) return;
    onPatch({ placements: on ? [...placements, id] : placements.filter((p) => p !== id) });
  };

  const replace = (cardId: string) => {
    replacing.current = cardId;
    replaceRef.current?.click();
  };

  /** En la fila: a un carrusel se le suman; a un post, uno reemplaza el archivo y varios lo vuelven carrusel. */
  const dropOnRow = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDropOn(null);
    const files = filesOf(e);
    if (!files.length) return;
    if (carousel || files.length > 1) onAddCards(files);
    else onReplaceCard(piece.cards[0].id, files[0]);
  };

  return (
    <section
      className={cn("relative rounded-3xl border bg-card/70 p-4 shadow-sm transition-colors", dropOn === "row" && "border-primary bg-primary/10")}
      aria-label={`Pieza ${index + 1}`}
      onDragOver={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.stopPropagation();
        // Sobre un teléfono marca ese teléfono (su handler no deja llegar acá); en el resto, la fila.
        if (dropOn !== "row") setDropOn("row");
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropOn(null);
      }}
      onDrop={dropOnRow}
    >
      {dropOn === "row" && (
        <span className="pointer-events-none absolute right-4 top-4 z-10 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground shadow">
          {carousel ? "Soltá para sumarlos al carrusel" : "Soltá para reemplazar el archivo (varios lo vuelven carrusel)"}
        </span>
      )}

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

        <div className="flex flex-wrap items-center gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 max-w-[15rem] gap-1.5 rounded-full px-3 text-xs" aria-label={`Mockups de esta pieza: ${summary}`}>
                <Smartphone className="!size-3.5" />
                <span className="truncate">{summary}</span>
                <ChevronDown className="!size-3.5 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <DropdownMenuLabel>Mockups de esta pieza</DropdownMenuLabel>
              {GROUPS.map((g, gi) => (
                <div key={g.kind}>
                  {gi > 0 && <DropdownMenuSeparator />}
                  <p className="px-2 pb-0.5 pt-1 text-[11px] font-medium text-muted-foreground">{g.label}</p>
                  {PLACEMENTS.filter((p) => p.kind === g.kind).map((p) => {
                    const on = placements.includes(p.id);
                    const note = adaptation(p.id, first);
                    return (
                      <DropdownMenuCheckboxItem
                        key={p.id}
                        checked={on}
                        disabled={on && placements.length === 1}
                        onCheckedChange={(v) => toggle(p.id, v === true)}
                        onSelect={(e) => e.preventDefault()}
                        className="items-start data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                      >
                        <span className="min-w-0">
                          <span className="block">{p.label}</span>
                          {note && <span className="block text-[11px] text-amber-700">{note}</span>}
                        </span>
                      </DropdownMenuCheckboxItem>
                    );
                  })}
                </div>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {adapted && (
            <span className="flex gap-0.5 rounded-full bg-secondary p-0.5" role="radiogroup" aria-label="Cómo lo adapta Meta en historias y Reels">
              {(
                [
                  ["contain", "Con fondo"],
                  ["cover", "Recortado"],
                ] as const
              ).map(([value, label]) => (
                <Hint key={value} label={value === "contain" ? "En historias y Reels: entero, con el mismo creativo desenfocado de fondo" : "En historias y Reels: llenando la pantalla (se pierde arriba y abajo)"}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={piece.fit === value}
                    onClick={() => onPatch({ fit: value })}
                    className={cn(
                      "h-7 rounded-full px-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground",
                      piece.fit === value && "bg-card text-foreground shadow-sm"
                    )}
                  >
                    {label}
                  </button>
                </Hint>
              ))}
            </span>
          )}

          {carousel ? (
            total < MAX_CARDS && (
              <Hint label="Sumar archivos al carrusel (o arrastralos a la fila)">
                <Button variant="ghost" size="iconSm" aria-label="Sumar archivos al carrusel" onClick={() => addRef.current?.click()}>
                  <ImagePlus />
                </Button>
              </Hint>
            )
          ) : (
            <Hint label="Reemplazar el archivo (o soltá otro encima)">
              <Button variant="ghost" size="iconSm" aria-label="Reemplazar el archivo" onClick={() => replace(piece.cards[0].id)}>
                <RefreshCw />
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
          ref={addRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={(e) => {
            onAddCards([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
        <input
          ref={replaceRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file && replacing.current) onReplaceCard(replacing.current, file);
            replacing.current = null;
            e.target.value = "";
          }}
        />
      </div>

      {/* Con lugar alrededor para la sombra de los teléfonos, adentro de la tarjeta. */}
      <div className="-mx-4 mt-2 flex snap-x scroll-px-4 gap-5 overflow-x-auto px-4 pb-8 pt-3">
        {placements.flatMap((placement) =>
          piece.cards.map((card, cardIndex) => {
            const key = `${piece.id}:${card.id}:${placement}`;
            const target = { piece, card, cardIndex, placement };
            const note = adaptation(placement, card.media);
            const name = `${placementInfo(placement).label}${total > 1 ? ` · ${cardIndex + 1}/${total}` : ""}`;
            return (
              <figure
                key={key}
                className="flex shrink-0 snap-start flex-col items-center gap-1.5"
                onDragOver={(e) => {
                  if (!hasFiles(e)) return;
                  e.preventDefault();
                  e.stopPropagation();
                  if (dropOn !== key) setDropOn(key);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDropOn(null);
                  const [file] = filesOf(e);
                  if (file) onReplaceCard(card.id, file);
                }}
              >
                <div className="relative">
                  <MockupView {...inputFor(target)} scale={scale} onSource={(el) => onSource(key, el)} />
                  {dropOn === key && (
                    <span className="pointer-events-none absolute inset-0 grid place-items-center rounded-[2rem] bg-primary/25 ring-4 ring-primary">
                      <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">Soltá para reemplazarlo</span>
                    </span>
                  )}
                </div>
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
                    <>
                      <Hint label="Reemplazar este archivo">
                        <Button variant="ghost" size="iconSm" aria-label={`Reemplazar el archivo ${cardIndex + 1}`} onClick={() => replace(card.id)}>
                          <RefreshCw />
                        </Button>
                      </Hint>
                      <Hint label="Sacar este archivo del carrusel">
                        <Button variant="ghost" size="iconSm" aria-label={`Sacar el archivo ${cardIndex + 1} del carrusel`} onClick={() => onRemoveCard(card.id)}>
                          <X />
                        </Button>
                      </Hint>
                    </>
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
