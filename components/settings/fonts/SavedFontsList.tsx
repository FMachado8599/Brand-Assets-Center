"use client";

import { fontsRepo } from "@/lib/repos";
import { groupByFamily } from "@/lib/fonts/fonts";
import { useData } from "@/components/data/DataProvider";
import { useAction } from "@/hooks/useAction";
import { useConfirm } from "@/components/ui/confirm";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import type { FontFace } from "@/lib/types";

/** Lo que ya está guardado, agrupado por familia. */
export function SavedFontsList() {
  const { fonts, reload } = useData();
  const { run } = useAction();
  const confirm = useConfirm();

  const removeOne = async (face: FontFace) => {
    const ok = await run(async () => {
      const error = await fontsRepo.removeFaces([face], fonts);
      if (error) throw error;
    }, `${face.full_name} eliminada`);
    if (ok) await reload();
  };

  const removeFamily = async (family: string, faces: FontFace[]) => {
    const sure = await confirm({
      title: `¿Eliminar ${family}?`,
      description: `Se van a borrar sus ${faces.length} tipografías.`,
      confirmLabel: "Eliminar",
      destructive: true,
    });
    if (!sure) return;
    const ok = await run(async () => {
      const error = await fontsRepo.removeFaces(faces, fonts);
      if (error) throw error;
    }, `${family} eliminada`);
    if (ok) await reload();
  };

  if (!fonts.length) {
    return (
      <p className="rounded-lg border px-3 py-6 text-center text-sm text-muted-foreground">
        Todavía no subiste ninguna tipografía.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {groupByFamily(fonts).map(([family, faces]) => (
        <div key={family} className="rounded-lg border">
          <div className="flex items-center gap-2 border-b bg-secondary/40 px-3 py-2">
            <p className="flex-1 text-sm font-semibold">{family}</p>
            <span className="text-xs text-muted-foreground">{faces.length}</span>
            <Button
              variant="ghost"
              size="iconSm"
              onClick={() => removeFamily(family, faces)}
              aria-label={`Eliminar ${family}`}
            >
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
                  style={{
                    fontFamily: `'${f.full_name}'`,
                    fontWeight: f.weight,
                    fontStyle: f.italic ? "italic" : "normal",
                  }}
                >
                  Aa Bb Cc 123
                </span>
                <Button variant="ghost" size="iconSm" onClick={() => removeOne(f)} aria-label={`Eliminar ${f.full_name}`}>
                  <Trash2 className="text-destructive" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
