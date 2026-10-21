"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { BoxSelect, Download, Eye, EyeOff, FolderDown, ImagePlus, Plus, ScanLine, Settings, Users } from "lucide-react";
import { ClientMark, logoBackground } from "@/components/clients/ClientMark";
import { BarAction, BarButton, BarDivider, BarPopover, ContextBar } from "@/components/shell/ContextBar";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { useClients } from "@/hooks/useClients";
import { useStoredState } from "@/hooks/useStoredState";
import { pieceInfo, placementInfo } from "@/lib/ads/placements";
import { ctaText } from "@/lib/ads/text";
import { initials } from "@/lib/clients/color";
import { fold } from "@/lib/redaccion/text";
import { cn } from "@/lib/utils";
import { AddPieceDialog } from "./AddPieceDialog";
import { AdsSettings, DEFAULT_OPTIONS, type AdOptions } from "./AdsSettings";
import { PHONE, loadImage, mediaFrame, renderMockupPng, type AvatarSource, type MockupInput } from "./draw";
import { PieceRow, type MockupTarget } from "./PieceRow";
import { baseName, guessType, isOffRatio, loadFrames, MAX_CARDS, newPiece, readCards, type Piece } from "./pieces";

function saveFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** "Changan Uruguay" → "changanuruguay": un punto de partida para el usuario de Instagram. */
function handleOf(name: string) {
  return fold(name).replace(/[^a-z0-9._]/g, "") || "tu.marca";
}

/** La hora del teléfono: la de ahora, como en una captura. */
function useClock() {
  const [time, setTime] = useState("9:41");
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setTime(`${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`);
    };
    tick();
    const id = window.setInterval(tick, 20_000);
    return () => window.clearInterval(id);
  }, []);
  return time;
}

/** El nombre de un mockup al descargarlo: "Feed", "Historia - 2 de 5"… */
function mockupFile(t: MockupTarget) {
  const label = placementInfo(t.placement).label.replace(/[«»]/g, "");
  return t.piece.cards.length > 1 ? `${label} - ${t.cardIndex + 1} de ${t.piece.cards.length}` : label;
}

/** La carpeta (o el prefijo) de una pieza: "01 Post - campaña-otoño". */
function pieceFolder(piece: Piece, index: number) {
  return `${String(index + 1).padStart(2, "0")} ${pieceInfo(piece.type).label} - ${baseName(piece.cards[0].media)}`;
}

