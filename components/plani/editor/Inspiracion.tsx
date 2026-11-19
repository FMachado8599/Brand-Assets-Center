"use client";

import { useRef, useState, type DragEvent } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "@/components/ui/toaster";
import type { Medio, Pieza } from "@/lib/plani/types";
import { borrarMedio, subirMedio, SubidaError } from "@/lib/plani/upload";
import { cn } from "@/lib/utils";
import { medioUrl } from "../bits";

/**
 * La inspiración de una pieza: imágenes que sube Redacción (capturas, moodboards, ejemplos) para
 * que Diseño sepa por dónde ir. Viven en el Drive del estudio con el resto del material, pero no
 * son parte de lo que se entrega: el cliente no las ve y no entran en "Bajar todo".
 */
export function Inspiracion({
  pieza,
  onChange,
  onOpen,
}: {
  pieza: Pieza;
  /** Sin esto se ve pero no se cambia (en Diseño). */
  onChange?: (medios: Medio[]) => void;
  onOpen?: (m: Medio) => void;
}) {
  const imagenes = pieza.medios.filter((m) => m.rol === "referencia");
  const [subiendo, setSubiendo] = useState(0);
  const [encima, setEncima] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  // Lo último que se mandó: dos imágenes que terminan casi juntas no se pisan.
  const latest = useRef(pieza.medios);
  latest.current = pieza.medios;

  const subir = async (files: File[]) => {
    if (!onChange) return;
    const validas = files.filter((f) => f.type.startsWith("image/"));
    if (validas.length < files.length) toast("La inspiración son imágenes", "error");
    for (const file of validas) {
      setSubiendo((n) => n + 1);
      try {
        const medio = await subirMedio(pieza.id, file, "referencia");
        latest.current = [...latest.current, medio];
        onChange(latest.current);
      } catch (e) {
        toast(e instanceof SubidaError ? e.message : `No se pudo subir ${file.name}`, "error");
      } finally {
        setSubiendo((n) => n - 1);
      }
    }
  };

  const quitar = (m: Medio) => {
    if (!onChange) return;
    latest.current = latest.current.filter((x) => x.id !== m.id);
    onChange(latest.current);
    borrarMedio(m.drive_id);
  };

  const soltar = (e: DragEvent) => {
    e.preventDefault();
    setEncima(false);
    subir([...e.dataTransfer.files]);
  };

  if (!onChange && !imagenes.length) return <p className="text-xs italic text-muted-foreground">Sin imágenes de inspiración</p>;

  return (
    <div
      onDragOver={onChange ? (e) => (e.preventDefault(), setEncima(true)) : undefined}
      onDragLeave={onChange ? () => setEncima(false) : undefined}
      onDrop={onChange ? soltar : undefined}
      className={cn("rounded-xl transition-colors", encima && "bg-primary/15 ring-2 ring-primary/50")}
    >
      <ul className="flex flex-wrap gap-2">
        {imagenes.map((m) => (
          <li key={m.id} className="group relative">
            <button
              type="button"
              onClick={() => onOpen?.(m)}
              className="block h-20 w-20 overflow-hidden rounded-lg bg-secondary"
              title={m.nombre}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={medioUrl(m, 240)} alt={m.nombre} className="h-full w-full object-cover" loading="lazy" />
            </button>
            {onChange && (
              <button
                type="button"
                onClick={() => quitar(m)}
                aria-label={`Sacar ${m.nombre}`}
                className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-ink text-cream opacity-0 shadow transition-opacity group-hover:opacity-100 focus:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </li>
        ))}
        {onChange && (
          <li>
            <button
              type="button"
              onClick={() => input.current?.click()}
              className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-foreground/15 text-[11px] text-muted-foreground transition-colors hover:border-foreground/35 hover:text-foreground"
            >
              {subiendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
              {subiendo ? "Subiendo…" : "Sumar"}
            </button>
            <input
              ref={input}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                subir([...(e.target.files ?? [])]);
                e.target.value = "";
              }}
            />
          </li>
        )}
      </ul>
    </div>
  );
}
