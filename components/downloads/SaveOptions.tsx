"use client";

import { useEffect, useState } from "react";
import { AlertCircle, ExternalLink, FolderCheck, Loader2 } from "lucide-react";
import { PanelTitle } from "@/components/shell/ContextBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Hint } from "@/components/ui/tooltip";
import {
  confirmFolder,
  DriveError,
  getDriveToken,
  getFolder,
  parseFolderLink,
  preloadDrive,
  type DriveConfig,
} from "@/lib/downloads/drive.client";
import type { CoverMode, SaveSettings } from "@/lib/downloads/types";
import { cn } from "@/lib/utils";
import { AUDIO_OPTIONS, COVER_OPTIONS, DESTINO_OPTIONS, ModeIcons, optionOf, type ModeOption } from "./modes";

export const DEFAULT_SETTINGS: SaveSettings = { destino: "compu", audio: "con", portada: "video", carpeta: null };

/** "Personalizado" no se elige: aparece solo cuando alguna fila tiene lo suyo en "Qué bajar". */
const CUSTOM = "personalizado";

/** Con solo portadas, el sonido no cuenta. */
export function audioCounts(s: SaveSettings, coverMixed: boolean) {
  return coverMixed || s.portada !== "portada";
}

/** Resumen de una línea, para leer: "En tu compu · Video · Con audio", "Solo Drive: Material · Personalizado · Sin audio". */
export function describeSettings(s: SaveSettings, coverMixed = false) {
  const destino = optionOf(DESTINO_OPTIONS, s.destino).label;
  const where = s.destino === "compu" ? destino : `${destino}: ${s.carpeta?.name ?? "falta la carpeta"}`;
  const cover = coverMixed ? "Personalizado" : optionOf(COVER_OPTIONS, s.portada).label;
  const audio = audioCounts(s, coverMixed) ? ` · ${optionOf(AUDIO_OPTIONS, s.audio).label}` : "";
  return `${where} · ${cover}${audio}`;
}

type SegmentOption<T extends string> = ModeOption<T> | { value: T; label: string; icons?: undefined; hint?: string };

/**
 * Opciones de una sola elección, con íconos: el nombre aparece al pasar el mouse (o con el foco) y es lo
 * que leen los lectores de pantalla. Una opción sin íconos se muestra con su nombre.
 */
function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
  /** Un texto dice por qué no se puede (va en el tooltip); true la apaga sin explicar. */
  disabled?: (value: T) => string | boolean | undefined;
}) {
  return (
    <div className="flex gap-1 rounded-full bg-secondary p-0.5" role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const off = disabled?.(o.value);
        const hint = typeof off === "string" ? `${o.label}: ${off}` : "hint" in o && o.hint ? o.hint : o.label;
        return (
          <Hint key={o.value} label={hint}>
            <button
              type="button"
              role="radio"
              aria-checked={value === o.value}
              aria-label={o.icons ? o.label : undefined}
              aria-disabled={off ? true : undefined}
              onClick={() => !off && onChange(o.value)}
              className={cn(
                "flex h-7 min-w-0 flex-1 items-center justify-center rounded-full px-2 text-xs font-medium text-muted-foreground outline-none ring-ring transition-colors hover:text-foreground focus-visible:ring-2",
                value === o.value && "bg-card text-foreground shadow-sm",
                off && "cursor-default opacity-40 hover:text-muted-foreground",
                !o.icons && "flex-none px-3"
              )}
            >
              {o.icons ? <ModeIcons icons={o.icons} className="h-4 w-4" /> : o.label}
            </button>
          </Hint>
        );
      })}
    </div>
  );
}

/** El título de un grupo y, a la derecha, lo que está elegido (los botones son solo íconos). */
function GroupTitle({ title, current, muted }: { title: string; current: string; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <p className={cn("text-xs font-medium", muted && "text-muted-foreground")}>{title}</p>
      <p className="truncate text-[11px] text-muted-foreground">{current}</p>
    </div>
  );
}

export function SaveOptions({
  settings,
  onChange,
  onCover,
  coverMixed,
  drive,
  email,
}: {
  settings: SaveSettings;
  onChange: (next: SaveSettings) => void;
  /** Elegir qué bajar de los videos para todos: pisa lo que se haya elegido en cada fila. */
  onCover: (portada: CoverMode) => void;
  /** Alguna fila tiene otra cosa en "Qué bajar": se muestra "Personalizado". */
  coverMixed: boolean;
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
        <GroupTitle title="Qué bajar de los videos" current={coverMixed ? "Personalizado" : optionOf(COVER_OPTIONS, settings.portada).label} />
        <Segmented<CoverMode | typeof CUSTOM>
          label="Qué bajar de los videos"
          value={coverMixed ? CUSTOM : settings.portada}
          options={[
            ...COVER_OPTIONS,
            { value: CUSTOM, label: "Personalizado", hint: "Personalizado: se pone solo cuando elegís en una fila" },
          ]}
          onChange={(portada) => portada !== CUSTOM && onCover(portada)}
          disabled={(v) => v === CUSTOM && !coverMixed}
        />
        <p className="text-[11px] text-muted-foreground">
          {coverMixed
            ? `Cada link tiene lo suyo (se cambia al lado de su Descargar). Elegir acá lo cambia en todos; los links nuevos salen con «${optionOf(COVER_OPTIONS, settings.portada).label}».`
            : settings.portada === "video"
              ? "También se elige en cada link, al lado de Descargar."
              : `${settings.portada === "ambos" ? "Cada video sale junto con su portada: " : "La portada es "}la imagen que se ve antes de darle play, en su tamaño completo.${settings.portada === "portada" ? " Las fotos se bajan igual." : ""}`}
        </p>
      </div>

      <div className="space-y-1.5">
        <GroupTitle
          title="Sonido de los videos"
          current={audioCounts(settings, coverMixed) ? optionOf(AUDIO_OPTIONS, settings.audio).label : "No cuenta"}
          muted={!audioCounts(settings, coverMixed)}
        />
        <Segmented
          label="Sonido de los videos"
          value={settings.audio}
          options={AUDIO_OPTIONS}
          onChange={(audio) => onChange({ ...settings, audio })}
          disabled={() => !audioCounts(settings, coverMixed) && "solo se bajan las portadas"}
        />
        {!audioCounts(settings, coverMixed) ? (
          <p className="text-[11px] text-muted-foreground">No cuenta: solo se bajan las portadas.</p>
        ) : (
          settings.audio === "solo" && <p className="text-[11px] text-muted-foreground">Sale como .m4a. Las fotos se bajan igual.</p>
        )}
      </div>

      <div className="space-y-1.5">
        <GroupTitle title="Dónde" current={optionOf(DESTINO_OPTIONS, settings.destino).label} />
        <Segmented
          label="Dónde se guarda"
          value={settings.destino}
          options={DESTINO_OPTIONS}
          onChange={(destino) => onChange({ ...settings, destino })}
          disabled={(d) => d !== "compu" && !drive && "Drive no está configurado"}
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
