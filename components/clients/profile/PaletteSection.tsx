"use client";

import { useEffect, useState } from "react";
import { Copy, Pipette, Plus, Star, Trash2, X } from "lucide-react";
import { Hint } from "@/components/ui/tooltip";
import { hexToRgb, inkOn, isVeryLight, normalizeHex, rgbText } from "@/lib/clients/color";
import { logoColors } from "@/lib/clients/logo";
import type { BrandPatch } from "@/lib/repos/brands";
import type { Brand, BrandColor } from "@/lib/types";
import { cn } from "@/lib/utils";
import { copyWithToast, Empty, Section, SmallAction } from "./Section";

/** Dos colores tan parecidos que, para sugerir, son el mismo. */
function near(a: string, b: string) {
  const [x, y] = [hexToRgb(a), hexToRgb(b)];
  return Math.abs(x[0] - y[0]) + Math.abs(x[1] - y[1]) + Math.abs(x[2] - y[2]) < 40;
}

/**
 * Los colores de la marca: un click copia el HEX. Cada uno puede tener
 * nombre ("Magenta", "Gris texto"); uno es el que lo identifica en las
 * listas (la estrella). Si hay logo, se sugieren sus colores.
 */
export function PaletteSection({ brand, saveSoon }: { brand: Brand; saveSoon: (patch: BrandPatch) => void }) {
  const palette = brand.palette ?? [];
  const [adding, setAdding] = useState(false);
  const [fromLogo, setFromLogo] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    if (!brand.logo_url) setFromLogo([]);
    else logoColors(brand.logo_url, 6).then((colors) => alive && setFromLogo(colors));
    return () => {
      alive = false;
    };
  }, [brand.logo_url]);

  const suggestions = fromLogo.filter((hex) => !palette.some((c) => near(c.hex, hex)));

  const setPalette = (next: BrandColor[]) => saveSoon({ palette: next });
  const add = (colors: BrandColor[]) => {
    const fresh = colors.filter((c) => !palette.some((p) => p.hex === c.hex));
    if (fresh.length) setPalette([...palette, ...fresh]);
  };

  const copyAll = () =>
    copyWithToast(
      palette.map((c) => (c.name ? `${c.name} ${c.hex}` : c.hex)).join("\n"),
      `${palette.length} ${palette.length === 1 ? "color copiado" : "colores copiados"}`
    );

  return (
    <Section
      id="colores"
      title="Colores"
      hint="Un click copia el HEX. La estrella marca el color del cliente en las listas."
      action={
        <>
          {palette.length > 1 && (
            <SmallAction onClick={copyAll}>
              <Copy /> Copiar todos
            </SmallAction>
          )}
          <SmallAction onClick={() => setAdding((v) => !v)}>
            {adding ? <X /> : <Plus />} {adding ? "Cerrar" : "Agregar color"}
          </SmallAction>
        </>
      }
    >
      {adding && <AddColor onAdd={(c) => add([c])} />}

      {suggestions.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl bg-secondary/60 px-3 py-2.5">
          <span className="eyebrow mr-1">Del logo</span>
          {suggestions.map((hex) => (
            <Hint key={hex} label={`Agregar ${hex}`}>
              <button
                type="button"
                onClick={() => add([{ hex, name: "" }])}
                aria-label={`Agregar ${hex}`}
                className={cn(
                  "group grid h-8 w-8 place-items-center rounded-full transition-transform hover:scale-110",
                  isVeryLight(hex) && "shadow-[inset_0_0_0_1px_rgba(0,0,0,0.15)]"
                )}
                style={{ background: hex, color: inkOn(hex) }}
              >
                <Plus className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            </Hint>
          ))}
          {suggestions.length > 1 && (
            <button
              type="button"
              onClick={() => add(suggestions.map((hex) => ({ hex, name: "" })))}
              className="ml-auto text-xs font-medium underline-offset-2 hover:underline"
            >
              Agregar todos
            </button>
          )}
        </div>
      )}

      {palette.length ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {palette.map((c, i) => {
            const main = c.hex === normalizeHex(brand.color);
            return (
              <Swatch
                // Por posición: al cambiarle el color no se vuelve a montar (y no se cierra el selector).
                key={i}
                color={c}
                main={main}
                onRename={(name) => setPalette(palette.map((p, j) => (j === i ? { ...p, name } : p)))}
                // Si era el color del cliente, el cliente cambia con él.
                onRecolor={(hex) =>
                  saveSoon({ palette: palette.map((p, j) => (j === i ? { ...p, hex } : p)), ...(main ? { color: hex } : {}) })
                }
                onRemove={() => setPalette(palette.filter((_, j) => j !== i))}
                onMain={() => saveSoon({ color: c.hex })}
              />
            );
          })}
        </ul>
      ) : (
        !adding && (
          <Empty>
            Todavía no hay colores.{" "}
            {fromLogo.length ? "Agregá los del logo con un click, o" : ""}{" "}
            <button type="button" onClick={() => setAdding(true)} className="font-medium text-foreground underline underline-offset-2">
              {fromLogo.length ? "cargalos a mano" : "Cargá los de la marca"}
            </button>
            .
          </Empty>
        )
      )}
    </Section>
  );
}

