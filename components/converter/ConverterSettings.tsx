"use client";

import { CheckCircle2, AlertCircle } from "lucide-react";
import { PanelTitle } from "@/components/shell/ContextBar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PREFERENCE_FAMILIES } from "@/lib/converter/catalog";
import type { QueueSettings } from "@/hooks/useConverterQueue";
import { cn } from "@/lib/utils";

const AUTO = "auto";

export function ConverterSettings({
  settings,
  onChange,
  configured,
}: {
  settings: QueueSettings;
  onChange: (next: QueueSettings) => void;
  configured: boolean;
}) {
  return (
    <div className="space-y-4">
      <PanelTitle title="Configuración" hint="Se guarda en este navegador." />

      <div
        className={cn(
          "flex items-center gap-2 rounded-xl px-3 py-2 text-xs",
          configured ? "bg-emerald-50 text-emerald-800" : "bg-destructive/10 text-destructive"
        )}
      >
        {configured ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
        {configured ? "FreeConvert conectado" : "Falta FREECONVERT_API_KEY en el servidor"}
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium">Archivos en paralelo</p>
        <div className="grid grid-cols-3 gap-1 rounded-full bg-secondary p-0.5">
          {[1, 2, 3].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onChange({ ...settings, concurrency: n })}
              className={cn(
                "h-7 rounded-full text-xs font-medium text-muted-foreground transition-colors hover:text-foreground",
                settings.concurrency === n && "bg-card text-foreground shadow-sm"
              )}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium">Formato preferido al convertir</p>
        {PREFERENCE_FAMILIES.map((f) => (
          <div key={f.family} className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">{f.label}</span>
            <Select
              value={settings.preferred[f.family] ?? AUTO}
              onValueChange={(v) =>
                onChange({ ...settings, preferred: { ...settings.preferred, [f.family]: v === AUTO ? undefined : v } })
              }
            >
              <SelectTrigger className="h-8 w-32 font-mono text-xs uppercase">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={AUTO} className="font-ui normal-case">
                  Automático
                </SelectItem>
                {f.formats.map((fmt) => (
                  <SelectItem key={fmt} value={fmt} className="font-mono uppercase">
                    {fmt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
    </div>
  );
}
