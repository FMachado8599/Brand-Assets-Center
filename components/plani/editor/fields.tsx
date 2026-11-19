"use client";

import { useLayoutEffect, useRef, useState, type ReactNode, type TextareaHTMLAttributes } from "react";
import { Link2, Plus, X } from "lucide-react";
import { BotonPegar, pegarEn } from "@/components/ui/pegar";
import type { Link } from "@/lib/plani/types";
import { cn } from "@/lib/utils";

/** Etiqueta chica en mayúsculas sobre cada campo, como en el resto de la app. */
export function Field({ label, hint, children, action, className }: { label: string; hint?: ReactNode; children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="mb-1.5 flex items-end justify-between gap-2">
        <span className="eyebrow">{label}</span>
        {action}
      </div>
      {children}
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * Un textarea que crece con lo que se escribe (sin barra de scroll adentro), con un botón de Pegar
 * arriba a la derecha (aparece al pasar o al escribir).
 */
export function AutoText({ className, value, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  const editable = !props.disabled && !props.readOnly;
  return (
    <div className="group/texto relative">
      <textarea
        ref={ref}
        value={value}
        rows={2}
        className={cn(
          "block w-full resize-none overflow-hidden rounded-xl border border-black/[0.08] bg-background/60 px-3 py-2 text-sm leading-relaxed outline-none transition-colors placeholder:text-muted-foreground/70 hover:border-black/15 focus:border-foreground/25 focus:bg-card",
          editable && "pr-[4.5rem]",
          className
        )}
        {...props}
      />
      {editable && (
        <BotonPegar
          onTexto={(t) => ref.current && pegarEn(ref.current, t)}
          className="absolute right-1.5 top-1.5 opacity-0 focus-visible:opacity-100 group-focus-within/texto:opacity-100 group-hover/texto:opacity-100"
        />
      )}
    </div>
  );
}

export function TextInput({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-9 w-full rounded-xl border border-black/[0.08] bg-background/60 px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 hover:border-black/15 focus:border-foreground/25 focus:bg-card",
        className
      )}
      {...props}
    />
  );
}

/** Selector de pocas opciones, chico, para adentro de las tarjetas (el de la barra es negro). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = "md",
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; title?: string }[];
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div role="radiogroup" className={cn("inline-flex shrink-0 items-center gap-0.5 rounded-full bg-secondary p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex items-center gap-1.5 rounded-full font-medium text-muted-foreground transition-colors hover:text-foreground",
            size === "sm" ? "h-6 px-2.5 text-[11px]" : "h-8 px-3 text-xs",
            value === o.value && "bg-card text-foreground shadow-sm"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const hostDe = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/** "pinterest.com/pin/123" → "https://pinterest.com/pin/123". */
function normalizarUrl(raw: string) {
  const v = raw.trim();
  if (!v) return "";
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

/**
 * Una lista de links (referencias o assets): se pega un link y Enter. Sin `onChange`, solo se
 * muestran, para abrirlos.
 */
export function LinkList({
  items,
  onChange,
  placeholder = "Pegá un link y Enter",
  empty = "Sin links",
}: {
  items: Link[];
  onChange?: (next: Link[]) => void;
  placeholder?: string;
  empty?: string;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const url = normalizarUrl(draft);
    if (!url || !onChange) return;
    // Varios links pegados de una (uno por línea o separados por espacios).
    const urls = draft
      .split(/\s+/)
      .map(normalizarUrl)
      .filter((u) => u && !items.some((i) => i.url === u));
    onChange([...items, ...urls.map((u) => ({ id: crypto.randomUUID(), url: u, label: hostDe(u) }))]);
    setDraft("");
  };

  return (
    <div className="space-y-1.5">
      {items.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {items.map((l) => (
            <li key={l.id} className="group flex max-w-full items-center rounded-full border border-black/[0.08] bg-card pl-2.5 text-xs shadow-sm">
              <a href={l.url} target="_blank" rel="noopener noreferrer" className="flex min-w-0 items-center gap-1.5 py-1.5 pr-2 hover:underline" title={l.url}>
                <Link2 className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="truncate">{l.label || hostDe(l.url)}</span>
              </a>
              {onChange && (
                <button
                  type="button"
                  aria-label={`Sacar ${l.label}`}
                  onClick={() => onChange(items.filter((i) => i.id !== l.id))}
                  className="mr-1 grid h-5 w-5 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        !onChange && <p className="text-xs italic text-muted-foreground">{empty}</p>
      )}
      {onChange && (
        <div className="relative">
          <TextInput
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            onBlur={add}
            placeholder={placeholder}
            className="pr-9"
          />
          <button
            type="button"
            aria-label="Agregar link"
            onMouseDown={(e) => e.preventDefault()}
            onClick={add}
            className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