function Swatch({
  color,
  main,
  onRename,
  onRecolor,
  onRemove,
  onMain,
}: {
  color: BrandColor;
  main: boolean;
  onRename: (name: string) => void;
  onRecolor: (hex: string) => void;
  onRemove: () => void;
  onMain: () => void;
}) {
  const [name, setName] = useState(color.name);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setName(color.name);
  }, [color.name, editing]);

  const ink = inkOn(color.hex);
  const tool =
    "grid h-7 w-7 place-items-center rounded-full bg-black/10 opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/20 focus-visible:opacity-100 group-hover:opacity-100";

  return (
    <li className="flex flex-col gap-2">
      <div
        className={cn("group relative h-28 overflow-hidden rounded-2xl", isVeryLight(color.hex) && "ring-1 ring-inset ring-black/10")}
        style={{ background: color.hex, color: ink }}
      >
        <button
          type="button"
          onClick={() => copyWithToast(color.hex)}
          aria-label={`Copiar ${color.hex}`}
          className="absolute inset-0 rounded-2xl"
        />
        {main && (
          <Hint label="Color del cliente">
            <span className="absolute left-2.5 top-2.5 grid h-7 w-7 place-items-center rounded-full bg-black/10">
              <Star className="h-3.5 w-3.5 fill-current" />
            </span>
          </Hint>
        )}
        <div className="absolute right-2 top-2 flex gap-1">
          {!main && (
            <Hint label="Usar como color del cliente">
              <button type="button" onClick={onMain} aria-label="Usar como color del cliente" className={tool}>
                <Star className="h-3.5 w-3.5" />
              </button>
            </Hint>
          )}
          <Hint label="Cambiar el color">
            <label className={cn(tool, "relative cursor-pointer")}>
              <Pipette className="h-3.5 w-3.5" />
              <input
                type="color"
                value={color.hex.toLowerCase()}
                onChange={(e) => onRecolor(e.target.value.toUpperCase())}
                aria-label="Cambiar el color"
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </label>
          </Hint>
          <Hint label="Quitar">
            <button type="button" onClick={onRemove} aria-label={`Quitar ${color.hex}`} className={tool}>
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </Hint>
        </div>
        <span className="pointer-events-none absolute bottom-2.5 left-3 text-[11px] font-medium opacity-70">Copiar</span>
      </div>
      <input
        value={name}
        onFocus={() => setEditing(true)}
        onChange={(e) => {
          setName(e.target.value);
          onRename(e.target.value);
        }}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        placeholder="Sin nombre"
        maxLength={40}
        aria-label={`Nombre de ${color.hex}`}
        className="-mx-1 h-7 rounded-lg bg-transparent px-1 text-sm font-semibold outline-none transition-colors placeholder:font-normal placeholder:text-muted-foreground hover:bg-secondary/60 focus:bg-secondary/70"
      />
      <div className="-mt-1.5 flex flex-wrap gap-x-2 text-xs tabular-nums text-muted-foreground">
        <button type="button" onClick={() => copyWithToast(color.hex)} className="font-mono hover:text-foreground">
          {color.hex}
        </button>
        <button type="button" onClick={() => copyWithToast(rgbText(color.hex))} className="hover:text-foreground">
          {hexToRgb(color.hex).join(" ")}
        </button>
      </div>
    </li>
  );
}

function AddColor({ onAdd }: { onAdd: (color: BrandColor) => void }) {
  const [hex, setHex] = useState("#");
  const [name, setName] = useState("");
  const valid = normalizeHex(hex);

  const submit = () => {
    if (!valid) return;
    onAdd({ hex: valid, name: name.trim() });
    setHex("#");
    setName("");
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-2.5"
    >
      <label
        className="relative grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-xl ring-1 ring-inset ring-black/10"
        style={{ background: valid ?? "conic-gradient(from 90deg, #f43f5e, #f59e0b, #84cc16, #06b6d4, #6366f1, #d946ef, #f43f5e)" }}
      >
        {!valid && <Pipette className="h-4 w-4 text-white drop-shadow" />}
        <input
          type="color"
          value={(valid ?? "#000000").toLowerCase()}
          onChange={(e) => setHex(e.target.value.toUpperCase())}
          aria-label="Elegir el color"
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
      <input
        value={hex}
        onChange={(e) => setHex(e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`)}
        placeholder="#B61760"
        aria-label="HEX"
        maxLength={7}
        className="h-10 w-28 rounded-xl border bg-card px-3 font-mono text-sm uppercase outline-none focus-visible:ring-2 focus-visible:ring-ring"
        autoFocus
      />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nombre (opcional)"
        aria-label="Nombre del color"
        maxLength={40}
        className="h-10 min-w-[10rem] flex-1 rounded-xl border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <button
        type="submit"
        disabled={!valid}
        className="flex h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-95 disabled:opacity-40"
      >
        <Plus className="h-4 w-4" /> Agregar
      </button>
    </form>
  );
}
