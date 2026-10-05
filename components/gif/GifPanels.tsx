"use client";

import { PanelTitle } from "@/components/shell/ContextBar";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { QUALITY_LABELS, type GifQuality, type GifSettings } from "@/lib/gif/types";
import { cn } from "@/lib/utils";

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <div className="grid gap-1 rounded-full bg-secondary p-0.5" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={cn(
            "h-7 rounded-full px-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground",
            value === v && "bg-card text-foreground shadow-sm"
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function GifSettingsPanel({ settings, onChange }: { settings: GifSettings; onChange: (s: GifSettings) => void }) {
  const set = (patch: Partial<GifSettings>) => onChange({ ...settings, ...patch });
  return (
    <div className="space-y-4">
      <PanelTitle title="Ajustes del GIF" hint="Valen para todos los grupos. Se guardan en este navegador." />

      <div className="space-y-1.5">
        <p className="text-xs font-medium">Duración por defecto de cada frame</p>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={settings.unit === "s" ? 0.05 : 20}
            step={settings.unit === "s" ? 0.1 : 50}
            value={settings.defaultDuration}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (Number.isFinite(v) && v > 0) set({ defaultDuration: v });
            }}
            className="h-8 w-24"
          />
          <div className="flex-1">
            <Segmented
              value={settings.unit}
              options={[
                ["s", "segundos"],
                ["ms", "ms"],
              ]}
              onChange={(unit) =>
                set({
                  unit,
                  // Convierte el valor para que la duración real no cambie al cambiar de unidad.
                  defaultDuration: unit === settings.unit ? settings.defaultDuration : unit === "ms" ? settings.defaultDuration * 1000 : settings.defaultDuration / 1000,
                })
              }
            />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">Se usa en los frames sin duración en el nombre.</p>
      </div>

      <label className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium">Repetir en loop</span>
        <Switch checked={settings.loop} onCheckedChange={(loop) => set({ loop })} />
      </label>

      <div className="space-y-1.5">
        <p className="text-xs font-medium">Calidad</p>
        <Segmented<GifQuality>
          value={settings.quality}
          options={(Object.keys(QUALITY_LABELS) as GifQuality[]).map((q) => [q, QUALITY_LABELS[q]])}
          onChange={(quality) => set({ quality })}
        />
        <p className="text-[11px] text-muted-foreground">Menos colores = archivo más liviano. “Equilibrada” suele alcanzar.</p>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium">Peso máximo</p>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            step={10}
            value={settings.maxKb}
            onChange={(e) => set({ maxKb: Math.max(0, Number(e.target.value) || 0) })}
            className="h-8 w-24"
          />
          <span className="text-xs text-muted-foreground">KB · 0 = sin límite</span>
        </div>
        <p className="text-[11px] text-muted-foreground">Marca en rojo los GIF que lo superan (Google Ads pide 150 KB).</p>
      </div>

      <label className="flex items-start justify-between gap-3">
        <span>
          <span className="block text-xs font-medium">Ajustar al peso máximo</span>
          <span className="block text-[11px] text-muted-foreground">
            Si un GIF se pasa, baja los colores de a poco hasta que entre.
          </span>
        </span>
        <Switch checked={settings.fit} onCheckedChange={(fit) => set({ fit })} disabled={settings.maxKb <= 0} />
      </label>
    </div>
  );
}

export function NamingGuide() {
  return (
    <div className="space-y-3 text-xs">
      <PanelTitle title="Cómo nombrar los frames" hint="Los archivos se agrupan solos por medida y se ordenan por número." />
      <code className="block rounded-xl bg-secondary px-3 py-2 font-mono text-[12px]">
        [prefijo_]ANCHOxALTO_ORDEN[-DURACIÓN].jpg
      </code>
      <ul className="space-y-1.5 text-muted-foreground">
        <li>
          <b className="font-medium text-foreground">Medida</b> · 300x250, 728x90, 160x600
        </li>
        <li>
          <b className="font-medium text-foreground">Orden</b> · 1, 2, 3… separado con _ o -
        </li>
        <li>
          <b className="font-medium text-foreground">Duración</b> · opcional: -1.5s o -800ms
        </li>
        <li>
          <b className="font-medium text-foreground">Prefijo</b> · opcional, separa campañas con la misma medida
        </li>
      </ul>
      <div className="space-y-0.5 rounded-xl border border-dashed px-3 py-2 font-mono text-[11px]">
        <p>300x250_1.jpg</p>
        <p>300x250_2-1.5s.jpg</p>
        <p>728x90-1-800ms.png</p>
        <p>verano_300x600_1.jpg</p>
      </div>
    </div>
  );
}
