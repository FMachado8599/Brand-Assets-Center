"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { AlertTriangle, BoxSelect, Check, ChevronLeft, ChevronRight, Copy, Download, Eye, EyeOff, FolderDown, ImagePlus, ScanLine, Upload, X } from "lucide-react";
import { ClientMark, logoBackground } from "@/components/clients/ClientMark";
import { BarAction, BarButton, BarDivider, BarNote, ContextBar } from "@/components/shell/ContextBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toaster";
import { Hint } from "@/components/ui/tooltip";
import { useClients } from "@/hooks/useClients";
import { useStoredState } from "@/hooks/useStoredState";
import { DEFAULT_COLORS, sampleColors, type AdColors } from "@/lib/ads/color";
import { PLACEMENTS, placementInfo, type Placement } from "@/lib/ads/placements";
import { ratioGap, ratioLabel, type AdMedia } from "@/lib/ads/reel";
import { CTAS, ctaText, type Lang } from "@/lib/ads/text";
import { initials } from "@/lib/clients/color";
import { fold } from "@/lib/redaccion/text";
import { cn } from "@/lib/utils";
import { PHONE, loadImage, mediaFrame, renderMockupPng, type AvatarSource, type MockupInput } from "./draw";
import { MockupView } from "./MockupView";

type AdOptions = {
  account: string;
  caption: string;
  /** El título del anuncio: va en la tarjeta de la pestaña Reels. */
  headline: string;
  /** El botón, guardado por su texto en español. */
  cta: string;
  lang: Lang;
  /** Qué mockups se arman para cada creativo. */
  placements: Placement[];
  clientId: string | null;
  social: boolean;
  safeZone: boolean;
};

const DEFAULT_OPTIONS: AdOptions = {
  account: "tu.marca",
  caption: "El texto del anuncio va acá.\nSegunda línea, que Instagram esconde detrás del ...",
  headline: "Título del anuncio",
  cta: "Más información",
  lang: "es",
  placements: PLACEMENTS.map((p) => p.id),
  clientId: null,
  social: true,
  safeZone: false,
};

/** Un creativo subido: el archivo, sus colores y lo que se ajusta de cada uno. */
type AdItem = {
  id: string;
  media: AdMedia;
  colors: AdColors;
  /** Un cuadro quieto (la imagen, o uno del video): la miniatura de Reels y lo que se descarga en lote. */
  frame?: CanvasImageSource;
  /** El color del botón elegido a mano (si no, sale del creativo). */
  ctaColor: string | null;
  /** Si no es 9:16: entero con fondo o recortado. */
  fit: "cover" | "contain";
};

const isOffRatio = (m: AdMedia) => ratioGap(m) > 0.02;
const isLowRes = (m: AdMedia) => Math.min(m.width, (m.height * 9) / 16) < 1080;

/** "campaña-otoño.jpg" → "campaña-otoño" (sin caracteres que Windows no acepta). */
function baseName(m: AdMedia) {
  return m.name.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]+/g, "-").trim() || "anuncio";
}

const placementFile = (p: Placement) => placementInfo(p).label.replace(/[«»]/g, "");

function saveFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
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

/** Abre el archivo para medirlo y sacarle los colores; el creativo nunca sale del navegador. */
function readMedia(file: File): Promise<{ media: AdMedia; colors: AdColors }> {
  const kind = file.type.startsWith("video/") ? "video" : file.type.startsWith("image/") ? "image" : null;
  if (!kind) return Promise.reject(new Error("Eso no es una imagen ni un video."));
  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const fail = () => {
      URL.revokeObjectURL(url);
      reject(new Error(kind === "video" ? "El navegador no pudo abrir ese video." : "No se pudo abrir esa imagen."));
    };
    if (kind === "image") {
      const img = new Image();
      img.onload = () =>
        resolve({
          media: { url, kind, width: img.naturalWidth, height: img.naturalHeight, name: file.name },
          colors: sampleColors(img, img.naturalWidth, img.naturalHeight),
        });
      img.onerror = fail;
      img.src = url;
      return;
    }
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.onloadedmetadata = () => {
      // Los colores salen de un cuadro de adentro: el primero suele ser negro.
      video.currentTime = Math.min(1, (video.duration || 0) / 3);
    };
    video.onseeked = () =>
      resolve({
        media: { url, kind, width: video.videoWidth, height: video.videoHeight, name: file.name },
        colors: sampleColors(video, video.videoWidth, video.videoHeight),
      });
    video.onerror = fail;
    video.src = url;
  });
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 py-2">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} className="mt-0.5" />
    </label>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium">{label}</span>
      {children}
    </label>
  );
}

