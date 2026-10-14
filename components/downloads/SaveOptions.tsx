"use client";

import { useEffect, useState } from "react";
import { AlertCircle, ExternalLink, FolderCheck, Loader2 } from "lucide-react";
import { PanelTitle } from "@/components/shell/ContextBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  confirmFolder,
  DriveError,
  getDriveToken,
  getFolder,
  parseFolderLink,
  preloadDrive,
  type DriveConfig,
} from "@/lib/downloads/drive.client";
import type { AudioMode, Destination, SaveSettings } from "@/lib/downloads/types";
import { cn } from "@/lib/utils";

export const DEFAULT_SETTINGS: SaveSettings = { destino: "compu", audio: "con", carpeta: null };

const AUDIO: { value: AudioMode; label: string }[] = [
  { value: "con", label: "Con audio" },
  { value: "sin", label: "Sin audio" },
  { value: "solo", label: "Solo audio" },
];

const DESTINOS: { value: Destination; label: string }[] = [
  { value: "compu", label: "Compu" },
  { value: "ambos", label: "Compu y Drive" },
  { value: "drive", label: "Solo Drive" },
];

/** Resumen de una línea: "En tu compu · Sin audio", "En Drive: Material · Con audio". */
export function describeSettings(s: SaveSettings) {
  const where =
    s.destino === "compu" ? "En tu compu" : `${s.destino === "ambos" ? "Compu y Drive" : "En Drive"}: ${s.carpeta?.name ?? "falta la carpeta"}`;
  return `${where} · ${AUDIO.find((a) => a.value === s.audio)!.label}`;
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  disabled,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: (value: T) => boolean;
}) {
  return (
    <div className="grid grid-cols-3 gap-1 rounded-full bg-secondary p-0.5" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={disabled?.(o.value)}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-7 rounded-full px-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-40",
            value === o.value && "bg-card text-foreground shadow-sm"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SaveOptions({
  settings,
  onChange,
  drive,
  email,
}: {
  settings: SaveSettings;
  onChange: (next: SaveSettings) => void;
  drive: DriveConfig | null;
  email?: string | null;
}) {
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // El popup de Google tiene que abrirse en el mismo click: los scripts ya tienen que estar cargados.
  useEffect(() => {
    if (drive) preloadDrive();
  }, [drive]);

  const connectFolder = async () => {
    const id = parseFolderLink(link);
    if (!id) return setError("Ese link no es de una carpeta de Drive.");
    if (!drive) return;
    setBusy(true);
    setError(null);
    try {
      const token = await getDriveToken(drive, email);
      let folder = await getFolder(id, token);
      if (!folder) {
        // La app todavía no puede ver la carpeta: se confirma una vez en el selector de Google.
        if (!(await confirmFolder(drive, id, token))) {
          throw new DriveError("Para guardar ahí, elegí la carpeta en la ventana de Google.");
        }
        folder = await getFolder(id, token);
        if (!folder) throw new DriveError("Tu cuenta no tiene acceso a esa carpeta: pedile acceso a quien la compartió.");
      }
      onChange({ ...settings, carpeta: folder, destino: settings.destino === "compu" ? "ambos" : settings.destino });
      setLink("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo usar esa carpeta.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <PanelTitle title="Cómo se guarda" hint="Vale para todo lo que bajes. Se recuerda en tu cuenta." />

      <div className="space-y-1.5">
        <p className="text-xs font-medium">Sonido de los videos</p>
        <Segmented value={settings.audio} options={AUDIO} onChange={(audio) => onChange({ ...settings, audio })} />
        {settings.audio === "solo" && <p className="text-[11px] text-muted-foreground">Sale como .m4a. Las fotos se bajan igual.</p>}
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium">Dónde</p>
        <Segmented
          value={settings.destino}
          options={DESTINOS}
          onChange={(destino) => onChange({ ...settings, destino })}
          disabled={(d) => d !== "compu" && !drive}
        />
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium">Carpeta de Drive</p>
        {!drive ? (
          <p className="rounded-xl bg-secondary px-3 py-2 text-xs text-muted-foreground">
            Drive no está configurado en el servidor: faltan <code>GOOGLE_OAUTH_CLIENT_ID</code> y{" "}
            <code>GOOGLE_PICKER_API_KEY</code>.
          </p>
        ) : settings.carpeta ? (
          <div className="flex items-center gap-2 rounded-xl bg-secondary px-3 py-2">
            <FolderCheck className="h-4 w-4 shrink-0" />
            <a
              href={settings.carpeta.url}
              target="_blank"
              rel="noreferrer"
              className="flex min-w-0 flex-1 items-center gap-1 text-sm font-medium hover:underline"
              title="Abrir en Drive"
            >
              <span className="truncate">{settings.carpeta.name}</span>
              <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
            </a>
            <button
              type="button"
              onClick={() => onChange({ ...settings, carpeta: null, destino: "compu" })}
              className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium text-foreground/80 hover:bg-black/5"
            >
              Cambiar
            </button>
          </div>
        ) : (
          <form
            className="space-y-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              connectFolder();
            }}
          >
            <div className="flex gap-1.5">
              <Input
                value={link}
                onChange={(e) => {
                  setLink(e.target.value);
                  setError(null);
                }}
                placeholder="Link de la carpeta"
                aria-label="Link de la carpeta de Drive"
                className="h-8 text-xs"
              />
              <Button type="submit" size="sm" disabled={busy || !link.trim()}>
                {busy ? <Loader2 className="animate-spin" /> : "Usar"}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              La primera vez Google te pide permiso y que confirmes la carpeta. La app solo ve lo que guarda ahí.
            </p>
          </form>
        )}
        {error && (
          <p className="flex items-start gap-1.5 text-xs text-destructive">
            <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
            {error}
          </p>
        )}
        {drive && settings.destino !== "compu" && !settings.carpeta && !error && (
          <p className="text-[11px] font-medium text-destructive">Pegá el link de la carpeta para poder guardar en Drive.</p>
        )}
      </div>
    </div>
  );
}
