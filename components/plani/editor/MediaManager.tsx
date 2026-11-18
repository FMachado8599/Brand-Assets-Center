"use client";

import { useRef, useState, type DragEvent } from "react";
import { ArrowLeft, ArrowRight, HardDriveUpload, ImagePlus, Loader2, Trash2, Video } from "lucide-react";
import { toast } from "@/components/ui/toaster";
import { useEquipo } from "@/hooks/useEquipo";
import { conectarUrl, useIntegraciones } from "@/hooks/useIntegraciones";
import { FORMATOS, MEDIDAS } from "@/lib/plani/config";
import type { Medio, Pieza } from "@/lib/plani/types";
import { borrarMedio, subirMedio, SubidaError } from "@/lib/plani/upload";
import { cn } from "@/lib/utils";
import { esVideo, medioUrl, pesoLegible } from "../bits";

type Subida = { key: string; nombre: string; progreso: number; rol: Medio["rol"] };

/**
 * El material final de una pieza, en el Drive del estudio. Se suelta un archivo (o varios, en un
 * carrusel) y sube directo a Google con su barra de progreso. Un reel tiene además su portada.
 */
export function MediaManager({ pieza, onChange }: { pieza: Pieza; onChange: (medios: Medio[]) => void }) {
  const { driveOk, loaded, data } = useIntegraciones();
  const { admin } = useEquipo();
  const [subidas, setSubidas] = useState<Subida[]>([]);
  // Lo último que se mandó: dos archivos que terminan casi juntos no se pisan.
  const latest = useRef(pieza.medios);
  latest.current = pieza.medios;

  const info = FORMATOS[pieza.formato];
  const finales = pieza.medios.filter((m) => m.rol === "final");
  const portada = pieza.medios.find((m) => m.rol === "portada") ?? null;
  const medida = MEDIDAS[pieza.proporcion];

  const commit = (next: Medio[]) => {
    latest.current = next;
    onChange(next);
  };

  const subir = async (files: File[], rol: Medio["rol"]) => {
    const validos = files.filter((f) =>
      rol === "portada" ? f.type.startsWith("image/") : f.type.startsWith("image/") || (info.video && f.type.startsWith("video/"))
    );
    if (validos.length < files.length) toast(info.video ? "Solo imágenes o videos" : "Solo imágenes", "error");
    // Post, reel, historia y portada: un solo archivo (el nuevo reemplaza al anterior).
    const lote = rol === "final" && info.multiple ? validos : validos.slice(0, 1);
    for (const file of lote) {
      const key = crypto.randomUUID();
      setSubidas((s) => [...s, { key, nombre: file.name, progreso: 0, rol }]);
      try {
        const medio = await subirMedio(pieza.id, file, rol, (p) =>
          setSubidas((s) => s.map((x) => (x.key === key ? { ...x, progreso: p } : x)))
        );
        const reemplaza = !(rol === "final" && info.multiple);
        const viejos = reemplaza ? latest.current.filter((m) => m.rol === rol) : [];
        commit([...latest.current.filter((m) => !viejos.includes(m)), medio]);
        viejos.forEach((m) => borrarMedio(m.drive_id));
      } catch (e) {
        toast(e instanceof SubidaError ? e.message : `No se pudo subir ${file.name}`, "error");
      } finally {
        setSubidas((s) => s.filter((x) => x.key !== key));
      }
    }
  };

  const quitar = (m: Medio) => {
    commit(latest.current.filter((x) => x.id !== m.id));
    borrarMedio(m.drive_id);
  };

  const mover = (m: Medio, dir: -1 | 1) => {
    const lista = latest.current.filter((x) => x.rol === "final");
    const i = lista.findIndex((x) => x.id === m.id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= lista.length) return;
    [lista[i], lista[j]] = [lista[j], lista[i]];
    commit([...lista, ...latest.current.filter((x) => x.rol !== "final")]);
  };

  if (loaded && !driveOk) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-foreground/20 p-4 text-sm">
        <p className="text-muted-foreground">
          El material final se guarda en el Drive del estudio, en carpetas por cliente, plani y día.
          {data && !data.listo.google
            ? " Falta configurar Google en el servidor."
            : admin
              ? " Todavía no está conectado."
              : " Todavía no está conectado: lo conecta un admin de la app."}
        </p>
        {admin && (!data || data.listo.google) && (
          <a href={conectarUrl("google")} className="inline-flex h-9 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-95">
            <HardDriveUpload className="h-4 w-4" /> Conectar el Drive
          </a>
        )}
      </div>
    );
  }

  const enCurso = (rol: Medio["rol"]) => subidas.filter((s) => s.rol === rol);

  return (
    <div className="space-y-3">
      <Zona
        label={pieza.formato === "carrusel" ? "Slides" : pieza.formato === "reel" ? "Video" : "Archivo final"}
        hint={`${medida.w}×${medida.h} px${pieza.formato === "carrusel" ? ` · ${pieza.slides.length || 1} slides pedidas` : ""}`}
        accept={info.video && pieza.formato !== "carrusel" ? "image/*,video/*" : "image/*"}
        multiple={info.multiple}
        onFiles={(f) => subir(f, "final")}
        vacia={!finales.length}
      >
        {(finales.length > 0 || enCurso("final").length > 0) && (
          <ul className="flex flex-wrap gap-2">
            {finales.map((m, i) => (
              <Thumb
                key={m.id}
                medio={m}
                indice={pieza.formato === "carrusel" ? i + 1 : undefined}
                onQuitar={() => quitar(m)}
                onIzq={pieza.formato === "carrusel" && i > 0 ? () => mover(m, -1) : undefined}
                onDer={pieza.formato === "carrusel" && i < finales.length - 1 ? () => mover(m, 1) : undefined}
              />
            ))}
            {enCurso("final").map((s) => (
              <Progreso key={s.key} s={s} />
            ))}
          </ul>
        )}
      </Zona>

      {pieza.formato === "reel" && (
        <Zona label="Portada" hint="La tapa que se ve en el feed" accept="image/*" onFiles={(f) => subir(f, "portada")} vacia={!portada}>
          {(portada || enCurso("portada").length > 0) && (
            <ul className="flex flex-wrap gap-2">
              {portada && <Thumb medio={portada} onQuitar={() => quitar(portada)} />}
              {enCurso("portada").map((s) => (
                <Progreso key={s.key} s={s} />
              ))}
            </ul>
          )}
        </Zona>
      )}
    </div>
  );
}

