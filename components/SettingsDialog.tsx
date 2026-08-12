"use client";

import * as React from "react";
import { supabase } from "@/lib/supabase";
import { WEIGHTS, WEIGHT_NAMES, type Brand, type Category, type FontFace } from "@/lib/types";
import { guessFromFilename, formatFromFilename, groupByFamily } from "@/lib/fonts";
import { toast } from "@/components/ui/toaster";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, UploadCloud } from "lucide-react";

type Pending = {
  file: File;
  family: string;
  styleName: string;
  weight: number;
  italic: boolean;
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  brands: Brand[];
  categories: Category[];
  fonts: FontFace[];
  reload: () => Promise<void>;
};

const COLORS = ["#B61760", "#1D4ED8", "#047857", "#B45309", "#6D28D9", "#52525B"];

export function SettingsDialog({ open, onOpenChange, brands, categories, fonts, reload }: Props) {
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
            <TabsTrigger value="categorias">Categorías</TabsTrigger>
            <TabsTrigger value="tipografias">Tipografías</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="max-h-[58vh] overflow-y-auto pr-1">
          {tab === "marcas" && <BrandsPanel brands={brands} reload={reload} />}
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

/* ---------------------------------------------------------- Tipografías */

function FontsPanel({ fonts, reload }: { fonts: FontFace[]; reload: () => Promise<void> }) {
  const [pending, setPending] = React.useState<Pending[]>([]);
  const [busy, setBusy] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const pick = (files: FileList | null) => {
    if (!files) return;
    const next: Pending[] = Array.from(files).map((file) => {
      const g = guessFromFilename(file.name);
      return { file, family: g.family, styleName: g.styleName, weight: g.weight, italic: g.italic };
    });
    setPending(next);
  };

  const upload = async () => {
    setBusy(true);
    let ok = 0;
    for (const p of pending) {
      const path = `${Date.now()}-${p.file.name.replace(/[^\w.\-]/g, "_")}`;
      const { error: upErr } = await supabase.storage.from("fonts").upload(path, p.file, { upsert: true });
      if (upErr) {
        toast(`${p.file.name}: ${upErr.message}`, "error");
        continue;
      }
      const { data } = supabase.storage.from("fonts").getPublicUrl(path);
      const { error } = await supabase.from("fonts").insert({
        family: p.family.trim(),
        style_name: p.styleName.trim(),
        full_name: `${p.family.trim()} ${p.styleName.trim()}`,
        weight: p.weight,
        italic: p.italic,
        file_path: path,
        file_url: data.publicUrl,
        format: formatFromFilename(p.file.name),
      });
      if (error) toast(`${p.file.name}: ${error.message}`, "error");
      else ok++;
    }
    setPending([]);
    if (inputRef.current) inputRef.current.value = "";
    await reload();
    setBusy(false);
    if (ok) toast(`${ok} tipografía${ok > 1 ? "s" : ""} cargada${ok > 1 ? "s" : ""}`);
  };

  const remove = async (f: FontFace) => {
    await supabase.storage.from("fonts").remove([f.file_path]);
    const { error } = await supabase.from("fonts").delete().eq("id", f.id);
    if (error) return toast(error.message, "error");
    await reload();
    toast("Tipografía eliminada");
  };

  const grouped = groupByFamily(fonts);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-dashed bg-secondary/30 p-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <UploadCloud className="h-4 w-4" /> Subir archivos de tipografía
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Aceptamos .woff2, .woff, .ttf y .otf. Podés seleccionar todos los pesos de una familia de una sola vez; los
          nombres se completan solos y se pueden corregir.
        </p>
        <Input
          ref={inputRef}
          type="file"
          multiple
          accept=".woff2,.woff,.ttf,.otf"
          className="mt-3 h-auto py-2"
          onChange={(e) => pick(e.target.files)}
        />
      </div>

      {pending.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="eyebrow">Revisá los nombres antes de guardar</p>
          {pending.map((p, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 rounded-lg border p-2">
              <Input
                className="h-9"
                value={p.family}
                aria-label="Familia"
                onChange={(e) =>
                  setPending((prev) => prev.map((x, j) => (j === i ? { ...x, family: e.target.value } : x)))
                }
              />
              <Input
                className="h-9"
                value={p.styleName}
                aria-label="Estilo"
                onChange={(e) =>
                  setPending((prev) => prev.map((x, j) => (j === i ? { ...x, styleName: e.target.value } : x)))
                }
              />
              <Select
                value={String(p.weight)}
                onValueChange={(v) =>
                  setPending((prev) => prev.map((x, j) => (j === i ? { ...x, weight: Number(v) } : x)))
                }
              >
                <SelectTrigger className="h-9 w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WEIGHTS.map((w) => (
                    <SelectItem key={w} value={String(w)}>
                      {w} · {WEIGHT_NAMES[w]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPending([])}>
              Descartar
            </Button>
            <Button onClick={upload} disabled={busy}>
              {busy ? "Subiendo…" : `Guardar ${pending.length} tipografía${pending.length > 1 ? "s" : ""}`}
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {grouped.map(([family, faces]) => (
          <div key={family} className="rounded-lg border">
            <p className="border-b bg-secondary/40 px-3 py-2 text-sm font-semibold">{family}</p>
            <ul className="divide-y">
              {faces.map((f) => (
                <li key={f.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="w-28 shrink-0 text-xs text-muted-foreground">
                    {f.weight} · {f.style_name}
                  </span>
                  <span className="flex-1 truncate text-lg" style={{ fontFamily: `'${f.full_name}'` }}>
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
