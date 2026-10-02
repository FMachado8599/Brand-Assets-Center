"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  effectiveValue,
  getOptionSchema,
  isVisible,
  type Operation,
  type OptionSchema,
  type OptionValues,
} from "@/lib/converter/catalog";

const DEFAULT = "__default__";

/**
 * Opciones avanzadas. El formulario se arma solo a partir del esquema que publica
 * FreeConvert para cada par de formatos, así que cubre todos los casos sin
 * mantener una lista propia. Las etiquetas vienen de la API (en inglés).
 */
export function OptionsDialog({
  open,
  onOpenChange,
  operation,
  input,
  output,
  values,
  sameKindCount,
  onApply,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  operation: Operation;
  input: string;
  output: string;
  values: OptionValues;
  /** Otros archivos con el mismo par de formatos, para ofrecer "aplicar a todos". */
  sameKindCount: number;
  onApply: (values: OptionValues, toAll: boolean) => void;
}) {
  const [schema, setSchema] = useState<OptionSchema[] | null>(null);
  const [error, setError] = useState(false);
  const [draft, setDraft] = useState<OptionValues>(values);

  useEffect(() => {
    if (!open) return;
    setDraft(values);
    setSchema(null);
    setError(false);
    getOptionSchema(operation, input, output).then(setSchema, () => setError(true));
  }, [open, operation, input, output, values]);

  const set = (name: string, v: string | number | boolean | undefined) =>
    setDraft((d) => {
      const next = { ...d };
      if (v === undefined) delete next[name];
      else next[name] = v;
      return next;
    });

  const visible = schema?.filter((o) => isVisible(o, schema, draft)) ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Opciones avanzadas</DialogTitle>
          <DialogDescription className="font-mono text-xs uppercase">
            {input} → {output}
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-1 max-h-[60vh] space-y-4 overflow-y-auto px-1 py-1">
          {error ? (
            <p className="text-sm text-destructive">No se pudieron cargar las opciones.</p>
          ) : !schema ? (
            <p className="text-sm text-muted-foreground">Cargando opciones…</p>
          ) : visible.length === 0 ? (
            <p className="text-sm text-muted-foreground">Este formato no tiene opciones para ajustar.</p>
          ) : (
            visible.map((o) => <Field key={o.name} option={o} value={draft[o.name]} effective={effectiveValue(o, draft)} onChange={(v) => set(o.name, v)} />)
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
          <Button variant="ghost" className="mr-auto" onClick={() => setDraft({})}>
            Restablecer
          </Button>
          {sameKindCount > 0 && (
            <Button variant="outline" onClick={() => onApply(draft, true)}>
              Aplicar a los {sameKindCount + 1} {input.toUpperCase()}
            </Button>
          )}
          <Button onClick={() => onApply(draft, false)}>Aplicar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  option: o,
  value,
  effective,
  onChange,
}: {
  option: OptionSchema;
  value: OptionValues[string] | undefined;
  effective: unknown;
  onChange: (v: string | number | boolean | undefined) => void;
}) {
  const id = `opt-${o.name}`;
  // Las pistas que solo le hablan al integrador de la API no le sirven al usuario.
  const hint = o.hint
    ?.split(/(?<=\.)\s+/)
    .filter((s) => !/not used in operations|has no effect|sub-options/i.test(s))
    .join(" ")
    .trim();

  if (o.data_type === "boolean") {
    return (
      <label htmlFor={id} className="flex cursor-pointer items-start gap-3">
        <input
          id={id}
          type="checkbox"
          className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]"
          checked={String(effective) === "true"}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="space-y-1">
          <span className="block text-sm font-medium leading-none">{o.label}</span>
          {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
        </span>
      </label>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{o.label}</Label>
      {o.type === "enum" ? (
        <Select
          value={value !== undefined ? String(value) : o.default_value ?? DEFAULT}
          onValueChange={(v) => onChange(v === DEFAULT ? undefined : v)}
        >
          <SelectTrigger id={id}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {o.default_value === undefined && <SelectItem value={DEFAULT}>Automático</SelectItem>}
            {o.enum_values?.map((e) => (
              <SelectItem key={String(e.value)} value={String(e.value)}>
                {e.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <div className="flex items-center gap-2">
          <Input
            id={id}
            type={o.data_type === "string" ? (/^#[0-9a-f]{6}$/i.test(o.default_value ?? "") ? "color" : "text") : "number"}
            className={o.data_type === "string" && /^#/.test(o.default_value ?? "") ? "h-10 w-20 p-1" : undefined}
            min={o.properties?.min}
            max={o.properties?.max}
            placeholder={o.default_value}
            value={value !== undefined ? String(value) : o.default_value ?? ""}
            onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
          />
          {o.units && <span className="text-sm text-muted-foreground">{o.units}</span>}
        </div>
      )}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
