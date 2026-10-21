"use client";

import { useRef, type ReactNode } from "react";
import { PanelTitle } from "@/components/shell/ContextBar";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Placement } from "@/lib/ads/placements";
import { CTAS, type Lang } from "@/lib/ads/text";
import type { Brand } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Lo que se configura una vez y vale para todas las piezas (se recuerda en la cuenta). */
export type AdOptions = {
  account: string;
  caption: string;
  /** El título del anuncio: va en la tarjeta de la pestaña Reels. */
  headline: string;
  /** El botón, guardado por su texto en español. */
  cta: string;
  lang: Lang;
  clientId: string | null;
  social: boolean;
  safeZone: boolean;
  /** De antes de las piezas; ya no se usa. */
  placements?: Placement[];
};

export const DEFAULT_OPTIONS: AdOptions = {
  account: "tu.marca",
  caption: "El texto del anuncio va acá.\nSegunda línea, que Instagram esconde detrás del ...",
  headline: "Título del anuncio",
  cta: "Más información",
  lang: "es",
  clientId: null,
  social: true,
  safeZone: false,
};

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

/** El panel del engranaje: la cuenta, los textos, el botón y el idioma de Instagram. */
export function AdsSettings({
  opts,
  set,
  clients,
  avatar,
  onAvatar,
  onClient,
}: {
  opts: AdOptions;
  set: (patch: Partial<AdOptions>) => void;
  clients: Brand[];
  avatar: ReactNode;
  onAvatar: (file: File | undefined) => void;
  onClient: (id: string | null) => void;
}) {
  const avatarRef = useRef<HTMLInputElement>(null);
  return (
    <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
      <PanelTitle title="Configuración" hint="Vale para todas las piezas. Se recuerda en tu cuenta." />

      {clients.length > 0 && (
        <Field label="Cliente">
          <Select value={opts.clientId ?? "ninguno"} onValueChange={(v) => onClient(v === "ninguno" ? null : v)}>
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
        <input ref={avatarRef} type="file" accept="image/*" className="hidden" onChange={(e) => onAvatar(e.target.files?.[0])} />
      </div>

      <Field label="Texto del anuncio" hint="Se ve solo el principio: una línea en Reels desde el feed, dos en la pestaña Reels y en el feed.">
        <textarea
          value={opts.caption}
          onChange={(e) => set({ caption: e.target.value })}
          rows={3}
          className="w-full resize-y rounded-md border border-input bg-card px-3 py-2 text-sm outline-none ring-ring focus-visible:ring-2"
        />
      </Field>

      <Field label="Título" hint="El de la tarjeta de la pestaña Reels.">
        <Input value={opts.headline} onChange={(e) => set({ headline: e.target.value })} placeholder="Título del anuncio" className="h-9" />
      </Field>

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

      <Field label="Instagram en" hint="Cambia los textos de la app («Más información» o «Learn more»…): no miden lo mismo.">
        <span className="flex gap-1 rounded-full bg-secondary p-0.5" role="radiogroup" aria-label="Idioma de Instagram">
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
        </span>
      </Field>
    </div>
  );
}
