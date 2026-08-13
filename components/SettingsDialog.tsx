"use client";

/**
 * ARCHIVO ÚNICO. Reemplaza components/SettingsDialog.tsx y no necesita
 * ningún archivo nuevo: trae adentro el lector de archivos de fuente y el
 * panel de tipografías.
 *
 * Qué hace distinto al anterior:
 *  - El peso y el estilo NO se eligen: se leen del archivo (tablas `name`,
 *    `fvar` y `OS/2` del formato OpenType).
 *  - Cada peso se previsualiza con su archivo real antes de guardar.
 *  - Una fuente variable se descompone sola en sus pesos.
 *  - La cola se agrupa por familia, así 20 archivos son una tarjeta y no
 *    veinte filas.
 */

import * as React from "react";
import { supabase } from "@/lib/supabase";
import type { Brand, Category, FontFace, Product } from "@/lib/types";
import { groupByFamily } from "@/lib/fonts";
import { toast } from "@/components/ui/toaster";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, UploadCloud, X, AlertTriangle, Loader2, Check, Pencil } from "lucide-react";

/* ══════════════════════════════════════════════════════════════════════
   1. LECTOR DE ARCHIVOS DE FUENTE
   Abre el binario y lee sus tablas. Nada se adivina si el archivo se
   puede leer: .ttf, .otf, .ttc y .woff van directo. .woff2 usa Brotli
   con transformaciones, así que ahí se deduce del nombre.
   ══════════════════════════════════════════════════════════════════════ */

type FontInstance = { styleName: string; weight: number; italic: boolean };
type FontMeta = { family: string; instances: FontInstance[]; isVariable: boolean; fromFile: boolean };

const MAX_INSTANCES = 100;

const WEIGHT_TOKENS: [RegExp, number, string][] = [
  [/extra\s*-?\s*light|ultra\s*-?\s*light/i, 200, "ExtraLight"],
  [/semi\s*-?\s*bold|demi\s*-?\s*bold/i, 600, "SemiBold"],
  [/extra\s*-?\s*bold|ultra\s*-?\s*bold/i, 800, "ExtraBold"],
  [/thin|hairline/i, 100, "Thin"],
  [/black|heavy|fat/i, 900, "Black"],
  [/light/i, 300, "Light"],
  [/medium/i, 500, "Medium"],
  [/bold/i, 700, "Bold"],
  [/regular|normal|book|roman/i, 400, "Regular"],
];

