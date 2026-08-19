"use client";

import { useRef } from "react";
import { useData } from "@/components/data/DataProvider";
import { useFontQueue } from "@/hooks/useFontQueue";
import { useAction } from "@/hooks/useAction";
import { fontsRepo, type FontRow } from "@/lib/repos";
import { fullFontName, formatFromFilename } from "@/lib/fonts/fontfile";
import { QueueGroupCard } from "./fonts/QueueGroupCard";
import { SavedFontsList } from "./fonts/SavedFontsList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { AlertTriangle, Loader2, UploadCloud } from "lucide-react";

export function FontsTab() {
  const { fonts, reload } = useData();
  const q = useFontQueue(fonts);
  const { busy, run } = useAction();
  const inputRef = useRef<HTMLInputElement>(null);

  const save = () =>
    run(async () => {
      let saved = 0;
      let replaced = 0;

      for (const file of q.queue) {
        const chosen = file.faces.filter((f) => f.include);
        if (!chosen.length) continue;

        // Una fuente variable es UN archivo con varios pesos: se sube una sola vez.
        const { error: upErr, path, url } = await fontsRepo.uploadFile(file.file);
        if (upErr) {
          toast(`${file.file.name}: ${upErr.message}`, "error");
          continue;
        }

        const rows: FontRow[] = chosen.map((f) => ({
          family: file.family.trim(),
          style_name: f.styleName.trim(),
          full_name: fullFontName(file.family, f.styleName),
          weight: f.weight,
          italic: f.italic,
          file_path: path,
          file_url: url,
          format: formatFromFilename(file.file.name),
          is_variable: file.isVariable,
        }));

        const error = await fontsRepo.saveMany(rows);
        if (error) toast(`${file.file.name}: ${error.message}`, "error");
        else rows.forEach((r) => (q.existingNames.has(r.full_name) ? replaced++ : saved++));
      }

      q.clear();
      await reload();

      if (saved || replaced) {
        const partes = [
          saved && `${saved} nueva${saved > 1 ? "s" : ""}`,
          replaced && `${replaced} reemplazada${replaced > 1 ? "s" : ""}`,
        ].filter(Boolean);
        toast(`Tipografías guardadas: ${partes.join(", ")}`);
      }
    });

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
          onChange={async (e) => {
            await q.add(e.target.files);
            if (inputRef.current) inputRef.current.value = ""; // permite volver a elegir el mismo archivo
          }}
        />
      </div>

      {q.reading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Leyendo archivos…
        </p>
      )}

      {q.groups.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="eyebrow">En cola · así se van a guardar</p>

          {q.groups.map((group) => (
            <QueueGroupCard
              key={group.family}
              group={group}
              alreadyExists={q.existingFamilies.has(group.family.toLowerCase())}
              conflicts={q.conflicts}
              onToggleFace={q.toggleFace}
              onRename={q.renameFamily}
              onSetAll={q.setFamilyInclude}
              onDropFile={q.dropFile}
            />
          ))}

          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={q.clear} disabled={busy}>
              Vaciar la cola
            </Button>
            <Button onClick={save} disabled={busy || !q.totalSelected}>
              {busy ? "Subiendo…" : `Guardar ${q.totalSelected} tipografía${q.totalSelected === 1 ? "" : "s"}`}
            </Button>
          </div>

          {q.hasDuplicates && (
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

      <SavedFontsList />
    </div>
  );
}