export function AdsShell() {
  const [opts, setOpts] = useStoredState<AdOptions>("ads:opciones", DEFAULT_OPTIONS);
  const set = (patch: Partial<AdOptions>) => setOpts((o) => ({ ...o, ...patch }));
  const [items, setItems] = useState<AdItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarImg, setAvatarImg] = useState<HTMLImageElement | null>(null);
  const [showUI, setShowUI] = useState(true);
  const [mark, setMark] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [layout, setLayout] = useState({ scale: 0.7, cols: 1 });
  const [exporting, setExporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const avatarRef = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLDivElement>(null);
  /** El <img>/<video> que se ve en cada teléfono, para descargar en el cuadro en que está. */
  const shown = useRef(new Map<Placement, HTMLImageElement | HTMLVideoElement>());
  const time = useClock();
  const { clients } = useClients();
  const client = clients.find((c) => c.id === opts.clientId) ?? null;

  // Los tipos en el orden de la lista (y al menos uno).
  const placements = PLACEMENTS.map((p) => p.id).filter((id) => opts.placements.includes(id));
  const togglePlacement = (id: Placement) => {
    const on = placements.includes(id);
    if (on && placements.length === 1) return toast("Dejá al menos un tipo de mockup.");
    set({ placements: on ? placements.filter((p) => p !== id) : [...placements, id] });
  };

  /** El creativo que se ve en los teléfonos. */
  const current = items.find((i) => i.id === selectedId) ?? items[0] ?? null;
  const index = current ? items.indexOf(current) : -1;
  const media = current?.media ?? null;
  const colors = current?.colors ?? DEFAULT_COLORS;
  const ctaColor = current?.ctaColor ?? null;
  const fit = current?.fit ?? "contain";
  const patchItem = (id: string, patch: Partial<AdItem>) => setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const setCtaColor = (color: string | null) => current && patchItem(current.id, { ctaColor: color });
  const setFit = (value: "cover" | "contain") => current && patchItem(current.id, { fit: value });
  const go = (step: number) => {
    if (items.length > 1) setSelectedId(items[(index + step + items.length) % items.length].id);
  };

  /** Suma los archivos (de a uno, en orden) y muestra el primero de los nuevos. */
  const addFiles = useCallback(async (files: File[]) => {
    const usable = files.filter((f) => /^(image|video)\//.test(f.type));
    if (!usable.length) return toast("Elegí imágenes o videos.", "error");
    const added: AdItem[] = [];
    for (const file of usable) {
      try {
        const { media, colors } = await readMedia(file);
        added.push({ id: crypto.randomUUID(), media, colors, ctaColor: null, fit: "contain" });
      } catch (err) {
        toast(`${file.name}: ${err instanceof Error ? err.message : "no se pudo abrir."}`, "error");
      }
    }
    if (!added.length) return;
    setItems((prev) => [...prev, ...added]);
    setSelectedId(added[0].id);
    if (added.length > 1) toast(`Se agregaron ${added.length} creativos`);
    // El cuadro quieto llega después: hasta entonces la miniatura usa el que se ve.
    for (const item of added) {
      mediaFrame(item.media)
        .then((frame) => setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, frame } : i))))
        .catch(() => {});
    }
  }, []);

  const removeItem = (id: string) => {
    const i = items.findIndex((x) => x.id === id);
    if (i < 0) return;
    URL.revokeObjectURL(items[i].media.url);
    const rest = items.filter((x) => x.id !== id);
    setItems(rest);
    if (current?.id === id) setSelectedId(rest[Math.min(i, rest.length - 1)]?.id ?? null);
  };

  // Ctrl+V con imágenes copiadas las suma, desde cualquier parte de la página.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => /^(image|video)\//.test(f.type));
      if (!files.length) return;
      e.preventDefault();
      addFiles(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addFiles]);

  // ← y → pasan de un creativo a otro (si no se está escribiendo).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.altKey || e.ctrlKey || e.metaKey || items.length < 2) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      go(e.key === "ArrowRight" ? 1 : -1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const multi = items.length > 1;
  const count = placements.length;

  // Los teléfonos entran en su columna: uno grande (entero en la pantalla) o varios en grilla.
  useEffect(() => {
    const el = gallery.current;
    if (!el) return;
    const measure = () => {
      const gap = 24;
      const cols = count === 1 ? 1 : Math.max(1, Math.min(count, Math.floor((el.clientWidth + gap) / (250 + gap))));
      const cell = (el.clientWidth - gap * (cols - 1)) / cols;
      const byHeight = count === 1 ? (window.innerHeight - (multi ? 330 : 280)) / PHONE.h : 1;
      setLayout({ cols, scale: Math.max(0.36, Math.min(1, cell / PHONE.w, byHeight)) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [count, multi]);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    addFiles([...e.dataTransfer.files]);
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

  const offRatio = media ? isOffRatio(media) : false;
  const lowRes = media ? isLowRes(media) : false;

  /** Todo lo de un mockup menos el creativo (eso lo pone la pantalla o la descarga). */
  const inputFor = (item: AdItem | null, placement: Placement): Omit<MockupInput, "source"> => {
    const c = item?.colors ?? DEFAULT_COLORS;
    return {
      placement,
      media: item?.media ?? null,
      thumb: item?.frame ?? null,
      fit: item && isOffRatio(item.media) ? item.fit : "cover",
      account: opts.account,
      avatar: avatarSource,
      avatarImg,
      caption: opts.caption,
      headline: opts.headline,
      cta: ctaText(opts.cta, opts.lang),
      lang: opts.lang,
      colors: { ...c, cta: item?.ctaColor ?? c.cta },
      social: opts.social,
      showUI,
      mark,
      safeZone: opts.safeZone,
      time,
    };
  };

  /** Un mockup como PNG, tal como se ve (con la interfaz, las marcas y la zona segura que estén). */
  const buildImage = async (item: AdItem, placement: Placement, source?: CanvasImageSource | null) => {
    const frame = source ?? item.frame ?? (await mediaFrame(item.media));
    return renderMockupPng({ ...inputFor(item, placement), thumb: item.frame ?? frame, source: frame });
  };

  const failed = (err: unknown) => toast(err instanceof Error ? err.message : "No se pudo armar la imagen.", "error");

  const run = async (job: () => Promise<void>) => {
    setExporting(true);
    try {
      await job();
    } catch (err) {
      failed(err);
    } finally {
      setExporting(false);
    }
  };

  /** El teléfono que se ve: sale en el cuadro en que está el video. */
  const downloadShown = (placement: Placement) =>
    run(async () => {
      if (!current) return;
      saveFile(await buildImage(current, placement, shown.current.get(placement)), `${baseName(current.media)} - ${placementFile(placement)}.png`);
    });

  const copyShown = async (placement: Placement) => {
    if (!current) return;
    if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
      return toast("Este navegador no deja copiar imágenes: usá Descargar.", "error");
    }
    setExporting(true);
    try {
      // La promesa va directo al portapapeles: Safari solo deja copiar si el pedido sale del mismo click.
      await navigator.clipboard.write([new ClipboardItem({ "image/png": buildImage(current, placement, shown.current.get(placement)) })]);
      toast("Imagen copiada: pegala donde quieras");
    } catch (err) {
      failed(err instanceof DOMException ? new Error("El navegador no dejó copiar la imagen: usá Descargar.") : err);
    } finally {
      setExporting(false);
    }
  };

  /** Varios archivos en un .zip (los navegadores frenan muchas descargas seguidas). */
  const zipOf = async (entries: { name: string; item: AdItem; placement: Placement }[], zipName: string) => {
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    for (const e of entries) zip.file(e.name, await buildImage(e.item, e.placement));
    saveFile(await zip.generateAsync({ type: "blob" }), zipName);
    toast(`${entries.length} imágenes en un .zip`);
  };

  /** Los mockups de un creativo: una imagen o, si son varios, un .zip. */
  const downloadItem = (item: AdItem) =>
    run(async () => {
      const base = baseName(item.media);
      if (placements.length === 1) return saveFile(await buildImage(item, placements[0]), `${base} - ${placementFile(placements[0])}.png`);
      await zipOf(
        placements.map((placement) => ({ name: `${base} - ${placementFile(placement)}.png`, item, placement })),
        `${base} - mockups.zip`
      );
    });

  /** Todo: una carpeta por creativo (si hay más de uno) con un mockup por tipo. */
  const downloadAll = () =>
    run(async () => {
      const used = new Set<string>();
      const entries = items.flatMap((item, i) => {
        let folder = baseName(item.media);
        if (used.has(folder)) folder = `${folder} ${i + 1}`;
        used.add(folder);
        return placements.map((placement) => ({
          name: multi ? `${folder}/${placementFile(placement)}.png` : `${folder} - ${placementFile(placement)}.png`,
          item,
          placement,
        }));
      });
      if (entries.length === 1) return saveFile(await buildImage(entries[0].item, entries[0].placement), entries[0].name);
      const account = (opts.account || "anuncios").replace(/[^\w.-]+/g, "-");
      await zipOf(entries, `mockups-${account}.zip`);
    });

  const total = items.length * placements.length;

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
    >
      <ContextBar>
        <BarButton label="Subir imágenes o videos" icon={Upload} onClick={() => fileRef.current?.click()} />
        <BarDivider />
        <BarButton label={showUI ? "Ver sin la interfaz" : "Ver con la interfaz"} icon={showUI ? Eye : EyeOff} pressed={!showUI} onClick={() => setShowUI((v) => !v)} />
        <BarButton label="Marcar lo que tapa" icon={BoxSelect} pressed={mark} onClick={() => setMark((v) => !v)} />
        <BarButton label="Zona segura de Meta" icon={ScanLine} pressed={opts.safeZone} onClick={() => set({ safeZone: !opts.safeZone })} />
        {media && <BarNote>{`${multi ? `${index + 1} de ${items.length} · ` : ""}${ratioLabel(media)} · ${media.width}×${media.height}`}</BarNote>}
        <BarDivider />
        <BarAction
          label={total > 1 ? `Descargar las ${total} imágenes en un .zip` : "Descargar la imagen"}
          icon={total > 1 ? FolderDown : Download}
          onClick={downloadAll}
          disabled={!items.length || exporting}
        >
          {total > 1 ? "Descargar todo" : "Descargar"}
        </BarAction>
      </ContextBar>

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

      <main className="mx-auto max-w-7xl px-4 pb-16 pt-[6.5rem] sm:px-6">
        <div className="mb-8 text-center">
          <h1 className="font-display text-4xl leading-none tracking-[-0.01em] sm:text-5xl">Ads</h1>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            Subí uno o varios creativos y miralos como salen en los anuncios de Reels y de historias de Instagram, con todo lo
            que la app pone encima: así ves si algo queda tapado antes de publicarlo.
          </p>
        </div>

        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,22rem)_1fr]">
          <div className="order-2 space-y-4 lg:order-1">
            {/* Los creativos */}
            <section className={cn("rounded-3xl border bg-card p-4 shadow-sm transition-colors", dragging && "border-primary bg-primary/10")}>
              {items.length > 0 ? (
                <>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-xs font-medium">{items.length === 1 ? "1 creativo" : `${items.length} creativos`}</p>
                    <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                      <ImagePlus /> Agregar
                    </Button>
                  </div>
                  <ul className="-mx-1 max-h-[21rem] space-y-1 overflow-y-auto px-1 py-0.5">
                    {items.map((item, i) => {
                      const m = item.media;
                      const selected = item.id === current?.id;
                      const warn = isOffRatio(m) || isLowRes(m);
                      return (
                        <li key={item.id} className={cn("flex items-center gap-1 rounded-2xl p-1 transition-colors", selected ? "bg-secondary" : "hover:bg-secondary/60")}>
                          <button
                            type="button"
                            onClick={() => setSelectedId(item.id)}
                            aria-current={selected ? "true" : undefined}
                            className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1 text-left outline-none ring-ring focus-visible:ring-2"
                          >
                            <span className={cn("grid h-14 w-8 shrink-0 place-items-center overflow-hidden rounded-md bg-secondary", selected && "ring-2 ring-foreground")}>
                              {m.kind === "video" ? (
                                <video src={m.url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                              ) : (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={m.url} alt="" className="h-full w-full object-cover" />
                              )}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium" title={m.name}>
                                {multi && <span className="mr-1 tabular-nums text-muted-foreground">{i + 1}.</span>}
                                {m.name}
                              </span>
                              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                {warn && <AlertTriangle className="h-3 w-3 shrink-0 text-amber-600" aria-label="Tiene un aviso" />}
                                {m.kind === "video" ? "Video" : "Imagen"} · {ratioLabel(m)} · {m.width}×{m.height}
                              </span>
                            </span>
                          </button>
                          <Hint label={placements.length > 1 ? `Descargar sus ${placements.length} mockups` : "Descargar su mockup"}>
                            <Button
                              variant="ghost"
                              size="iconSm"
                              aria-label={`Descargar los mockups de ${m.name}`}
                              onClick={() => downloadItem(item)}
                              disabled={exporting}
                            >
                              <Download />
                            </Button>
                          </Hint>
                          <Hint label="Quitar">
                            <Button variant="ghost" size="iconSm" aria-label={`Quitar ${m.name}`} onClick={() => removeItem(item.id)}>
                              <X />
                            </Button>
                          </Hint>
                        </li>
                      );
                    })}
                  </ul>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-foreground/10 px-4 py-8 text-center outline-none ring-ring transition-colors hover:border-foreground/25 focus-visible:ring-2"
                >
                  <ImagePlus className="h-6 w-6" />
                  <span className="text-sm font-medium">Elegí las imágenes o los videos del anuncio</span>
                  <span className="text-xs text-muted-foreground">
                    Uno o varios. También podés arrastrarlos o pegarlos con Ctrl+V. Ideal: 1080×1920 (9:16).
                  </span>
                </button>
              )}

              {media && (offRatio || lowRes) && (
                <div className="mt-3 space-y-2 rounded-2xl bg-amber-100/70 p-3 text-xs text-amber-950">
                  {multi && <p className="font-semibold">{media.name}</p>}
                  {offRatio && (
                    <>
                      <p className="flex gap-1.5">
                        <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                        <span>
                          Es {ratioLabel(media)}, no 9:16. Meta lo acomoda a la pantalla: lo muestra entero con un fondo o lo recorta.
                          Para estar seguro, armá una versión 9:16.
                        </span>
                      </p>
                      <div className="flex gap-1 rounded-full bg-white/70 p-0.5" role="radiogroup" aria-label="Cómo mostrarlo">
                        {(
                          [
                            ["contain", "Entero con fondo"],
                            ["cover", "Recortado"],
                          ] as const
                        ).map(([value, label]) => (
                          <button
                            key={value}
                            type="button"
                            role="radio"
                            aria-checked={fit === value}
                            onClick={() => setFit(value)}
                            className={cn(
                              "h-7 flex-1 rounded-full text-xs font-medium transition-colors",
                              fit === value ? "bg-amber-950 text-white" : "hover:bg-white"
                            )}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  {lowRes && (
                    <p className="flex gap-1.5">
                      <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                      <span>
                        Mide {media.width}×{media.height}: en el teléfono se puede ver borroso. Meta pide 1080×1920.
                      </span>
                    </p>
                  )}
                </div>
              )}
            </section>

            {/* La cuenta y los textos */}
            <section className="space-y-3 rounded-3xl border bg-card p-4 shadow-sm">
              {clients.length > 0 && (
                <Field label="Cliente">
                  <Select
                    value={opts.clientId ?? "ninguno"}
                    onValueChange={(v) => {
                      const c = clients.find((x) => x.id === v) ?? null;
                      set({ clientId: c?.id ?? null, ...(c ? { account: handleOf(c.name) } : {}) });
                    }}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ninguno">Sin cliente</SelectItem>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}

              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <Field label="Usuario de la cuenta">
                    <Input value={opts.account} onChange={(e) => set({ account: e.target.value })} placeholder="tu.marca" className="h-9" />
                  </Field>
                </div>
                <button
                  type="button"
                  onClick={() => avatarRef.current?.click()}
                  className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary text-foreground ring-1 ring-black/10 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Elegir la foto de perfil"
                  title="Foto de perfil"
                >
                  {avatar}
                </button>
                <input ref={avatarRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickAvatar(e.target.files?.[0])} />
              </div>

              <Field label="Texto del anuncio">
                <textarea
                  value={opts.caption}
                  onChange={(e) => set({ caption: e.target.value })}
                  rows={3}
                  className="w-full resize-y rounded-md border border-input bg-card px-3 py-2 text-sm outline-none ring-ring focus-visible:ring-2"
                />
                <span className="block text-[11px] text-muted-foreground">En Reels se ve solo el principio: una línea desde el feed, dos en la pestaña Reels.</span>
              </Field>

              <Field label="Título (la tarjeta de la pestaña Reels)">
                <Input value={opts.headline} onChange={(e) => set({ headline: e.target.value })} placeholder="Título del anuncio" className="h-9" />
              </Field>

              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <Field label="Botón">
                    <Select value={opts.cta} onValueChange={(cta) => set({ cta })}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CTAS.map((c) => (
                          <SelectItem key={c.es} value={c.es}>
                            {c[opts.lang]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <label
                  className="relative grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-md ring-1 ring-black/10"
                  style={{ background: ctaColor ?? colors.cta }}
                  title="Color del botón de Reels (sale del creativo)"
                >
                  <span className="sr-only">Color del botón</span>
                  <input
                    type="color"
                    value={ctaColor ?? colors.cta}
                    className="absolute inset-0 cursor-pointer opacity-0"
                    onChange={(e) => setCtaColor(e.target.value)}
                  />
                </label>
              </div>
              {ctaColor && (
                <button type="button" onClick={() => setCtaColor(null)} className="text-xs font-medium text-muted-foreground hover:text-foreground">
                  Volver al color automático
                </button>
              )}

              <Field label="Instagram en">
                <div className="flex gap-1 rounded-full bg-secondary p-0.5" role="radiogroup" aria-label="Idioma de Instagram">
                  {(
                    [
                      ["es", "Español"],
                      ["en", "Inglés"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={opts.lang === value}
                      onClick={() => set({ lang: value })}
                      className={cn(
                        "h-7 flex-1 rounded-full text-xs font-medium text-muted-foreground transition-colors hover:text-foreground",
                        opts.lang === value && "bg-card text-foreground shadow-sm"
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <span className="block text-[11px] text-muted-foreground">Cambia los textos de la app, como «Más información» o «Learn more»: no miden lo mismo.</span>
              </Field>
            </section>

            {/* Qué se ve */}
            <section className="divide-y rounded-3xl border bg-card px-4 py-1 shadow-sm">
              <Toggle label="Interfaz de Instagram" hint="Apagala para ver el creativo solo y comparar." checked={showUI} onChange={setShowUI} />
              <Toggle label="Marcar lo que tapa" hint="Cada cosa de la app que va encima del creativo, en rojo." checked={mark} onChange={setMark} />
              <Toggle
                label="Zona segura de Meta"
                hint="Lo que Meta pide dejar libre: 14 % arriba, 35 % abajo y 6 % a los costados."
                checked={opts.safeZone}
                onChange={(safeZone) => set({ safeZone })}
              />
              <Toggle
                label="Burbujas de seguidores"
                hint="En Reels desde el feed: caras de gente que sigue a la cuenta. No siempre salen, pero tapan."
                checked={opts.social}
                onChange={(social) => set({ social })}
              />
            </section>
          </div>

          <div className="order-1 space-y-4 lg:order-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Qué mockups armar">
                {PLACEMENTS.map((p) => {
                  const on = placements.includes(p.id);
                  return (
                    <Hint key={p.id} label={p.hint}>
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() => togglePlacement(p.id)}
                        className={cn(
                          "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium outline-none ring-ring transition-colors focus-visible:ring-2",
                          on ? "border-foreground bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {on && <Check className="h-3.5 w-3.5" />}
                        {p.label}
                      </button>
                    </Hint>
                  );
                })}
              </div>
              {multi && (
                <div className="flex items-center gap-1 rounded-full border bg-card/80 p-1 text-xs font-medium shadow-sm">
                  <Button variant="ghost" size="iconSm" className="rounded-full" aria-label="Creativo anterior" onClick={() => go(-1)}>
                    <ChevronLeft />
                  </Button>
                  <span className="min-w-[4.5rem] text-center tabular-nums" aria-live="polite">
                    {index + 1} de {items.length}
                  </span>
                  <Button variant="ghost" size="iconSm" className="rounded-full" aria-label="Creativo siguiente" onClick={() => go(1)}>
                    <ChevronRight />
                  </Button>
                </div>
              )}
            </div>

            <div
              ref={gallery}
              className={cn("grid justify-items-center gap-6", count === 1 && "lg:sticky lg:top-24")}
              style={{ gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))` }}
            >
              {placements.map((placement) => (
                <figure key={placement} className="flex flex-col items-center gap-2">
                  <MockupView
                    key={`${current?.id ?? "vacío"}-${placement}`}
                    {...inputFor(current, placement)}
                    scale={layout.scale}
                    onSource={(el) => {
                      if (el) shown.current.set(placement, el);
                      else shown.current.delete(placement);
                    }}
                  />
                  <figcaption className="flex items-center gap-1">
                    <span className="mr-1 text-xs font-medium">{placementInfo(placement).label}</span>
                    <Hint label="Copiar la imagen">
                      <Button
                        variant="ghost"
                        size="iconSm"
                        aria-label={`Copiar el mockup ${placementInfo(placement).label}`}
                        onClick={() => copyShown(placement)}
                        disabled={!current || exporting}
                      >
                        <Copy />
                      </Button>
                    </Hint>
                    <Hint label="Descargar la imagen">
                      <Button
                        variant="ghost"
                        size="iconSm"
                        aria-label={`Descargar el mockup ${placementInfo(placement).label}`}
                        onClick={() => downloadShown(placement)}
                        disabled={!current || exporting}
                      >
                        <Download />
                      </Button>
                    </Hint>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
