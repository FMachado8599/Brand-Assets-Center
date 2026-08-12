"use client";

import * as React from "react";
import { supabase } from "@/lib/supabase";
import { WEIGHTS, WEIGHT_NAMES, type FontFace } from "@/lib/types";
import { groupByFamily } from "@/lib/fonts";
import { readFontFile, formatFromFilename, type FontInstance } from "@/lib/fontinfo";
import { toast } from "@/components/ui/toaster";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, UploadCloud, X, AlertTriangle, Loader2 } from "lucide-react";

/** Un archivo en la cola, con los pesos que se van a registrar. */
export type PendingFont = {
  key: string;
  file: File;
  family: string;
  isVariable: boolean;
  fromFile: boolean;
  instances: FontInstance[];
  /** índices de `instances` marcados para guardar */
  selected: Set<number>;
};

type Props = { fonts: FontFace[]; reload: () => Promise<void> };

export function FontsPanel({ fonts, reload }: Props) {
  const [pending, setPending] = React.useState<PendingFont[]>([]);
  const [reading, setReading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  /**
   * Familias que ya existen, indexadas sin distinguir mayúsculas. Si subís
   * "MONTSERRAT-BOLD.TTF" y en la base ya hay "Montserrat", el peso nuevo
   * se suma a esa familia en vez de crear una segunda con otra grafía.
   */
  const existingFamilies = React.useMemo(() => {
    const map = new Map<string, string>();
    fonts.forEach((f) => map.set(f.family.toLowerCase(), f.family));
    return map;
  }, [fonts]);

  /* Los archivos nuevos se SUMAN a la cola, no la reemplazan. */
  const pick = async (files: FileList | null) => {
    if (!files?.length) return;
    setReading(true);
    const added: PendingFont[] = [];

    // También unificamos contra lo que ya está esperando en la cola
    const known = new Map(existingFamilies);
    pending.forEach((p) => known.set(p.family.toLowerCase(), p.family));

    for (const file of Array.from(files)) {
      const meta = await readFontFile(file);
      const family = known.get(meta.family.toLowerCase()) || meta.family;
      known.set(family.toLowerCase(), family);
      added.push({
        key: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        family,
        isVariable: meta.isVariable,
        fromFile: meta.fromFile,
        instances: meta.instances,
        selected: new Set(meta.instances.map((_, i) => i)),
      });
    }

    setPending((prev) => [...prev, ...added]);
    setReading(false);
    if (inputRef.current) inputRef.current.value = ""; // permite volver a elegir el mismo archivo
  };

  const patch = (key: string, changes: Partial<PendingFont>) =>
    setPending((prev) => prev.map((p) => (p.key === key ? { ...p, ...changes } : p)));

  const removePending = (key: string) => setPending((prev) => prev.filter((p) => p.key !== key));

  /** Todos los nombres que van a quedar, para avisar de choques. */
  const plannedNames = React.useMemo(() => {
    const counts = new Map<string, number>();
    pending.forEach((p) =>
      p.instances.forEach((inst, i) => {
        if (!p.selected.has(i)) return;
        const name = fullName(p.family, inst.styleName);
        counts.set(name, (counts.get(name) || 0) + 1);
      })
    );
    return counts;
  }, [pending]);

  const existingNames = React.useMemo(() => new Set(fonts.map((f) => f.full_name)), [fonts]);

  const totalSelected = pending.reduce((n, p) => n + p.selected.size, 0);

  const upload = async () => {
    setBusy(true);
    let saved = 0;
    let replaced = 0;

    for (const p of pending) {
      if (!p.selected.size) continue;

      // Una fuente variable es UN archivo con varios pesos: se sube una vez
      // sola y todos los pesos apuntan al mismo archivo.
      const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${p.file.name.replace(/[^\w.\-]/g, "_")}`;
      const { error: upErr } = await supabase.storage.from("fonts").upload(path, p.file, { upsert: true });
      if (upErr) {
        toast(`${p.file.name}: ${upErr.message}`, "error");
        continue;
      }
      const { data } = supabase.storage.from("fonts").getPublicUrl(path);

      const rows = p.instances
        .filter((_, i) => p.selected.has(i))
        .map((inst) => ({
          family: p.family.trim(),
          style_name: inst.styleName.trim(),
          full_name: fullName(p.family, inst.styleName),
          weight: inst.weight,
          italic: inst.italic,
          file_path: path,
          file_url: data.publicUrl,
          format: formatFromFilename(p.file.name),
          is_variable: p.isVariable,
        }));

      rows.forEach((r) => (existingNames.has(r.full_name) ? replaced++ : saved++));

      // upsert: si el nombre ya existía, se reemplaza en vez de fallar en silencio
      const { error } = await supabase.from("fonts").upsert(rows, { onConflict: "full_name" });
      if (error) toast(`${p.file.name}: ${error.message}`, "error");
    }

    setPending([]);
    await reload();
    setBusy(false);
    if (saved || replaced) {
      const partes = [saved && `${saved} nueva${saved > 1 ? "s" : ""}`, replaced && `${replaced} reemplazada${replaced > 1 ? "s" : ""}`].filter(Boolean);
      toast(`Tipografías guardadas: ${partes.join(", ")}`);
    }
  };

  /** Borra el archivo del storage solo si ninguna otra tipografía lo usa. */
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
    const paths = Array.from(new Set(faces.map((f) => f.file_path)));
    const stillUsed = new Set(fonts.filter((f) => !ids.includes(f.id)).map((f) => f.file_path));
    const toDelete = paths.filter((p) => !stillUsed.has(p));
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
          Aceptamos .ttf, .otf, .woff y .woff2. Leemos el archivo para sacar la familia y los pesos reales. Si es una
          fuente variable, aparecen todos los pesos que trae adentro y elegís cuáles registrar.
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

      {pending.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="eyebrow">En cola · revisá antes de guardar</p>

          {pending.map((p) => (
            <PendingRow
              key={p.key}
              item={p}
              existingNames={existingNames}
              plannedNames={plannedNames}
              joinsFamily={existingFamilies.has(p.family.trim().toLowerCase())}
              onPatch={(changes) => patch(p.key, changes)}
              onRemove={() => removePending(p.key)}
            />
          ))}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setPending([])} disabled={busy}>
              Vaciar la cola
            </Button>
            <Button onClick={upload} disabled={busy || !totalSelected}>
              {busy ? "Subiendo…" : `Guardar ${totalSelected} tipografía${totalSelected === 1 ? "" : "s"}`}
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {grouped.map(([family, faces]) => (
          <div key={family} className="rounded-lg border">
            <div className="flex items-center gap-2 border-b bg-secondary/40 px-3 py-2">
              <p className="flex-1 text-sm font-semibold">{family}</p>
              {faces.some((f) => f.is_variable) && <Badge className="border-transparent bg-card">Variable</Badge>}
              <span className="text-xs text-muted-foreground">{faces.length}</span>
              <Button variant="ghost" size="iconSm" onClick={() => removeFamily(family, faces)} aria-label={`Eliminar ${family}`}>
                <Trash2 className="text-destructive" />
              </Button>
            </div>
            <ul className="divide-y">
              {faces.map((f) => (
                <li key={f.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="w-32 shrink-0 text-xs text-muted-foreground">
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

function fullName(family: string, styleName: string) {
  return `${family.trim()} ${styleName.trim()}`.replace(/\s+/g, " ").trim();
}

/* ------------------------------------------------------- fila en cola */

function PendingRow({
  item,
  existingNames,
  plannedNames,
  joinsFamily,
  onPatch,
  onRemove,
}: {
  item: PendingFont;
  existingNames: Set<string>;
  plannedNames: Map<string, number>;
  joinsFamily: boolean;
  onPatch: (changes: Partial<PendingFont>) => void;
  onRemove: () => void;
}) {
  const toggle = (i: number) => {
    const next = new Set(item.selected);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    onPatch({ selected: next });
  };

  const setAll = (on: boolean) =>
    onPatch({ selected: on ? new Set(item.instances.map((_, i) => i)) : new Set<number>() });

  const setStyle = (i: number, changes: Partial<FontInstance>) =>
    onPatch({ instances: item.instances.map((inst, j) => (j === i ? { ...inst, ...changes } : inst)) });

  const conflicts = item.instances
    .map((inst, i) => (item.selected.has(i) ? fullName(item.family, inst.styleName) : null))
    .filter((n): n is string => Boolean(n))
    .filter((n) => (plannedNames.get(n) || 0) > 1 || existingNames.has(n));

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-xs text-muted-foreground" title={item.file.name}>
            {item.file.name}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {item.isVariable && <Badge className="border-transparent bg-primary/10 text-primary">Fuente variable</Badge>}
            {!item.fromFile && (
              <Badge className="border-transparent bg-secondary text-muted-foreground">Deducido del nombre</Badge>
            )}
            {joinsFamily && (
              <Badge className="border-transparent bg-secondary text-muted-foreground">
                Se suma a {item.family}
              </Badge>
            )}
          </div>
        </div>
        <Button variant="ghost" size="iconSm" onClick={onRemove} aria-label={`Quitar ${item.file.name} de la cola`}>
          <X />
        </Button>
      </div>

      <div className="mt-3 flex items-end gap-2">
        <div className="flex-1">
          <label className="eyebrow">Familia</label>
          <Input className="mt-1 h-9" value={item.family} onChange={(e) => onPatch({ family: e.target.value })} />
        </div>
        {item.instances.length > 1 && (
          <div className="flex gap-1 pb-0.5">
            <Button variant="outline" size="sm" onClick={() => setAll(true)}>
              Todos
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAll(false)}>
              Ninguno
            </Button>
          </div>
        )}
      </div>

      {item.instances.length > 1 ? (
        <div className="mt-3">
          <p className="eyebrow">Pesos a registrar</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {item.instances.map((inst, i) => {
              const on = item.selected.has(i);
              return (
                <button
                  key={i}
                  onClick={() => toggle(i)}
                  aria-pressed={on}
                  className={
                    "rounded-full border px-2.5 py-1 text-[12px] transition-colors " +
                    (on ? "border-foreground bg-foreground text-background" : "bg-card text-muted-foreground hover:bg-accent")
                  }
                >
                  {inst.weight} {inst.styleName}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-[1fr_150px] gap-2">
          <div>
            <label className="eyebrow">Estilo</label>
            <Input
              className="mt-1 h-9"
              value={item.instances[0]?.styleName || ""}
              onChange={(e) => setStyle(0, { styleName: e.target.value })}
            />
          </div>
          <div>
            <label className="eyebrow">Peso</label>
            <Select value={String(item.instances[0]?.weight ?? 400)} onValueChange={(v) => setStyle(0, { weight: Number(v) })}>
              <SelectTrigger className="mt-1 h-9">
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
        </div>
      )}

      <p className="mt-2.5 text-xs text-muted-foreground">
        Se van a guardar como:{" "}
        <span className="text-foreground">
          {item.selected.size
            ? item.instances
                .filter((_, i) => item.selected.has(i))
                .map((inst) => fullName(item.family, inst.styleName))
                .join(" · ")
            : "nada seleccionado"}
        </span>
      </p>

      {conflicts.length > 0 && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-destructive">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>
            {conflicts.slice(0, 3).join(", ")}
            {conflicts.length > 3 && ` y ${conflicts.length - 3} más`} ya existe. Si guardás, se reemplaza. Cambiá el
            nombre de la familia o quitá este archivo de la cola.
          </span>
        </p>
      )}
    </div>
  );
}
