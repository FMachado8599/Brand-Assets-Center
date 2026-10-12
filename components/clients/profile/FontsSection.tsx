"use client";

import { useMemo, useState } from "react";
import { Check, Plus, Search, UploadCloud, X } from "lucide-react";
import { FontsTab } from "@/components/settings/FontsTab";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Hint } from "@/components/ui/tooltip";
import { groupByFamily } from "@/lib/fonts/fonts";
import type { BrandPatch } from "@/lib/repos/brands";
import { fold } from "@/lib/redaccion/text";
import type { Brand, FontFace } from "@/lib/types";
import { WEIGHT_NAMES } from "@/lib/types";
import { cn } from "@/lib/utils";
import { copyWithToast, Empty, Section, SmallAction } from "./Section";

const SAMPLE = "El veloz murciélago hindú comía feliz cardillo y kiwi";

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** La face para mostrar la familia: la Regular (o la más cercana a 400), sin cursiva si hay. */
function regularOf(faces: FontFace[]) {
  const upright = faces.filter((f) => !f.italic);
  const pool = upright.length ? upright : faces;
  return [...pool].sort((a, b) => Math.abs(a.weight - 400) - Math.abs(b.weight - 400))[0];
}

/**
 * Las tipografías del cliente. Se eligen entre las subidas en Tarjetas (o se
 * suben acá mismo) y también se puede anotar una que todavía no se subió.
 * Cada peso se copia con el nombre que reconocen Illustrator e InDesign.
 */