function Zona({
  label,
  hint,
  accept,
  multiple,
  onFiles,
  vacia,
  children,
}: {
  label: string;
  hint: string;
  accept: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  vacia: boolean;
  children?: React.ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) onFiles(files);
  };
  return (
    <div
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={drop}
      className={cn("rounded-2xl border border-dashed p-2.5 transition-colors", over ? "border-foreground/50 bg-primary/15" : "border-foreground/15")}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="eyebrow">{label}</span>
        <span className="text-[11px] text-muted-foreground">{hint}</span>
      </div>
      {children}
      <button
        type="button"
        onClick={() => input.current?.click()}
        className={cn(
          "flex w-full items-center justify-center gap-2 rounded-xl text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
          vacia ? "h-14" : "mt-2 h-8 text-xs"
        )}
      >
        {accept.includes("video") ? <Video className="h-4 w-4" /> : <ImagePlus className="h-4 w-4" />}
        <span>{vacia ? "Soltá el archivo acá o hacé click" : multiple ? "Agregar más" : "Reemplazar"}</span>
      </button>
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) onFiles(files);
        }}
      />
    </div>
  );
}

function Thumb({
  medio,
  indice,
  onQuitar,
  onIzq,
  onDer,
}: {
  medio: Medio;
  indice?: number;
  onQuitar: () => void;
  onIzq?: () => void;
  onDer?: () => void;
}) {
  return (
    <li
      className="group relative h-20 overflow-hidden rounded-lg bg-secondary"
      style={{ aspectRatio: medio.ancho && medio.alto ? `${medio.ancho} / ${medio.alto}` : "4 / 5" }}
      title={`${medio.nombre} · ${pesoLegible(medio.tamano)}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={medioUrl(medio, 400)}
        alt={medio.nombre}
        className="h-full w-full object-cover"
        draggable={false}
        // Un video recién subido puede no tener miniatura todavía: queda el fondo con el ícono.
        onError={(e) => (e.currentTarget.style.visibility = "hidden")}
      />
      {esVideo(medio) && (
        <span className="absolute left-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-black/60 text-white">
          <Video className="h-3 w-3" />
        </span>
      )}
      {indice !== undefined && (
        <span className="absolute left-1.5 top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-black/65 px-1 text-[10px] font-bold text-white">{indice}</span>
      )}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100">
        <IconBtn label="Sacar (va a la papelera del Drive)" onClick={onQuitar} icon={Trash2} />
        {(onIzq || onDer) && (
          <span className="flex">
            {onIzq && <IconBtn label="Mover antes" onClick={onIzq} icon={ArrowLeft} />}
            {onDer && <IconBtn label="Mover después" onClick={onDer} icon={ArrowRight} />}
          </span>
        )}
      </div>
    </li>
  );
}

function IconBtn({ label, onClick, icon: Icon }: { label: string; onClick: () => void; icon: typeof Trash2 }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="grid h-6 w-6 place-items-center rounded-full hover:bg-white/20">
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

function Progreso({ s }: { s: Subida }) {
  return (
    <li className="relative flex h-20 w-16 flex-col items-center justify-center gap-1 overflow-hidden rounded-lg bg-secondary p-1 text-center" title={s.nombre}>
      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      <span className="text-[10px] tabular-nums text-muted-foreground">{Math.round(s.progreso * 100)}%</span>
      <span className="absolute inset-x-0 bottom-0 h-1 bg-black/10">
        <span className="block h-full bg-primary transition-[width]" style={{ width: `${Math.round(s.progreso * 100)}%` }} />
      </span>
    </li>
  );
}