export function AdsShell() {
  const [stored, setOpts] = useStoredState<AdOptions>("ads:opciones", DEFAULT_OPTIONS);
  const opts = { ...DEFAULT_OPTIONS, ...stored };
  const set = (patch: Partial<AdOptions>) => setOpts((o) => ({ ...o, ...patch }));
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [adding, setAdding] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarImg, setAvatarImg] = useState<HTMLImageElement | null>(null);
  const [showUI, setShowUI] = useState(true);
  const [mark, setMark] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [scale, setScale] = useState(0.55);
  const [exporting, setExporting] = useState(false);
  /** El <img>/<video> que se ve en cada teléfono, para descargar en el cuadro en que está. */
  const shown = useRef(new Map<string, HTMLImageElement | HTMLVideoElement>());
  const time = useClock();
  const { clients } = useClients();
  const client = clients.find((c) => c.id === opts.clientId) ?? null;

  const patchPiece = (id: string, patch: Partial<Piece>) => setPieces((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const setFrame = useCallback(
    (cardId: string, frame: CanvasImageSource) =>
      setPieces((prev) => prev.map((p) => ({ ...p, cards: p.cards.map((c) => (c.id === cardId ? { ...c, frame } : c)) }))),
    []
  );

  const addPiece = useCallback(
    (piece: Piece) => {
      setPieces((prev) => [...prev, piece]);
      loadFrames(piece.cards, setFrame);
      // Que se vea la pieza nueva.
      setTimeout(() => document.getElementById(`pieza-${piece.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
    },
    [setFrame]
  );

  /** Arrastrar o pegar archivos arma la pieza sola (el tipo se cambia arriba de sus mockups). */
  const quickAdd = useCallback(
    async (files: File[]) => {
      const cards = await readCards(files.slice(0, MAX_CARDS), (m) => toast(m, "error"));
      if (!cards.length) return toast("Elegí imágenes o videos.", "error");
      const piece = newPiece(guessType(cards), cards);
      addPiece(piece);
      toast(`Se agregó como ${pieceInfo(piece.type).label.toLowerCase()}: si no es, cambialo arriba de sus mockups.`);
    },
    [addPiece]
  );

  const addCards = async (piece: Piece, files: File[]) => {
    const room = MAX_CARDS - piece.cards.length;
    const cards = await readCards(files.slice(0, room), (m) => toast(m, "error"));
    if (!cards.length) return;
    setPieces((prev) => prev.map((p) => (p.id === piece.id ? { ...p, type: "carrusel", cards: [...p.cards, ...cards] } : p)));
    loadFrames(cards, setFrame);
  };

  /** Cambia un archivo por otro (mismo lugar en el carrusel). */
  const replaceCard = async (piece: Piece, cardId: string, file: File) => {
    const [card] = await readCards([file], (m) => toast(m, "error"));
    if (!card) return;
    const old = piece.cards.find((c) => c.id === cardId);
    if (old) URL.revokeObjectURL(old.media.url);
    setPieces((prev) => prev.map((p) => (p.id === piece.id ? { ...p, cards: p.cards.map((c) => (c.id === cardId ? card : c)) } : p)));
    loadFrames([card], setFrame);
  };

  const removeCard = (piece: Piece, cardId: string) => {
    const card = piece.cards.find((c) => c.id === cardId);
    if (card) URL.revokeObjectURL(card.media.url);
    patchPiece(piece.id, { cards: piece.cards.filter((c) => c.id !== cardId) });
  };

  const removePiece = (piece: Piece) => {
    piece.cards.forEach((c) => URL.revokeObjectURL(c.media.url));
    setPieces((prev) => prev.filter((p) => p.id !== piece.id));
  };

  // Ctrl+V con imágenes copiadas arma una pieza, desde cualquier parte de la página.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (adding) return;
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => /^(image|video)\//.test(f.type));
      if (!files.length) return;
      e.preventDefault();
      quickAdd(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [quickAdd, adding]);

  // Los teléfonos entran enteros a lo alto (y en el celular, casi a lo ancho).
  useEffect(() => {
    const measure = () => setScale(Math.max(0.4, Math.min(0.62, (window.innerHeight - 320) / PHONE.h, (window.innerWidth - 64) / PHONE.w)));
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (!adding) quickAdd([...e.dataTransfer.files]);
  };

  const pickAvatar = (file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    setAvatarUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  };

  const avatar = avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
  ) : client ? (
    <ClientMark brand={client} className="h-full w-full rounded-full text-[13px]" pad="p-[18%]" />
  ) : (
    <span className="text-[13px] font-semibold uppercase">{(opts.account || "t").slice(0, 1)}</span>
  );

  /** La misma foto de perfil, para dibujarla. */
  const avatarSource: AvatarSource = avatarUrl
    ? { url: avatarUrl }
    : client?.logo_url
      ? { url: client.logo_url, background: logoBackground(client), pad: 0.18 }
      : client
        ? { letter: initials(client.name), background: client.color }
        : { letter: (opts.account || "t").slice(0, 1) };
  const avatarKey = "url" in avatarSource ? avatarSource.url : "";

  useEffect(() => {
    let alive = true;
    if (!avatarKey) {
      setAvatarImg(null);
      return;
    }
    loadImage(avatarKey).then((img) => alive && setAvatarImg(img));
    return () => {
      alive = false;
    };
  }, [avatarKey]);

  /** Todo lo de un mockup menos el creativo (eso lo pone la pantalla o la descarga). */
  const inputFor = ({ piece, card, cardIndex, placement }: MockupTarget): Omit<MockupInput, "source"> => {
    const feed = placementInfo(placement).kind === "feed";
    const c = piece.cards[0].colors;
    return {
      placement,
      media: card.media,
      thumb: card.frame ?? null,
      fit: feed || !isOffRatio(card.media) ? "cover" : piece.fit,
      account: opts.account,
      avatar: avatarSource,
      avatarImg,
      caption: opts.caption,
      headline: opts.headline,
      cta: ctaText(opts.cta, opts.lang),
      lang: opts.lang,
      colors: { ...c, cta: piece.ctaColor ?? c.cta },
      social: opts.social,
      showUI,
      mark,
      safeZone: opts.safeZone,
      time,
      card: piece.cards.length > 1 ? { index: cardIndex, total: piece.cards.length } : undefined,
    };
  };

  /** Un mockup como PNG, tal como se ve (con la interfaz, las marcas y la zona segura que estén). */
  const buildImage = async (t: MockupTarget, source?: CanvasImageSource | null) => {
    const frame = source ?? t.card.frame ?? (await mediaFrame(t.card.media));
    return renderMockupPng({ ...inputFor(t), thumb: t.card.frame ?? frame, source: frame });
  };

  const sourceOf = (t: MockupTarget) => shown.current.get(`${t.piece.id}:${t.card.id}:${t.placement}`);

  const run = async (job: () => Promise<void>) => {
    setExporting(true);
    try {
      await job();
    } catch (err) {
      toast(err instanceof Error ? err.message : "No se pudo armar la imagen.", "error");
    } finally {
      setExporting(false);
    }
  };

  const downloadOne = (t: MockupTarget) =>
    run(async () => {
      const index = pieces.findIndex((p) => p.id === t.piece.id);
      saveFile(await buildImage(t, sourceOf(t)), `${pieceFolder(t.piece, index)} - ${mockupFile(t)}.png`);
    });

  const copyOne = async (t: MockupTarget) => {
    if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
      return toast("Este navegador no deja copiar imágenes: usá Descargar.", "error");
    }
    setExporting(true);
    try {
      // La promesa va directo al portapapeles: Safari solo deja copiar si el pedido sale del mismo click.
      await navigator.clipboard.write([new ClipboardItem({ "image/png": buildImage(t, sourceOf(t)) })]);
      toast("Imagen copiada: pegala donde quieras");
    } catch (err) {
      toast(err instanceof DOMException ? "El navegador no dejó copiar la imagen: usá Descargar." : err instanceof Error ? err.message : "No se pudo copiar.", "error");
    } finally {
      setExporting(false);
    }
  };

  const targetsOf = (piece: Piece): MockupTarget[] =>
    piece.placements.flatMap((placement) => piece.cards.map((card, cardIndex) => ({ piece, card, cardIndex, placement })));

  /** Varios archivos en un .zip (los navegadores frenan muchas descargas seguidas). */
  const zipOf = async (entries: { name: string; target: MockupTarget }[], zipName: string) => {
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    for (const e of entries) zip.file(e.name, await buildImage(e.target));
    saveFile(await zip.generateAsync({ type: "blob" }), zipName);
    toast(`${entries.length} imágenes en un .zip`);
  };

  const downloadPiece = (piece: Piece) =>
    run(async () => {
      const index = pieces.findIndex((p) => p.id === piece.id);
      const folder = pieceFolder(piece, index);
      const targets = targetsOf(piece);
      if (targets.length === 1) return saveFile(await buildImage(targets[0]), `${folder} - ${mockupFile(targets[0])}.png`);
      await zipOf(
        targets.map((target) => ({ name: `${mockupFile(target)}.png`, target })),
        `${folder}.zip`
      );
    });

  /** Todo: una carpeta por pieza con sus mockups. */
  const downloadAll = () =>
    run(async () => {
      const entries = pieces.flatMap((piece, i) =>
        targetsOf(piece).map((target) => ({ name: `${pieceFolder(piece, i)}/${mockupFile(target)}.png`, target }))
      );
      if (entries.length === 1) return saveFile(await buildImage(entries[0].target), entries[0].name.replace("/", " - "));
      const account = (opts.account || "anuncios").replace(/[^\w.-]+/g, "-");
      await zipOf(entries, `mockups-${account}.zip`);
    });

  const total = pieces.reduce((n, p) => n + p.placements.length * p.cards.length, 0);

  return (
    <div
      className="min-h-screen"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={onDrop}
      // Soltar sobre una fila no llega acá (la fila lo usa): igual se deja de marcar la página.
      onDropCapture={() => setDragging(false)}
    >
      <ContextBar>
        <BarAction label="Agregar pieza" icon={Plus} onClick={() => setAdding(true)}>
          Agregar pieza
        </BarAction>
        <BarDivider />
        <BarButton label={showUI ? "Ver sin la interfaz" : "Ver con la interfaz"} icon={showUI ? Eye : EyeOff} pressed={!showUI} onClick={() => setShowUI((v) => !v)} />
        <BarButton label="Marcar lo que tapa" icon={BoxSelect} pressed={mark} onClick={() => setMark((v) => !v)} />
        <BarButton label="Zona segura de Meta" icon={ScanLine} pressed={opts.safeZone} onClick={() => set({ safeZone: !opts.safeZone })} />
        <BarButton
          label={opts.social ? "Ocultar las burbujas de seguidores" : "Mostrar las burbujas de seguidores"}
          icon={Users}
          pressed={opts.social}
          onClick={() => set({ social: !opts.social })}
        />
        <BarPopover label="Configuración" icon={Settings} className="w-[22rem]" align="end" open={settingsOpen} onOpenChange={setSettingsOpen} focusPanel>
          <AdsSettings
            opts={opts}
            set={set}
            clients={clients}
            avatar={avatar}
            onAvatar={pickAvatar}
            onClient={(id) => {
              const c = clients.find((x) => x.id === id) ?? null;
              set({ clientId: c?.id ?? null, ...(c ? { account: handleOf(c.name) } : {}) });
            }}
          />
        </BarPopover>
        {total > 0 && (
          <>
            <BarDivider />
            <BarButton
              label={total > 1 ? `Descargar los ${total} mockups en un .zip` : "Descargar el mockup"}
              icon={total > 1 ? FolderDown : Download}
              onClick={downloadAll}
              disabled={exporting}
            />
          </>
        )}
      </ContextBar>

      <AddPieceDialog open={adding} onOpenChange={setAdding} onAdd={addPiece} />

      <main className="mx-auto max-w-[96rem] px-4 pb-16 pt-[6.5rem] sm:px-6">
        <div className="mb-8 text-center">
          <h1 className="font-display text-4xl leading-none tracking-[-0.01em] sm:text-5xl">Ads</h1>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            Sumá cada pieza (post, carrusel, reel o historia) y mirala en los mockups de Instagram que elijas, con todo lo que la
            app pone encima: así ves si algo queda tapado antes de publicarla.
          </p>
        </div>

        {pieces.length === 0 ? (
          <div className={cn("mx-auto max-w-xl rounded-3xl border-2 border-dashed border-foreground/10 bg-card/80 p-8 text-center shadow-sm transition-colors", dragging && "border-primary bg-primary/10")}>
            <ImagePlus className="mx-auto h-7 w-7" />
            <p className="mt-3 font-medium">Todavía no hay piezas</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              Agregá la primera: elegís qué es (post, carrusel, reel o historia), subís el archivo y en qué mockups verla.
            </p>
            <Button className="mt-4" onClick={() => setAdding(true)}>
              <Plus /> Agregar pieza
            </Button>
            <p className="mt-3 text-xs text-muted-foreground">También podés arrastrar o pegar (Ctrl+V) los archivos: la pieza se arma sola.</p>
          </div>
        ) : (
          <div className={cn("space-y-6 rounded-3xl transition-colors", dragging && "bg-primary/10")}>
            {pieces.map((piece, i) => (
              <div key={piece.id} id={`pieza-${piece.id}`} className="scroll-mt-24">
                <PieceRow
                  piece={piece}
                  index={i}
                  scale={scale}
                  exporting={exporting}
                  inputFor={inputFor}
                  onPatch={(patch) => patchPiece(piece.id, patch)}
                  onRemove={() => removePiece(piece)}
                  onAddCards={(files) => addCards(piece, files)}
                  onReplaceCard={(cardId, file) => replaceCard(piece, cardId, file)}
                  onRemoveCard={(cardId) => removeCard(piece, cardId)}
                  onDownloadPiece={() => downloadPiece(piece)}
                  onCopy={copyOne}
                  onDownload={downloadOne}
                  onSource={(key, el) => {
                    if (el) shown.current.set(key, el);
                    else shown.current.delete(key);
                  }}
                />
              </div>
            ))}
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex w-full items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-foreground/10 py-5 text-sm font-medium text-muted-foreground outline-none ring-ring transition-colors hover:border-foreground/25 hover:text-foreground focus-visible:ring-2"
            >
              <Plus className="h-4 w-4" /> Agregar pieza
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

