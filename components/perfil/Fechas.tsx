"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { hoyISO, type Perfil, type PerfilPatch } from "@/lib/perfil";

type Guardar = (patch: PerfilPatch, ok?: string) => Promise<boolean>;

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS_MES = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const NADA = "__nada";

/**
 * Tu cumple (día y mes, sin el año: no dice la edad) y el día que entraste al estudio. Con eso, el
 * Inicio te saluda y le avisa al estudio para que te salude (supabase/migracion-inicio.sql).
 */
export function FechasEditor({ perfil, guardar, disabled }: { perfil: Perfil; guardar: Guardar; disabled?: boolean }) {
  const [mes, dia] = perfil.cumple ? perfil.cumple.split("-").map(Number) : [0, 0];

  const ponerCumple = (m: number, d: number) => {
    if (!m || !d) return;
    const cumple = `${String(m).padStart(2, "0")}-${String(Math.min(d, DIAS_MES[m - 1])).padStart(2, "0")}`;
    guardar({ cumple }, `Tu cumple: ${Math.min(d, DIAS_MES[m - 1])} de ${MESES[m - 1]} 🎂`);
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="eyebrow">Tu cumpleaños</p>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={dia ? String(dia) : NADA}
            onValueChange={(v) => (v === NADA ? guardar({ cumple: null }, "Sacaste tu cumple") : ponerCumple(mes || 1, Number(v)))}
            disabled={disabled}
          >
            <SelectTrigger className="h-10 w-24" aria-label="Día">
              <SelectValue placeholder="Día" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NADA}>—</SelectItem>
              {Array.from({ length: mes ? DIAS_MES[mes - 1] : 31 }, (_, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>
                  {i + 1}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">de</span>
          <Select value={mes ? String(mes) : NADA} onValueChange={(v) => (v === NADA ? guardar({ cumple: null }, "Sacaste tu cumple") : ponerCumple(Number(v), dia || 1))} disabled={disabled}>
            <SelectTrigger className="h-10 w-40" aria-label="Mes">
              <SelectValue placeholder="Mes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NADA}>—</SelectItem>
              {MESES.map((m, i) => (
                <SelectItem key={m} value={String(i + 1)}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground">Sin el año. Ese día el Inicio te festeja y el estudio te puede saludar.</p>
      </div>

      <div className="space-y-2">
        <p className="eyebrow">Entraste al estudio</p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={perfil.ingreso ?? ""}
            max={hoyISO()}
            disabled={disabled}
            onChange={(e) => guardar({ ingreso: e.target.value || null }, e.target.value ? "Guardado: cada año se festeja tu aniversario 🎉" : "Sacaste la fecha")}
            className="h-10 rounded-md border bg-card px-3 text-sm shadow-sm disabled:opacity-50"
          />
          {perfil.ingreso && (
            <button type="button" onClick={() => guardar({ ingreso: null }, "Sacaste la fecha")} className="text-[13px] text-muted-foreground underline-offset-2 hover:underline">
              Sacar
            </button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">Para los aniversarios y para darte la bienvenida si recién llegás.</p>
      </div>
    </div>
  );
}
