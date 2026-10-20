"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { AlertTriangle, Eye, EyeOff, ImagePlus, ScanLine, BoxSelect, Upload, X } from "lucide-react";
import { ClientMark } from "@/components/clients/ClientMark";
import { BarButton, BarDivider, BarNote, ContextBar } from "@/components/shell/ContextBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toaster";
import { useClients } from "@/hooks/useClients";
import { useStoredState } from "@/hooks/useStoredState";
import { fold } from "@/lib/redaccion/text";
import { DEFAULT_COLORS, sampleColors, type AdColors } from "@/lib/ads/color";
import { CTAS, ratioGap, ratioLabel, type AdMedia } from "@/lib/ads/reel";
import { cn } from "@/lib/utils";
import { PHONE, ReelMockup } from "./ReelMockup";

type AdOptions = {
  account: string;
  caption: string;
  cta: string;
  clientId: string | null;
  social: boolean;
  safeZone: boolean;
};

const DEFAULT_OPTIONS: AdOptions = {
  account: "tu.marca",
  caption: "El texto del anuncio va acá.\nSegunda línea, que Instagram esconde detrás del ...",
  cta: "Más información",
  clientId: null,
  social: true,
  safeZone: false,
};

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
  const [media, setMedia] = useState<AdMedia | null>(null);
  const [colors, setColors] = useState<AdColors>(DEFAULT_COLORS);
  const [ctaColor, setCtaColor] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [fit, setFit] = useState<"cover" | "contain">("contain");
  const [showUI, setShowUI] = useState(true);
  const [mark, setMark] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [scale, setScale] = useState(0.7);
  const fileRef = useRef<HTMLInputElement>(null);
  const avatarRef = useRef<HTMLInputElement>(null);
  const phoneCol = useRef<HTMLDivElement>(null);
  const time = useClock();
  const { clients } = useClients();
  const client = clients.find((c) => c.id === opts.clientId) ?? null;

  const load = useCallback(async (file: File) => {
    try {
      const next = await readMedia(file);
      setMedia((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return next.media;
      });
      setColors(next.colors);
      setCtaColor(null);
    } catch (err) {
      toast(err instanceof Error ? err.message : "No se pudo abrir el archivo.", "error");
    }
  }, []);

  // Ctrl+V con una imagen copiada la carga, desde cualquier parte de la página.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.files ?? [])].find((f) => /^(image|video)\//.test(f.type));
      if (!file) return;
      e.preventDefault();
      load(file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [load]);

  // El teléfono entra entero en la pantalla y en su columna.
  useEffect(() => {
    const el = phoneCol.current;
    if (!el) return;
    const fit = () => {
      const byWidth = el.clientWidth / PHONE.w;
      // Entra entero al abrir la página, debajo del título.
      const byHeight = (window.innerHeight - 260) / PHONE.h;
      setScale(Math.max(0.42, Math.min(1, byWidth, byHeight)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    window.addEventListener("resize", fit);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, []);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = [...e.dataTransfer.files].find((f) => /^(image|video)\//.test(f.type));
    if (file) load(file);
    else toast("Soltá una imagen o un video.", "error");
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

  const offRatio = media ? ratioGap(media) > 0.02 : false;
  const lowRes = media ? Math.min(media.width, (media.height * 9) / 16) < 1080 : false;

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
        <BarButton label="Subir imagen o video" icon={Upload} onClick={() => fileRef.current?.click()} />
        <BarDivider />
        <BarButton label={showUI ? "Ver sin la interfaz" : "Ver con la interfaz"} icon={showUI ? Eye : EyeOff} pressed={!showUI} onClick={() => setShowUI((v) => !v)} />
        <BarButton label="Marcar lo que tapa" icon={BoxSelect} pressed={mark} onClick={() => setMark((v) => !v)} />
        <BarButton label="Zona segura de Meta" icon={ScanLine} pressed={opts.safeZone} onClick={() => set({ safeZone: !opts.safeZone })} />
        {media && <BarNote>{`${ratioLabel(media)} · ${media.width}×${media.height}`}</BarNote>}
      </ContextBar>

      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) load(file);
          e.target.value = "";
        }}
      />

      <main className="mx-auto max-w-5xl px-4 pb-16 pt-[6.5rem] sm:px-6">
        <div className="mb-8 text-center">
          <h1 className="font-display text-4xl leading-none tracking-[-0.01em] sm:text-5xl">Ads</h1>
          <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
            Subí el creativo y miralo como sale en un anuncio de Reels de Instagram, con todo lo que la app pone encima:
            así ves si algo queda tapado antes de publicarlo.
          </p>
        </div>

        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,22rem)_1fr]">
          <div className="order-2 space-y-4 lg:order-1">
            {/* El creativo */}
            <section className={cn("rounded-3xl border bg-card p-4 shadow-sm transition-colors", dragging && "border-primary bg-primary/10")}>
              {media ? (
                <div className="flex items-center gap-3">
                  <span className="grid h-16 w-9 shrink-0 place-items-center overflow-hidden rounded-md bg-secondary">
                    {media.kind === "video" ? (
                      <video src={media.url} muted playsInline className="h-full w-full object-cover" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={media.url} alt="" className="h-full w-full object-cover" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium" title={media.name}>
                      {media.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {media.kind === "video" ? "Video" : "Imagen"} · {ratioLabel(media)} · {media.width}×{media.height}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                    Cambiar
                  </Button>
                  <Button
                    variant="ghost"
                    size="iconSm"
                    aria-label="Quitar el creativo"
                    onClick={() => {
                      URL.revokeObjectURL(media.url);
                      setMedia(null);
                      setColors(DEFAULT_COLORS);
                    }}
                  >
                    <X />
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-foreground/10 px-4 py-8 text-center outline-none ring-ring transition-colors hover:border-foreground/25 focus-visible:ring-2"
                >
                  <ImagePlus className="h-6 w-6" />
                  <span className="text-sm font-medium">Elegí la imagen o el video del anuncio</span>
                  <span className="text-xs text-muted-foreground">También podés arrastrarlo o pegarlo con Ctrl+V. Ideal: 1080×1920 (9:16).</span>
                </button>
              )}

              {media && (offRatio || lowRes) && (
                <div className="mt-3 space-y-2 rounded-2xl bg-amber-100/70 p-3 text-xs text-amber-950">
                  {offRatio && (
                    <>
                      <p className="flex gap-1.5">
                        <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                        <span>
                          Es {ratioLabel(media)}, no 9:16. En Reels Meta lo acomoda a la pantalla: lo muestra entero con un fondo o lo
                          recorta. Para estar seguro, armá una versión 9:16.
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

            {/* La cuenta y el texto */}
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
                <span className="block text-[11px] text-muted-foreground">Instagram muestra solo el principio de la primera línea.</span>
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
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <label
                  className="relative grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-md ring-1 ring-black/10"
                  style={{ background: ctaColor ?? colors.cta }}
                  title="Color del botón (sale del creativo)"
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
                hint="Caras de gente que sigue a la cuenta; no siempre salen, pero tapan."
                checked={opts.social}
                onChange={(social) => set({ social })}
              />
            </section>
          </div>

          <div ref={phoneCol} className="order-1 flex justify-center lg:sticky lg:top-24 lg:order-2">
            <ReelMockup
              media={media}
              fit={offRatio ? fit : "cover"}
              account={opts.account}
              avatar={avatar}
              caption={opts.caption}
              cta={opts.cta}
              colors={{ ...colors, cta: ctaColor ?? colors.cta }}
              social={opts.social}
              showUI={showUI}
              mark={mark}
              safeZone={opts.safeZone}
              time={time}
              scale={scale}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
