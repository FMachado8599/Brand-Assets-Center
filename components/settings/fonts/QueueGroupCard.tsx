"use client";

import { useState } from "react";
import { fullFontName } from "@/lib/fonts/fontfile";
import { previewFamily, type QueueGroup } from "@/hooks/useFontQueue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Check, Pencil, X } from "lucide-react";

type Props = {
  group: QueueGroup;
  alreadyExists: boolean;
  conflicts: (name: string) => boolean;
  onToggleFace: (key: string, index: number) => void;
  onRename: (oldFamily: string, next: string) => void;
  onSetAll: (family: string, on: boolean) => void;
  onDropFile: (key: string) => void;
};

/** Una familia en la cola: sus pesos con muestra real y casilla. */
export function QueueGroupCard({
  group,
  alreadyExists,
  conflicts,
  onToggleFace,
  onRename,
  onSetAll,
  onDropFile,
}: Props) {
  const [editing, setEditing] = useState(false);

  const fileKeys = Array.from(new Set(group.rows.map((r) => r.file.key)));
  const fileNames = Array.from(new Set(group.rows.map((r) => r.file.file.name)));
  const allSelected = group.selected === group.rows.length;

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b bg-secondary/40 px-3 py-2">
        {editing ? (
          <Input
            autoFocus
            className="h-8 flex-1"
            value={group.family}
            onChange={(e) => onRename(group.family, e.target.value)}
            onBlur={() => setEditing(false)}
            onKeyDown={(e) => e.key === "Enter" && setEditing(false)}
          />
        ) : (
          <>
            <p className="text-sm font-semibold">{group.family}</p>
            <Button
              variant="ghost"
              size="iconSm"
              onClick={() => setEditing(true)}
              aria-label={`Corregir el nombre de ${group.family}`}
            >
              <Pencil />
            </Button>
          </>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          {group.isVariable && <Badge className="border-transparent bg-primary/10 text-primary">Variable</Badge>}
          {group.guessed && <Badge className="border-transparent bg-card text-muted-foreground">Deducido del nombre</Badge>}
          {alreadyExists && <Badge className="border-transparent bg-card text-muted-foreground">Ya existe</Badge>}
          <span className="text-xs text-muted-foreground">
            {group.selected}/{group.rows.length}
          </span>
          <Button variant="ghost" size="sm" onClick={() => onSetAll(group.family, !allSelected)}>
            {allSelected ? "Ninguno" : "Todos"}
          </Button>
        </div>
      </div>

      <ul className="divide-y">
        {group.rows.map(({ file, index, face }) => {
          const name = fullFontName(group.family, face.styleName);
          const conflict = conflicts(name);
          return (
            <li key={`${file.key}-${index}`} className="flex items-center gap-3 px-3 py-2">
              <button
                onClick={() => onToggleFace(file.key, index)}
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
                  fontFamily: `'${previewFamily(file.key, index)}'`,
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
        <p className="truncate font-mono text-[11px] text-muted-foreground">{fileNames.join(", ")}</p>
        <div className="flex gap-1">
          {fileKeys.map((key) => (
            <Button
              key={key}
              variant="ghost"
              size="iconSm"
              onClick={() => onDropFile(key)}
              aria-label="Quitar este archivo de la cola"
            >
              <X />
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