const WEIGHT_LABEL: Record<number, string> = {
  100: "Thin", 200: "ExtraLight", 300: "Light", 400: "Regular", 500: "Medium",
  600: "SemiBold", 700: "Bold", 800: "ExtraBold", 900: "Black",
};

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const copy = new Uint8Array(data.length);
  copy.set(data);
  const stream = new Blob([copy.buffer as ArrayBuffer]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readTables(buffer: ArrayBuffer): Promise<Map<string, DataView> | null> {
  const view = new DataView(buffer);
  if (buffer.byteLength < 12) return null;

  const tag = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  const wanted = new Set(["name", "fvar", "OS/2", "head"]);
  const tables = new Map<string, DataView>();

  if (tag === "wOF2") return null;

  if (tag === "wOFF") {
    const numTables = view.getUint16(12);
    for (let i = 0; i < numTables; i++) {
      const o = 44 + i * 20;
      if (o + 20 > buffer.byteLength) break;
      const t = String.fromCharCode(view.getUint8(o), view.getUint8(o + 1), view.getUint8(o + 2), view.getUint8(o + 3));
      if (!wanted.has(t)) continue;
      const offset = view.getUint32(o + 4);
      const compLength = view.getUint32(o + 8);
      const origLength = view.getUint32(o + 12);
      const slice = new Uint8Array(buffer, offset, compLength);
      const bytes = compLength < origLength ? await inflate(slice) : slice;
      tables.set(t, new DataView(bytes.buffer as ArrayBuffer, bytes.byteOffset, bytes.byteLength));
    }
    return tables;
  }

  const base = tag === "ttcf" ? view.getUint32(12) : 0;
  const version = view.getUint32(base);
  if (version !== 0x00010000 && version !== 0x4f54544f && version !== 0x74727565) return null;

  const numTables = view.getUint16(base + 4);
  for (let i = 0; i < numTables; i++) {
    const o = base + 12 + i * 16;
    if (o + 16 > buffer.byteLength) break;
    const t = String.fromCharCode(view.getUint8(o), view.getUint8(o + 1), view.getUint8(o + 2), view.getUint8(o + 3));
    if (!wanted.has(t)) continue;
    const offset = view.getUint32(o + 8);
    const length = view.getUint32(o + 12);
    if (offset + length > buffer.byteLength) continue;
    tables.set(t, new DataView(buffer, offset, length));
  }
  return tables;
}

function readNames(name: DataView): Map<number, string> {
  const out = new Map<number, string>();
  if (name.byteLength < 6) return out;
  const count = name.getUint16(2);
  const storage = name.getUint16(4);

  for (let i = 0; i < count; i++) {
    const r = 6 + i * 12;
    if (r + 12 > name.byteLength) break;
    const platformId = name.getUint16(r);
    const nameId = name.getUint16(r + 6);
    const length = name.getUint16(r + 8);
    const start = storage + name.getUint16(r + 10);
    if (start + length > name.byteLength) continue;

    let text = "";
    if (platformId === 3 || platformId === 0) {
      for (let j = 0; j + 1 < length; j += 2) text += String.fromCharCode(name.getUint16(start + j));
    } else {
      for (let j = 0; j < length; j++) text += String.fromCharCode(name.getUint8(start + j));
    }
    text = text.replace(/\u0000/g, "").trim();
    if (text && !out.has(nameId)) out.set(nameId, text);
  }
  return out;
}

function readVariableInstances(fvar: DataView, names: Map<number, string>): FontInstance[] {
  if (fvar.byteLength < 16) return [];
  const axesOffset = fvar.getUint16(4);
  const axisCount = fvar.getUint16(8);
  const axisSize = fvar.getUint16(10);
  const instanceCount = Math.min(fvar.getUint16(12), MAX_INSTANCES);
  const instanceSize = fvar.getUint16(14);

  const axes: string[] = [];
  let wghtMin = 400;
  let wghtMax = 400;
  for (let a = 0; a < axisCount; a++) {
    const o = axesOffset + a * axisSize;
    if (o + 20 > fvar.byteLength) break;
    const tag = String.fromCharCode(fvar.getUint8(o), fvar.getUint8(o + 1), fvar.getUint8(o + 2), fvar.getUint8(o + 3));
    axes.push(tag);
    if (tag === "wght") {
      wghtMin = fvar.getInt32(o + 4) / 65536;
      wghtMax = fvar.getInt32(o + 12) / 65536;
    }
  }

  const instances: FontInstance[] = [];
  const base = axesOffset + axisCount * axisSize;
  for (let i = 0; i < instanceCount; i++) {
    const o = base + i * instanceSize;
    if (o + 4 + axisCount * 4 > fvar.byteLength) break;
    const styleName = names.get(fvar.getUint16(o)) || "";
    let weight = 400;
    let italic = /italic|oblique/i.test(styleName);
    for (let a = 0; a < axisCount; a++) {
      const value = fvar.getInt32(o + 4 + a * 4) / 65536;
      if (axes[a] === "wght") weight = Math.round(value);
      if (axes[a] === "ital" && value >= 0.5) italic = true;
      if (axes[a] === "slnt" && value !== 0) italic = true;
    }
    if (styleName) instances.push({ styleName, weight, italic });
  }

  if (!instances.length && axes.includes("wght")) {
    for (const w of [100, 200, 300, 400, 500, 600, 700, 800, 900]) {
      if (w < wghtMin - 1 || w > wghtMax + 1) continue;
      instances.push({ styleName: WEIGHT_LABEL[w], weight: w, italic: false });
    }
  }

  const seen = new Set<string>();
  return instances.filter((i) => {
    const key = `${i.weight}-${i.italic}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function titleCase(s: string) {
  return s !== s.toUpperCase() ? s : s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function guessFromFilename(filename: string): FontMeta {
  const noExt = filename.replace(/\.(woff2|woff|ttf|otf|ttc)$/i, "");
  const noCopy = noExt.replace(/\s*\(\d+\)\s*$/, "").replace(/_+\d+_*$/, "").replace(/-copy\d*$/i, "");
  const isVariable = /variable|\bvf\b|wght|\[.*\]/i.test(noCopy);

  const spaced = noCopy.replace(/[-_]+/g, " ").replace(/([a-z\d])([A-Z])/g, "$1 $2").replace(/\s+/g, " ").trim();
  const italic = /italic|oblique/i.test(spaced);
  const cleaned = spaced
    .replace(/variable\s*font|variablefont|\bwght\b|\bital\b|\bslnt\b|\bopsz\b|\[.*?\]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  let weight = 400;
  let styleName = "Regular";
  let matched = "";
  for (const [re, w, label] of WEIGHT_TOKENS) {
    const m = cleaned.match(re);
    if (m) { weight = w; styleName = label; matched = m[0]; break; }
  }

  let family = matched ? cleaned.replace(matched, " ") : cleaned;
  family = family.replace(/italic|oblique/gi, " ").replace(/\s+/g, " ").trim();
  family = titleCase(family) || titleCase(spaced) || noCopy;

  if (italic) styleName = styleName === "Regular" ? "Italic" : `${styleName} Italic`;

  if (isVariable) {
    return {
      family,
      isVariable: true,
      fromFile: false,
      instances: [100, 200, 300, 400, 500, 600, 700, 800, 900].map((w) => ({
        styleName: italic ? `${WEIGHT_LABEL[w]} Italic` : WEIGHT_LABEL[w],
        weight: w,
        italic,
      })),
    };
  }
  return { family, isVariable: false, fromFile: false, instances: [{ styleName, weight, italic }] };
}

async function readFontFile(file: File): Promise<FontMeta> {
  try {
    const tables = await readTables(await file.arrayBuffer());
    const nameTable = tables?.get("name");
    if (!tables || !nameTable) return guessFromFilename(file.name);

    const names = readNames(nameTable);
    let family = (names.get(16) || names.get(1) || "").trim();
    let subfamily = (names.get(17) || names.get(2) || "Regular").trim();
    if (!family) return guessFromFilename(file.name);

    const fvar = tables.get("fvar");
    if (fvar) {
      const instances = readVariableInstances(fvar, names);
      if (instances.length) {
        return { family: names.get(16)?.trim() || family, instances, isVariable: true, fromFile: true };
      }
    }

    const os2 = tables.get("OS/2");
    const head = tables.get("head");
    let weight = os2 && os2.byteLength >= 6 ? os2.getUint16(4) : 400;
    if (weight < 1 || weight > 1000) weight = 400;
    const macStyle = head && head.byteLength >= 46 ? head.getUint16(44) : 0;
    const italic = Boolean(macStyle & 0b10) || /italic|oblique/i.test(subfamily);

    // Nombres viejos: familia "Montserrat Light" + subfamilia "Regular"
    if (!names.get(16) && /^(regular|bold|italic|bold italic)$/i.test(subfamily)) {
      for (const [re, , label] of WEIGHT_TOKENS) {
        const m = family.match(new RegExp(`\\s+${re.source}$`, "i"));
        if (m) {
          family = family.slice(0, m.index).trim();
          subfamily = italic ? `${label} Italic` : label;
          break;
        }
      }
    }

    return { family, instances: [{ styleName: subfamily, weight, italic }], isVariable: false, fromFile: true };
  } catch {
    return guessFromFilename(file.name);
  }
}

function formatFromFilename(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "woff2") return "woff2";
  if (ext === "woff") return "woff";
  if (ext === "otf") return "opentype";
  return "truetype";
}

/* ══════════════════════════════════════════════════════════════════════
   2. DIÁLOGO DE AJUSTES
   ══════════════════════════════════════════════════════════════════════ */

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  brands: Brand[];
  products: Product[];
  categories: Category[];
  fonts: FontFace[];
  reload: () => Promise<void>;
};

const COLORS = ["#B61760", "#1D4ED8", "#047857", "#B45309", "#6D28D9", "#52525B"];

export function SettingsDialog({ open, onOpenChange, brands, products, categories, fonts, reload }: Props) {
  const [tab, setTab] = React.useState("marcas");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Ajustes</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="marcas">Marcas</TabsTrigger>
            <TabsTrigger value="productos">Productos</TabsTrigger>
            <TabsTrigger value="categorias">Categorías</TabsTrigger>
            <TabsTrigger value="tipografias">Tipografías</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="max-h-[58vh] overflow-y-auto pr-1">
          {tab === "marcas" && <BrandsPanel brands={brands} reload={reload} />}
          {tab === "productos" && <ProductsPanel brands={brands} products={products} reload={reload} />}
          {tab === "categorias" && <CategoriesPanel categories={categories} reload={reload} />}
          {tab === "tipografias" && <FontsPanel fonts={fonts} reload={reload} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------------------------------------------- Marcas */

function BrandsPanel({ brands, reload }: { brands: Brand[]; reload: () => Promise<void> }) {
  const [name, setName] = React.useState("");
  const [color, setColor] = React.useState(COLORS[0]);

  const add = async () => {
    if (!name.trim()) return;
    const { error } = await supabase.from("brands").insert({ name: name.trim(), color });
    if (error) return toast(error.message, "error");
    setName("");
    await reload();
    toast("Marca creada");
  };

  const remove = async (id: string) => {
    if (!confirm("¿Eliminar la marca? Sus productos también se eliminan; las tarjetas quedan sin marca.")) return;
    const { error } = await supabase.from("brands").delete().eq("id", id);
    if (error) return toast(error.message, "error");
    await reload();
    toast("Marca eliminada");
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[180px] flex-1">
          <Label htmlFor="marca">Nombre de la marca</Label>
          <Input
            id="marca"
            className="mt-1.5"
            value={name}
            placeholder="Ej: Acme"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
        </div>
        <div className="flex gap-1.5 pb-2.5">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              aria-label={`Color ${c}`}
              className="h-6 w-6 rounded-full border-2 transition"
              style={{ background: c, borderColor: color === c ? "#000" : "transparent" }}
            />
          ))}
        </div>
        <Button onClick={add}>
          <Plus /> Agregar
        </Button>
      </div>

      <ul className="divide-y rounded-lg border">
        {brands.map((b) => (
          <li key={b.id} className="flex items-center gap-3 px-3 py-2.5">
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: b.color }} />
            <span className="flex-1 text-sm">{b.name}</span>
            <Button variant="ghost" size="iconSm" onClick={() => remove(b.id)} aria-label={`Eliminar ${b.name}`}>
              <Trash2 className="text-destructive" />
            </Button>
          </li>
        ))}
        {!brands.length && <li className="px-3 py-6 text-center text-sm text-muted-foreground">Todavía no hay marcas.</li>}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------ Productos */

function ProductsPanel({
  brands,
  products,
  reload,
}: {
  brands: Brand[];
  products: Product[];
  reload: () => Promise<void>;
}) {
  const [name, setName] = React.useState("");
  const [brandId, setBrandId] = React.useState<string>(brands[0]?.id || "");

  React.useEffect(() => {
    if (!brandId && brands.length) setBrandId(brands[0].id);
  }, [brands, brandId]);

  const add = async () => {
    if (!name.trim() || !brandId) return;
    const { error } = await supabase.from("products").insert({ name: name.trim(), brand_id: brandId });
    if (error) {
      // El índice único es (marca, nombre): el mismo modelo en dos marcas sí se puede
      return toast(
        /duplicate|unique/i.test(error.message) ? "Esa marca ya tiene un modelo con ese nombre" : error.message,
        "error"
      );
    }
    setName("");
    await reload();
    toast("Producto creado");
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) return toast(error.message, "error");
    await reload();
    toast("Producto eliminado");
  };

  if (!brands.length) {
    return (
      <p className="rounded-lg border px-3 py-6 text-center text-sm text-muted-foreground">
        Primero creá una marca. Cada producto pertenece a una.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-[150px]">
          <Label>Marca</Label>
          <Select value={brandId} onValueChange={setBrandId}>
            <SelectTrigger className="mt-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {brands.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[160px] flex-1">
          <Label htmlFor="producto">Nombre del producto</Label>
          <Input
            id="producto"
            className="mt-1.5"
            value={name}
            placeholder="Ej: Lumin"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
        </div>
        <Button onClick={add}>
          <Plus /> Agregar
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        {brands.map((b) => {
          const list = products.filter((p) => p.brand_id === b.id);
          return (
            <div key={b.id} className="rounded-lg border">
              <div className="flex items-center gap-2 border-b bg-secondary/40 px-3 py-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: b.color }} />
                <p className="flex-1 text-sm font-semibold">{b.name}</p>
                <span className="text-xs text-muted-foreground">{list.length}</span>
              </div>
              {list.length ? (
                <ul className="divide-y">
                  {list.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 px-3 py-2">
                      <span className="flex-1 text-sm">{p.name}</span>
                      <Button variant="ghost" size="iconSm" onClick={() => remove(p.id)} aria-label={`Eliminar ${p.name}`}>
                        <Trash2 className="text-destructive" />
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-3 py-4 text-center text-xs text-muted-foreground">Sin modelos todavía.</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- Categorías */

function CategoriesPanel({ categories, reload }: { categories: Category[]; reload: () => Promise<void> }) {
  const [name, setName] = React.useState("");

  const add = async () => {
    if (!name.trim()) return;
    const { error } = await supabase.from("categories").insert({ name: name.trim() });
    if (error) return toast(error.message, "error");
    setName("");
    await reload();
    toast("Categoría creada");
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) return toast(error.message, "error");
    await reload();
    toast("Categoría eliminada");
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Label htmlFor="categoria">Nombre de la categoría</Label>
          <Input
            id="categoria"
            className="mt-1.5"
            value={name}
            placeholder="Ej: Autonomía"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
        </div>
        <Button onClick={add}>
          <Plus /> Agregar
        </Button>
      </div>

      <ul className="divide-y rounded-lg border">
        {categories.map((c) => (
          <li key={c.id} className="flex items-center gap-3 px-3 py-2.5">
            <span className="flex-1 text-sm">{c.name}</span>
            <Button variant="ghost" size="iconSm" onClick={() => remove(c.id)} aria-label={`Eliminar ${c.name}`}>
              <Trash2 className="text-destructive" />
            </Button>
          </li>
        ))}
        {!categories.length && (
          <li className="px-3 py-6 text-center text-sm text-muted-foreground">Todavía no hay categorías.</li>
        )}
      </ul>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   3. PANEL DE TIPOGRAFÍAS
   ══════════════════════════════════════════════════════════════════════ */

type PendingFace = { styleName: string; weight: number; italic: boolean; include: boolean };

type PendingFile = {
  key: string;
  file: File;
  blobUrl: string;
  family: string;
  isVariable: boolean;
  fromFile: boolean;
  faces: PendingFace[];
};

const PREVIEW_STYLE_ID = "tarjetas-preview-fonts";

/** Nombre de familia temporal para previsualizar sin pisar las guardadas. */
const previewFamily = (fileKey: string, i: number) => `pv-${fileKey}-${i}`;

function fullName(family: string, styleName: string) {
  return `${family.trim()} ${styleName.trim()}`.replace(/\s+/g, " ").trim();
}

function FontsPanel({ fonts, reload }: { fonts: FontFace[]; reload: () => Promise<void> }) {
  const [pending, setPending] = React.useState<PendingFile[]>([]);
  const [reading, setReading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [editingFamily, setEditingFamily] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  /* Previsualización: registramos cada peso pendiente con su archivo real,
     fijando el eje wght cuando es variable. Así ves la letra antes de guardar. */
  React.useEffect(() => {
    let el = document.getElementById(PREVIEW_STYLE_ID) as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement("style");
      el.id = PREVIEW_STYLE_ID;
      document.head.appendChild(el);
    }
    el.textContent = pending
      .flatMap((p) =>
        p.faces.map((f, i) => {
          const pin = p.isVariable ? `font-variation-settings:"wght" ${f.weight};` : "";
          const weight = p.isVariable ? `${f.weight}` : "1 1000";
          return `@font-face{font-family:"${previewFamily(p.key, i)}";src:url("${p.blobUrl}");font-weight:${weight};font-style:${f.italic ? "italic" : "normal"};${pin}}`;
        })
      )
      .join("\n");
  }, [pending]);

  React.useEffect(() => {
    return () => {
      document.getElementById(PREVIEW_STYLE_ID)?.remove();
    };
  }, []);

  const existingFamilies = React.useMemo(() => {
    const map = new Map<string, string>();
    fonts.forEach((f) => map.set(f.family.toLowerCase(), f.family));
    return map;
  }, [fonts]);

  const existingNames = React.useMemo(() => new Set(fonts.map((f) => f.full_name)), [fonts]);

  /* Los archivos nuevos se SUMAN a la cola, no la reemplazan. */
  const pick = async (files: FileList | null) => {
    if (!files?.length) return;
    setReading(true);

    const known = new Map(existingFamilies);
    pending.forEach((p) => known.set(p.family.toLowerCase(), p.family));
    const added: PendingFile[] = [];

    for (const file of Array.from(files)) {
      const meta = await readFontFile(file);
      const family = known.get(meta.family.toLowerCase()) || meta.family;
      known.set(family.toLowerCase(), family);
      added.push({
        key: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        blobUrl: URL.createObjectURL(file),
        family,
        isVariable: meta.isVariable,
        fromFile: meta.fromFile,
        faces: meta.instances.slice(0, MAX_INSTANCES).map((i) => ({ ...i, include: true })),
      });
    }

    setPending((prev) => [...prev, ...added]);
    setReading(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const dropFile = (key: string) =>
    setPending((prev) => {
      prev.filter((p) => p.key === key).forEach((p) => URL.revokeObjectURL(p.blobUrl));
      return prev.filter((p) => p.key !== key);
    });

  const clearQueue = () =>
    setPending((prev) => {
      prev.forEach((p) => URL.revokeObjectURL(p.blobUrl));
      return [];
    });

  const toggleFace = (key: string, index: number) =>
    setPending((prev) =>
      prev.map((p) =>
        p.key === key
          ? { ...p, faces: p.faces.map((f, i) => (i === index ? { ...f, include: !f.include } : f)) }
          : p
      )
    );

  const renameFamily = (oldFamily: string, next: string) =>
    setPending((prev) => prev.map((p) => (p.family === oldFamily ? { ...p, family: next } : p)));

  const setGroupInclude = (family: string, on: boolean) =>
    setPending((prev) =>
      prev.map((p) => (p.family === family ? { ...p, faces: p.faces.map((f) => ({ ...f, include: on })) } : p))
    );

  /* La cola se muestra agrupada por familia: 20 archivos = una tarjeta. */
  const queueGroups = React.useMemo(() => {
    const map = new Map<string, { family: string; rows: { p: PendingFile; index: number; face: PendingFace }[] }>();
    pending.forEach((p) =>
      p.faces.forEach((face, index) => {
        const entry = map.get(p.family) || { family: p.family, rows: [] };
        entry.rows.push({ p, index, face });
        map.set(p.family, entry);
      })
    );
    for (const g of map.values()) {
      g.rows.sort((a, b) => a.face.weight - b.face.weight || Number(a.face.italic) - Number(b.face.italic));
    }
    return Array.from(map.values()).sort((a, b) => a.family.localeCompare(b.family));
  }, [pending]);

  const plannedCounts = React.useMemo(() => {
    const counts = new Map<string, number>();
    pending.forEach((p) =>
      p.faces.forEach((f) => {
        if (!f.include) return;
        const n = fullName(p.family, f.styleName);
        counts.set(n, (counts.get(n) || 0) + 1);
      })
    );
    return counts;
  }, [pending]);

  const totalSelected = pending.reduce((n, p) => n + p.faces.filter((f) => f.include).length, 0);

  const upload = async () => {
    setBusy(true);
    let saved = 0;
    let replaced = 0;

    for (const p of pending) {
      const chosen = p.faces.filter((f) => f.include);
      if (!chosen.length) continue;

      // Una variable es UN archivo con varios pesos: se sube una sola vez.
      const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${p.file.name.replace(/[^\w.\-]/g, "_")}`;
      const { error: upErr } = await supabase.storage.from("fonts").upload(path, p.file, { upsert: true });
      if (upErr) {
        toast(`${p.file.name}: ${upErr.message}`, "error");
        continue;
      }
      const { data } = supabase.storage.from("fonts").getPublicUrl(path);

      const rows = chosen.map((f) => ({
        family: p.family.trim(),
        style_name: f.styleName.trim(),
        full_name: fullName(p.family, f.styleName),
        weight: f.weight,
        italic: f.italic,
        file_path: path,
        file_url: data.publicUrl,
        format: formatFromFilename(p.file.name),
        is_variable: p.isVariable,
      }));

      let { error } = await supabase.from("fonts").upsert(rows, { onConflict: "full_name" });

      // Si todavía no corriste la migración, guardamos sin esa columna.
      if (error && /is_variable/i.test(error.message)) {
        const stripped = rows.map(({ is_variable, ...rest }) => rest);
        ({ error } = await supabase.from("fonts").upsert(stripped, { onConflict: "full_name" }));
      }

      if (error) toast(`${p.file.name}: ${error.message}`, "error");
      else rows.forEach((r) => (existingNames.has(r.full_name) ? replaced++ : saved++));
    }

    clearQueue();
    await reload();
    setBusy(false);
    if (saved || replaced) {
      const partes = [
        saved && `${saved} nueva${saved > 1 ? "s" : ""}`,
        replaced && `${replaced} reemplazada${replaced > 1 ? "s" : ""}`,
      ].filter(Boolean);
      toast(`Tipografías guardadas: ${partes.join(", ")}`);
    }
  };

  const remove = async (f: FontFace) => {
    const others = fonts.filter((x) => x.file_path === f.file_path && x.id !== f.id);
    const { error } = await supabase.from("fonts").delete().eq("id", f.id);
    if (error) return toast(error.message, "error");
    if (!others.length) await supabase.storage.from("fonts").remove([f.file_path]);
    await reload();
    toast(`${f.full_name} eliminada`);
  };

  const removeFamily = async (family: string, faces: FontFace[]) => {
    if (!confirm(`¿Eliminar las ${faces.length} tipografías de ${family}?`)) return;
    const ids = faces.map((f) => f.id);
    const { error } = await supabase.from("fonts").delete().in("id", ids);
    if (error) return toast(error.message, "error");
    const stillUsed = new Set(fonts.filter((f) => !ids.includes(f.id)).map((f) => f.file_path));
    const toDelete = Array.from(new Set(faces.map((f) => f.file_path))).filter((p) => !stillUsed.has(p));
    if (toDelete.length) await supabase.storage.from("fonts").remove(toDelete);
    await reload();
    toast(`${family} eliminada`);
  };

  const grouped = groupByFamily(fonts);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-dashed bg-secondary/30 p-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <UploadCloud className="h-4 w-4" /> Subir archivos de tipografía
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Soltá los archivos y listo: el peso y el estilo se leen de adentro de cada uno. Si es una fuente variable, se
          descompone sola en sus pesos. Aceptamos .ttf, .otf, .woff y .woff2.
        </p>
        <Input
          ref={inputRef}
          type="file"
          multiple
          accept=".woff2,.woff,.ttf,.otf,.ttc"
          className="mt-3 h-auto py-2"
          onChange={(e) => pick(e.target.files)}
        />
      </div>

      {reading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Leyendo archivos…
        </p>
      )}

      {queueGroups.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="eyebrow">En cola · así se van a guardar</p>

          {queueGroups.map((group) => {
            const on = group.rows.filter((r) => r.face.include).length;
            const isVariable = group.rows.some((r) => r.p.isVariable);
            const guessed = group.rows.some((r) => !r.p.fromFile);
            const editing = editingFamily === group.family;

            return (
              <div key={group.family} className="rounded-lg border bg-card">
                <div className="flex flex-wrap items-center gap-2 border-b bg-secondary/40 px-3 py-2">
                  {editing ? (
                    <Input
                      autoFocus
                      className="h-8 flex-1"
                      value={group.family}
                      onChange={(e) => renameFamily(group.family, e.target.value)}
                      onBlur={() => setEditingFamily(null)}
                      onKeyDown={(e) => e.key === "Enter" && setEditingFamily(null)}
                    />
                  ) : (
                    <>
                      <p className="text-sm font-semibold">{group.family}</p>
                      <Button
                        variant="ghost"
                        size="iconSm"
                        onClick={() => setEditingFamily(group.family)}
                        aria-label={`Corregir el nombre de ${group.family}`}
                      >
                        <Pencil />
                      </Button>
                    </>
                  )}

                  <div className="ml-auto flex items-center gap-1.5">
                    {isVariable && <Badge className="border-transparent bg-primary/10 text-primary">Variable</Badge>}
                    {guessed && (
                      <Badge className="border-transparent bg-card text-muted-foreground">Deducido del nombre</Badge>
                    )}
                    {existingFamilies.has(group.family.toLowerCase()) && (
                      <Badge className="border-transparent bg-card text-muted-foreground">Ya existe</Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {on}/{group.rows.length}
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => setGroupInclude(group.family, on < group.rows.length)}>
                      {on < group.rows.length ? "Todos" : "Ninguno"}
                    </Button>
                  </div>
                </div>

                <ul className="divide-y">
                  {group.rows.map(({ p, index, face }) => {
                    const name = fullName(group.family, face.styleName);
                    const conflict = (plannedCounts.get(name) || 0) > 1 || existingNames.has(name);
                    return (
                      <li key={`${p.key}-${index}`} className="flex items-center gap-3 px-3 py-2">
                        <button
                          onClick={() => toggleFace(p.key, index)}
                          aria-pressed={face.include}
                          aria-label={`${face.include ? "Quitar" : "Incluir"} ${name}`}
                          className={
                            "flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors " +
                            (face.include ? "border-foreground bg-foreground text-background" : "bg-card")
                          }
                        >
                          {face.include && <Check className="h-3 w-3" />}
                        </button>

                        <span className="w-24 shrink-0 text-xs tabular-nums text-muted-foreground">
                          {face.weight} · {face.styleName}
                        </span>

                        {/* La muestra usa el archivo real, no una aproximación */}
                        <span
                          className={"flex-1 truncate text-lg " + (face.include ? "" : "opacity-35")}
                          style={{
                            fontFamily: `'${previewFamily(p.key, index)}'`,
                            fontWeight: face.weight,
                            fontStyle: face.italic ? "italic" : "normal",
                          }}
                        >
                          Aa Bb Cc 123
                        </span>

                        {conflict && face.include && (
                          <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" aria-label={`${name} ya existe`} />
                        )}
                      </li>
                    );
                  })}
                </ul>

                <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
                  <p className="truncate font-mono text-[11px] text-muted-foreground">
                    {Array.from(new Set(group.rows.map((r) => r.p.file.name))).join(", ")}
                  </p>
                  <div className="flex gap-1">
                    {Array.from(new Set(group.rows.map((r) => r.p.key))).map((key) => (
                      <Button
                        key={key}
                        variant="ghost"
                        size="iconSm"
                        onClick={() => dropFile(key)}
                        aria-label="Quitar este archivo de la cola"
                      >
                        <X />
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}

          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={clearQueue} disabled={busy}>
              Vaciar la cola
            </Button>
            <Button onClick={upload} disabled={busy || !totalSelected}>
              {busy ? "Subiendo…" : `Guardar ${totalSelected} tipografía${totalSelected === 1 ? "" : "s"}`}
            </Button>
          </div>

          {Array.from(plannedCounts.values()).some((n) => n > 1) && (
            <p className="flex items-start gap-1.5 text-xs text-destructive">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
              <span>
                Hay pesos repetidos en la cola (pasa si subiste la fuente variable y la carpeta <code>static</code>{" "}
                juntas). Sacá uno de los dos archivos con la ×, o se van a pisar entre sí.
              </span>
            </p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3">
        {grouped.map(([family, faces]) => (
          <div key={family} className="rounded-lg border">
            <div className="flex items-center gap-2 border-b bg-secondary/40 px-3 py-2">
              <p className="flex-1 text-sm font-semibold">{family}</p>
              <span className="text-xs text-muted-foreground">{faces.length}</span>
              <Button variant="ghost" size="iconSm" onClick={() => removeFamily(family, faces)} aria-label={`Eliminar ${family}`}>
                <Trash2 className="text-destructive" />
              </Button>
            </div>
            <ul className="divide-y">
              {faces.map((f) => (
                <li key={f.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="w-24 shrink-0 text-xs tabular-nums text-muted-foreground">
                    {f.weight} · {f.style_name}
                  </span>
                  <span
                    className="flex-1 truncate text-lg"
                    style={{ fontFamily: `'${f.full_name}'`, fontWeight: f.weight, fontStyle: f.italic ? "italic" : "normal" }}
                  >
                    Aa Bb Cc 123
                  </span>
                  <Button variant="ghost" size="iconSm" onClick={() => remove(f)} aria-label={`Eliminar ${f.full_name}`}>
                    <Trash2 className="text-destructive" />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {!fonts.length && (
          <p className="rounded-lg border px-3 py-6 text-center text-sm text-muted-foreground">
            Todavía no subiste ninguna tipografía.
          </p>
        )}
      </div>
    </div>
  );
}
