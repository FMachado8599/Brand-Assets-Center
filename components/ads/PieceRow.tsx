"use client";

import { useRef, useState, type DragEvent } from "react";
import { AlertTriangle, ArrowLeftRight, Check, ChevronDown, Copy, Download, ImagePlus, Loader2, Maximize2, RefreshCw, Smartphone, X } from "lucide-react";
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
import { textCollisions } from "@/lib/ads/safe";
import { cn } from "@/lib/utils";
import { PHONE, type MockupInput } from "./draw";
import { MockupFullscreen, type FullscreenMockup } from "./MockupFullscreen";
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

type TextStatus = "off" | "scanning" | "ok" | "ignored" | number;

/**
 * El aviso de texto de un mockup: apagado (o en el feed, donde nada tapa), buscando, bien, ignorado o
 * cuántos textos caen donde no es seguro.
 */
function textStatus(piece: Piece, card: AdCard, input: Omit<MockupInput, "source">): TextStatus {
  if (!input.textCheck || placementInfo(input.placement).kind === "feed") return "off";
  if (piece.textIgnored.includes(card.id)) return "ignored";
  if (!card.texts) return "scanning";
  return textCollisions(input.placement, card.media, input.fit, card.texts).length || "ok";
}

const filesOf = (e: DragEvent) => [...e.dataTransfer.files].filter((f) => /^(image|video)\//.test(f.type));
const hasFiles = (e: DragEvent) => [...e.dataTransfer.types].includes("Files");

/**
 * Una pieza: arriba, en una línea, su tipo, su archivo y lo que se ajusta; abajo, un mockup por lugar, en fila.
 * En un carrusel cada mockup muestra un slide y tiene flechas para pasar; a la izquierda hay un lugar para soltar
 * más fotos, que abre el orden de los slides (también con "Ordenar slides"). Soltar un archivo sobre un teléfono
 * reemplaza el que se ve. Cada mockup lleva arriba su nombre y abajo sus acciones; tocándolo (o con "Ver en
 * pantalla completa") se abre en grande.
 */
export function PieceRow({
  piece,
  index,
  scale,
  exporting,
  inputFor,
  onPatch,
  onRemove,
  onOrder,
  onReplaceCard,
  onSlide,
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
  /** Abre el orden de los slides, con los archivos que se suman (si hay). */
  onOrder: (files?: File[]) => void;
  onReplaceCard: (cardId: string, file: File) => void;
  onSlide: (index: number) => void;
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
  /** El mockup abierto en pantalla completa (en un carrusel, el slide que se esté viendo). */
  const [big, setBig] = useState<{ cardId: string; placement: Placement } | null>(null);
  const first = piece.cards[0].media;
  const total = piece.cards.length;
  const carousel = piece.type === "carrusel" || total > 1;
  const textWarns = piece.cards.flatMap((card, i) => {
    const where = PLACEMENTS.map((p) => p.id).filter((placement) => piece.placements.includes(placement) && typeof textStatus(piece, card, inputFor({ piece, card, cardIndex: i, placement })) === "number");
    if (!where.length) return [];
    const who = piece.cards.length > 1 ? `El ${i + 1} tiene` : "Tiene";
    return [`${who} texto fuera de la zona segura en ${where.map((p) => placementInfo(p).label).join(", ")}.`];
  });
  const warns = [...textWarns, ...warnings(piece)];
  const ignoreText = (cardId: string, on: boolean) =>
    onPatch({ textIgnored: on ? [...piece.textIgnored, cardId] : piece.textIgnored.filter((id) => id !== cardId) });
  const placements = PLACEMENTS.map((p) => p.id).filter((id) => piece.placements.includes(id));
  const adapted = piece.cards.some((c) => isOffRatio(c.media)) && placements.some((p) => placementInfo(p).kind !== "feed");
  const color = piece.ctaColor ?? piece.cards[0].colors.cta;
  const count = placements.length * total;
  const summary = placements.length <= 2 ? placements.map((p) => placementInfo(p).label).join(" · ") : `${placements.length} mockups`;

  const mockupName = (placement: Placement, cardIndex: number) => `${placementInfo(placement).label}${total > 1 ? ` · ${cardIndex + 1}/${total}` : ""}`;
  const navFor = (cardIndex: number) =>
    total > 1 ? { index: cardIndex, total, onPrev: () => onSlide(cardIndex - 1), onNext: () => onSlide(cardIndex + 1) } : undefined;

  const bigCard = big ? (carousel ? piece.cards[Math.min(piece.slide, total - 1)] : piece.cards.find((c) => c.id === big.cardId)) : undefined;
  let fullscreen: FullscreenMockup | null = null;
  if (big && bigCard && placements.includes(big.placement)) {
    const cardIndex = piece.cards.indexOf(bigCard);
    fullscreen = {
      title: mockupName(big.placement, cardIndex),
      note: adaptation(big.placement, bigCard.media),
      mockup: { ...inputFor({ piece, card: bigCard, cardIndex, placement: big.placement }), nav: navFor(cardIndex) },
    };
  }

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
    if (carousel || files.length > 1) onOrder(files);
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
          {carousel ? "Soltá para sumar slides" : "Soltá para reemplazar el archivo (varios lo vuelven carrusel)"}
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
            <Hint label="Ordenar, sumar o sacar slides">
              <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-full px-3 text-xs" onClick={() => onOrder()}>
                <ArrowLeftRight className="!size-3.5" /> Ordenar slides
              </Button>
            </Hint>
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
            const files = [...(e.target.files ?? [])];
            if (files.length) onOrder(files);
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
        {carousel && total < MAX_CARDS && (
          <button
            type="button"
            onClick={() => addRef.current?.click()}
            onDragOver={(e) => {
              if (!hasFiles(e)) return;
              e.preventDefault();
              e.stopPropagation();
              if (dropOn !== "add") setDropOn("add");
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDropOn(null);
              const files = filesOf(e);
              if (files.length) onOrder(files);
            }}
            style={{ width: Math.max(120, PHONE.w * scale * 0.55), height: PHONE.h * scale }}
            className={cn(
              "flex shrink-0 snap-start flex-col items-center justify-center gap-2 rounded-[2rem] border-2 border-dashed px-3 text-center text-xs text-muted-foreground outline-none ring-ring transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:ring-2",
              dropOn === "add" ? "border-primary bg-primary/10 text-foreground" : "border-foreground/15"
            )}
          >
            <ImagePlus className="h-6 w-6" />
            <span className="font-medium">Sumar slides</span>
            <span>Soltá fotos acá o hacé click. Después las ordenás.</span>
          </button>
        )}
        {placements.flatMap((placement) =>
          (carousel ? [piece.cards[Math.min(piece.slide, total - 1)]] : piece.cards).map((card) => {
            const cardIndex = piece.cards.indexOf(card);
            const key = `${piece.id}:${card.id}:${placement}`;
            const target = { piece, card, cardIndex, placement };
            const note = adaptation(placement, card.media);
            const name = mockupName(placement, cardIndex);
            const input = inputFor(target);
            const status = textStatus(piece, card, input);
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
                <figcaption className="max-w-full text-center text-xs font-medium" style={{ width: PHONE.w * scale }}>
                  {name}
                  {note && <span className="block text-[10px] font-normal text-amber-700">{note}</span>}
                </figcaption>
                {/* Tocar el teléfono lo abre en grande (las flechas del carrusel no). */}
                <div className="relative cursor-zoom-in" onClick={() => setBig({ cardId: card.id, placement })}>
                  <MockupView key={card.id} {...input} scale={scale} onSource={(el) => onSource(key, el)} nav={navFor(cardIndex)} />
                  {dropOn === key && (
                    <span className="pointer-events-none absolute inset-0 grid place-items-center rounded-[2rem] bg-primary/25 ring-4 ring-primary">
                      <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">Soltá para reemplazarlo</span>
                    </span>
                  )}
                </div>
                <div className="flex max-w-full items-center gap-0.5">
                  <span className="mr-1 min-w-0">
                    {status !== "off" && (
                      <span
                        className={cn(
                          "flex items-center gap-1 text-[10px] font-normal",
                          typeof status === "number" ? "text-red-600" : status === "ok" ? "text-emerald-700" : "text-muted-foreground"
                        )}
                        aria-live="polite"
                      >
                        {status === "scanning" && (
                          <>
                            <Loader2 className="h-3 w-3 animate-spin" /> Buscando texto…
                          </>
                        )}
                        {status === "ok" && (
                          <>
                            <Check className="h-3 w-3" /> Sin texto fuera de la zona segura
                          </>
                        )}
                        {typeof status === "number" && (
                          <>
                            <AlertTriangle className="h-3 w-3 shrink-0" />
                            {status === 1 ? "Un texto" : `${status} textos`} fuera de la zona segura ·
                            <Hint label="Es una búsqueda automática: si no es texto, o está bien así, ignoralo">
                              <button type="button" onClick={() => ignoreText(card.id, true)} className="font-medium underline underline-offset-2 hover:text-red-800">
                                Ignorar
                              </button>
                            </Hint>
                          </>
                        )}
                        {status === "ignored" && (
                          <>
                            Aviso de texto ignorado ·
                            <button type="button" onClick={() => ignoreText(card.id, false)} className="font-medium underline underline-offset-2 hover:text-foreground">
                              Volver a avisar
                            </button>
                          </>
                        )}
                      </span>
                    )}
                  </span>
                  <Hint label="Ver en pantalla completa">
                    <Button variant="ghost" size="iconSm" aria-label={`Ver el mockup ${name} en pantalla completa`} onClick={() => setBig({ cardId: card.id, placement })}>
                      <Maximize2 />
                    </Button>
                  </Hint>
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
                    <Hint label="Reemplazar este slide (o soltá otro encima)">
                      <Button variant="ghost" size="iconSm" aria-label={`Reemplazar el slide ${cardIndex + 1}`} onClick={() => replace(card.id)}>
                        <RefreshCw />
                      </Button>
                    </Hint>
                  )}
                </div>
              </figure>
            );
          })
        )}
      </div>
      <MockupFullscreen shown={fullscreen} onClose={() => setBig(null)} />
    </section>
  );
}