export function FontsSection({
  brand,
  fonts,
  save,
  onUploaded,
}: {
  brand: Brand;
  fonts: FontFace[];
  save: (patch: BrandPatch, done?: string) => Promise<boolean>;
  /** Después de subir archivos: recargar la lista de tipografías. */
  onUploaded: () => Promise<void>;
}) {
  const families = brand.font_families ?? [];
  const [sample, setSample] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);

  const uploaded = useMemo(() => groupByFamily(fonts), [fonts]);
  const facesOf = (family: string) => uploaded.find(([name]) => same(name, family))?.[1] ?? [];

  const link = (names: string[]) => {
    const fresh = names.filter((n) => n.trim() && !families.some((f) => same(f, n)));
    if (!fresh.length) return;
    save(
      { font_families: [...families, ...fresh.map((n) => n.trim())] },
      fresh.length === 1 ? `${fresh[0]} es de ${brand.name}` : `${fresh.length} tipografías sumadas a ${brand.name}`
    );
  };
  const unlink = (name: string) => save({ font_families: families.filter((f) => !same(f, name)) });

  return (
    <Section
      id="tipografias"
      title="Tipografías"
      hint="Cada peso se copia con su nombre completo, el que reconocen Illustrator e InDesign."
      action={
        <>
          <SmallAction onClick={() => setUploadOpen(true)}>
            <UploadCloud /> Subir
          </SmallAction>
          <AddFamily uploaded={uploaded} linked={families} onPick={(name) => link([name])} />
        </>
      }
    >
      {families.length > 0 && (
        <label className="relative mb-4 flex h-9 items-center">
          <span className="eyebrow pointer-events-none absolute left-3.5">Probar</span>
          <input
            value={sample}
            onChange={(e) => setSample(e.target.value)}
            placeholder={SAMPLE}
            aria-label="Texto de prueba"
            className="h-9 w-full rounded-full bg-secondary/70 pl-[4.5rem] pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:bg-secondary focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60 focus-visible:ring-offset-0"
          />
        </label>
      )}

      {families.length ? (
        <ul className="grid gap-3 lg:grid-cols-2">
          {families.map((family) => {
            const faces = facesOf(family);
            const regular = faces.length ? regularOf(faces) : null;
            return (
              <li key={family} className="group/font relative flex flex-col gap-3 rounded-2xl border bg-card p-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="eyebrow">{faces.length ? `${faces.length} ${faces.length === 1 ? "estilo" : "estilos"}` : "Sin subir"}</p>
                    <p className="truncate text-lg font-semibold">{family}</p>
                  </div>
                  {regular && (
                    <span
                      aria-hidden
                      className="text-5xl leading-none"
                      style={{ fontFamily: `'${regular.full_name}'`, fontWeight: regular.weight }}
                    >
                      Aa
                    </span>
                  )}
                  <Hint label={`Quitar ${family} de ${brand.name}`}>
                    <button
                      type="button"
                      onClick={() => unlink(family)}
                      aria-label={`Quitar ${family}`}
                      className="-mr-1.5 -mt-1.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:bg-secondary hover:text-foreground focus-visible:opacity-100 group-hover/font:opacity-100"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </Hint>
                </div>

                {regular ? (
                  <>
                    <p
                      className="line-clamp-2 break-words text-[1.35rem] leading-snug"
                      style={{ fontFamily: `'${regular.full_name}'`, fontWeight: regular.weight }}
                    >
                      {sample.trim() || SAMPLE}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {faces.map((f) => (
                        <Hint key={f.id} label={`Copiar “${f.full_name}”`}>
                          <button
                            type="button"
                            onClick={() => copyWithToast(f.full_name)}
                            className="h-7 rounded-full bg-secondary/80 px-2.5 text-xs transition-colors hover:bg-primary hover:text-primary-foreground"
                            style={{ fontFamily: `'${f.full_name}'`, fontWeight: f.weight, fontStyle: f.italic ? "italic" : "normal" }}
                          >
                            {f.style_name || WEIGHT_NAMES[f.weight] || f.weight}
                          </button>
                        </Hint>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Está anotada pero todavía no se subió.{" "}
                    <button type="button" onClick={() => setUploadOpen(true)} className="font-medium text-foreground underline underline-offset-2">
                      Subir los archivos
                    </button>
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty>
          Todavía no tiene tipografías. Elegí entre las que ya están subidas o subí las suyas.
        </Empty>
      )}

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Subir tipografías de {brand.name}</DialogTitle>
            <DialogDescription>Quedan en la biblioteca de todos (las usa Tarjetas) y se suman a este cliente.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[62vh] overflow-y-auto pr-1">
            <FontsTab
              showSaved={false}
              onSaved={async (names) => {
                await onUploaded();
                link(names);
                setUploadOpen(false);
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </Section>
  );
}

/** Elegir una familia de las subidas, o anotar una que todavía no está. */
function AddFamily({
  uploaded,
  linked,
  onPick,
}: {
  uploaded: [string, FontFace[]][];
  linked: string[];
  onPick: (family: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const q = fold(query.trim());
  const options = uploaded.filter(([name]) => !q || fold(name).includes(q));
  const exact = uploaded.some(([name]) => same(name, query)) || linked.some((f) => same(f, query));

  const pick = (name: string) => {
    onPick(name);
    setQuery("");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1.5 rounded-full border bg-card px-3 text-xs font-medium shadow-sm transition-colors hover:bg-secondary data-[state=open]:bg-secondary"
        >
          <Plus className="h-3.5 w-3.5" /> Agregar
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex max-h-[min(26rem,70vh)] w-80 flex-col p-2">
        <label className="relative mb-1.5 flex h-9 shrink-0 items-center">
          <Search className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              if (options.length === 1) pick(options[0][0]);
              else if (query.trim() && !exact) pick(query.trim());
            }}
            placeholder="Buscar o escribir una familia…"
            aria-label="Buscar tipografía"
            autoFocus
            className="h-9 w-full rounded-full bg-secondary/80 pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60 focus-visible:ring-offset-0"
          />
        </label>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {options.map(([name, faces]) => {
            const isLinked = linked.some((f) => same(f, name));
            const regular = regularOf(faces);
            return (
              <button
                key={name}
                type="button"
                disabled={isLinked}
                onClick={() => pick(name)}
                className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-secondary disabled:opacity-50"
              >
                <span
                  aria-hidden
                  className="w-9 shrink-0 text-center text-2xl leading-none"
                  style={{ fontFamily: `'${regular.full_name}'`, fontWeight: regular.weight }}
                >
                  Aa
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{name}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {faces.length} {faces.length === 1 ? "estilo" : "estilos"}
                  </span>
                </span>
                {isLinked && <Check className="h-4 w-4 shrink-0" />}
              </button>
            );
          })}
          {query.trim() && !exact && (
            <button
              type="button"
              onClick={() => pick(query.trim())}
              className={cn("flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm transition-colors hover:bg-secondary")}
            >
              <Plus className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">
                Anotar <strong className="font-semibold">“{query.trim()}”</strong>
                <span className="block text-[11px] text-muted-foreground">Todavía sin subir</span>
              </span>
            </button>
          )}
          {!uploaded.length && !query.trim() && (
            <p className="px-2.5 py-3 text-xs text-muted-foreground">
              Todavía no hay tipografías subidas. Escribí el nombre para anotarla, o subila con “Subir”.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
