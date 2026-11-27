"use client";

import { hoyISO, type Perfil, type PerfilPatch } from "@/lib/perfil";
import type { Cumple } from "@/lib/cumple";
import { CumpleEditor } from "./CumpleEditor";

type Guardar = (patch: PerfilPatch, ok?: string) => Promise<boolean>;

/** El cumpleaños propio: vive en el equipo (supabase/migracion-cumpleanos.sql), no en el perfil. */
export type CumplePropio = {
  valor: Cumple | null;
  guardar: (c: Cumple | null) => Promise<unknown> | void;
};

/**
 * Tu cumple (día y mes, sin el año: no dice la edad) y el día que entraste al estudio. El cumple es
 * el del equipo, el mismo que ven el Calendario y Slack y que un admin puede cargar desde
 * Organización; el ingreso va en el perfil (supabase/migracion-inicio.sql). Con los dos, el Inicio
 * te saluda y le avisa al estudio para que te salude.
 * `cumple` es null si no estás en el equipo (no hay dónde guardarlo) y undefined mientras se carga.
 */
export function FechasEditor({
  perfil,
  guardar,
  cumple,
  disabled,
}: {
  perfil: Perfil;
  guardar: Guardar;
  cumple: CumplePropio | null | undefined;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="eyebrow">Tu cumpleaños</p>
        {cumple === undefined ? (
          <div className="skeleton h-10 w-72 rounded-md" />
        ) : cumple ? (
          <CumpleEditor valor={cumple.valor} guardar={cumple.guardar} disabled={disabled} />
        ) : (
          <p className="text-sm text-muted-foreground">Para cargarlo tenés que estar en el equipo: pedile a un admin que te sume desde Ajustes → Organización.</p>
        )}
        <p className="text-xs text-muted-foreground">
          Sin el año. Lo ve el estudio en tu perfil y en el Calendario; ese día el Inicio te festeja y Slack les avisa a tus compañeros.
        </p>
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
