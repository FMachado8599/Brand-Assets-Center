"use client";

import { useRef, useState, type ReactNode } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { toast } from "@/components/ui/toaster";
import { LOGO_ACCEPT, logoProblem } from "@/lib/clients/logo";
import { cn } from "@/lib/utils";

/**
 * Un lugar para soltar (o elegir) el logo. Si ya hay uno, lo muestra sobre
 * `background` y se puede soltar otro encima para cambiarlo.
 */
export function LogoDrop({
  preview,
  background = "#ffffff",
  onFile,
  busy,
  className,
  hint = "Soltá el logo o hacé click",
  photo,
  children,
}: {
  preview: string | null;
  /** El logo es una foto de perfil: se muestra redonda, como en la red. */
  photo?: boolean;
  background?: string;
  onFile: (file: File) => void;
  busy?: boolean;
  className?: string;
  hint?: string;
  /** Algo encima (ej: los botones de la ficha). */
  children?: ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const take = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    const problem = logoProblem(file);
    if (problem) toast(problem, "error");
    else onFile(file);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        take(e.dataTransfer.files);
      }}
      className={cn(
        "group relative overflow-hidden rounded-2xl transition-shadow",
        preview ? "ring-1 ring-inset ring-black/[0.08]" : "border-2 border-dashed border-foreground/15 bg-secondary/40",
        over && "ring-2 ring-ring ring-offset-2 ring-offset-card",
        className
      )}
      style={preview ? { background } : undefined}
    >
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        aria-label={preview ? "Cambiar el logo" : "Subir el logo"}
        className="absolute inset-0 grid grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] place-items-center rounded-2xl"
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt=""
            draggable={false}
            className={photo ? "aspect-square h-[72%] rounded-full object-cover shadow-sm" : "h-full w-full object-contain p-[14%]"}
          />
        ) : (
          <span className="flex flex-col items-center gap-1.5 px-3 text-center text-xs text-muted-foreground">
            <ImagePlus className="h-6 w-6 text-foreground/40" />
            {hint}
          </span>
        )}
      </button>
      {busy && (
        <span className="pointer-events-none absolute inset-0 grid place-items-center bg-card/70">
          <Loader2 className="h-5 w-5 animate-spin" />
        </span>
      )}
      {children}
      <input
        ref={input}
        type="file"
        accept={LOGO_ACCEPT}
        className="hidden"
        onChange={(e) => {
          take(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
