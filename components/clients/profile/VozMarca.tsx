"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import type { BrandPatch } from "@/lib/repos/brands";
import { fold } from "@/lib/redaccion/text";
import type { Brand, VozMarca } from "@/lib/types";
import { Empty, Section } from "./Section";

/**
 * El kit de voz del cliente: tono, vocabulario propio, qué evitar y frases de referencia reales.
 * Sin IA, a mano. Lo lee el autocompletado de Redacción (más frases de referencia = mejores
 * sugerencias). Se guarda solo, como las notas o la paleta.
 */
export function VozMarcaSection({ brand, saveSoon, missing }: { brand: Brand; saveSoon: (patch: BrandPatch) => void; missing: boolean }) {
  const voz = brand.voz_marca ?? {};
  const set = (patch: Partial<VozMarca>) => saveSoon({ voz_marca: { ...voz, ...patch } });

  return (
    <Section
      id="voz"
      title="Voz de marca"
      hint="Cuanto más completo, mejor autocompleta Redacción: frases reales, no genéricas."
    >
      {missing ? (
        <p className="text-sm text-muted-foreground">
          Para guardar el kit de voz falta correr <code className="rounded bg-ink/10 px-1 text-[13px]">supabase/migracion-voz-marca.sql</code> en
          Supabase.
        </p>
      ) : (
        <div className="grid gap-5">
          <Tono value={voz.tono ?? ""} onChange={(tono) => set({ tono })} />
          <div className="grid gap-5 sm:grid-cols-2">
            <TagList
              label="Vocabulario propio"
              placeholder="ej: socios, no clientes"
              items={voz.vocabulario ?? []}
              onChange={(vocabulario) => set({ vocabulario })}
            />
            <TagList label="Evitar" placeholder="ej: nunca “oferta”" items={voz.evitar ?? []} onChange={(evitar) => set({ evitar })} tone="evitar" />
          </div>
          <Frases items={voz.frases ?? []} onChange={(frases) => set({ frases })} />
        </div>
      )}
    </Section>
  );
}

/** El tono en una línea, tipo "Cercano pero sin informalismos". Se guarda solo. */
function Tono({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setDraft(value);
  }, [value, focused]);

  return (
    <label className="block">
      <span className="eyebrow mb-1.5 block">Tono</span>
      <input
        value={draft}
        onFocus={() => setFocused(true)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setFocused(false);
          if (draft !== value) onChange(draft);
        }}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        placeholder="Cercano pero profesional, nunca grandilocuente…"
        maxLength={200}
        className="h-11 w-full rounded-xl border bg-card px-3.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </label>
  );
}

/** Una lista de palabras o giros cortos: Enter o "," agrega, la X de cada chip saca. */
function TagList({
  label,
  placeholder,
  items,
  onChange,
  tone,
}: {
  label: string;
  placeholder: string;
  items: string[];
  onChange: (items: string[]) => void;
  tone?: "evitar";
}) {
  const [draft, setDraft] = useState("");

  const add = (raw: string) => {
    const value = raw.trim();
    if (!value || items.some((i) => fold(i) === fold(value))) return setDraft("");
    onChange([...items, value]);
    setDraft("");
  };

  return (
    <div>
      <span className="eyebrow mb-1.5 block">{label}</span>
      <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-xl border bg-card px-2.5 py-1.5 focus-within:ring-2 focus-within:ring-ring">
        {items.map((item) => (
          <span
            key={item}
            className={
              tone === "evitar"
                ? "inline-flex h-7 items-center gap-1 rounded-full bg-destructive/10 pl-2.5 pr-1 text-xs font-medium text-destructive"
                : "inline-flex h-7 items-center gap-1 rounded-full bg-secondary pl-2.5 pr-1 text-xs font-medium"
            }
          >
            {item}
            <button
              type="button"
              onClick={() => onChange(items.filter((i) => i !== item))}
              aria-label={`Sacar ${item}`}
              className="grid h-5 w-5 place-items-center rounded-full hover:bg-black/10"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => (e.target.value.endsWith(",") ? add(e.target.value.slice(0, -1)) : setDraft(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(draft);
            }
            if (e.key === "Backspace" && !draft && items.length) onChange(items.slice(0, -1));
          }}
          onBlur={() => add(draft)}
          placeholder={items.length ? "" : placeholder}
          className="h-7 min-w-[8rem] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
    </div>
  );
}

/** Frases o copys de referencia tal cual se usaron: la base real del autocompletado. */
function Frases({ items, onChange }: { items: string[]; onChange: (items: string[]) => void }) {
  const [adding, setAdding] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);

  const addEmpty = () => {
    setAdding(true);
    onChange([...items, ""]);
  };
  useEffect(() => {
    if (adding) {
      area.current?.focus();
      setAdding(false);
    }
  }, [adding, items.length]);

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="eyebrow">Frases de referencia</span>
        <button type="button" onClick={addEmpty} className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs font-medium hover:bg-secondary">
          <Plus className="h-3.5 w-3.5" /> Agregar
        </button>
      </div>
      {items.length ? (
        <ul className="grid gap-2">
          {items.map((text, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <textarea
                ref={i === items.length - 1 ? area : undefined}
                value={text}
                onChange={(e) => onChange(items.map((t, j) => (j === i ? e.target.value : t)))}
                onBlur={() => {
                  // Una vacía al perder el foco se saca sola (se agregó para escribir y quedó en blanco).
                  if (!text.trim()) onChange(items.filter((_, j) => j !== i));
                }}
                placeholder="Copiá una frase tal cual se usó, no inventada…"
                rows={2}
                maxLength={400}
                className="min-h-[2.75rem] flex-1 resize-none rounded-xl border bg-card px-3.5 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <button
                type="button"
                onClick={() => onChange(items.filter((_, j) => j !== i))}
                aria-label="Sacar esta frase"
                className="mt-1.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        !adding && (
          <Empty>
            Todavía no hay frases.{" "}
            <button type="button" onClick={addEmpty} className="font-medium text-foreground underline underline-offset-2">
              Agregá la primera
            </button>
            .
          </Empty>
        )
      )}
    </div>
  );
}
