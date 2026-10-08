"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Plus, X } from "lucide-react";
import { MAX_HASHTAGS, parseHashtags } from "@/lib/redaccion/text";
import { cn } from "@/lib/utils";

type Props = {
  /** El cliente que se está mirando en el panel; null: los guardados para textos sin cliente. */
  brandName: string | null;
  /** Los hashtags de siempre del cliente. */
  saved: string[];
  /** Los que ya están en el texto. */
  inText: string[];
  /** Usados en otras redacciones, del más nuevo al más viejo. */
  recent: string[];
  onInsert: (tags: string[]) => void;
  onSave: (tags: string[]) => void;
  onForget: (tag: string) => void;
  autoFocus?: boolean;
};

const keepFocus = (e: React.MouseEvent) => e.preventDefault();
const has = (list: string[], tag: string) => list.some((t) => t.toLowerCase() === tag.toLowerCase());

/**
 * Hashtags al costado del texto: los del cliente (uno o todos de un click),
 * los que ya escribiste en este texto (para guardarlos en el cliente) y los
 * recientes de tus otras redacciones.
 */
export function HashtagPanel({ brandName, saved, inText, recent, onInsert, onSave, onForget, autoFocus }: Props) {
  const [draft, setDraft] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const forWhom = brandName ?? "los textos sin cliente";
  const saveIn = brandName ? `Guardar en ${brandName}` : "Guardar para textos sin cliente";

  useEffect(() => {
    if (autoFocus) input.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  const missingFromText = saved.filter((t) => !has(inText, t));
  const unsaved = inText.filter((t) => !has(saved, t));
  const others = recent.filter((t) => !has(saved, t) && !has(inText, t)).slice(0, 40);

  const add = () => {
    const tags = parseHashtags(draft);
    if (!tags.length) return;
    onSave(tags);
    setDraft("");
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <form
        className="px-3 pb-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <label className="relative flex h-9 items-center">
          <span className="pointer-events-none absolute left-3.5 text-sm font-semibold text-muted-foreground">#</span>
          <input
            ref={input}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={brandName ? `Agregar a ${brandName}…` : "Agregar hashtags…"}
            aria-label={`Agregar hashtags a ${forWhom}`}
            className="h-9 w-full rounded-full bg-secondary/80 pl-8 pr-10 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:bg-secondary focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60 focus-visible:ring-offset-0"
          />
          <button
            type="submit"
            aria-label="Agregar"
            disabled={!parseHashtags(draft).length}
            className="absolute right-1 grid h-7 w-7 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm transition hover:brightness-95 disabled:bg-transparent disabled:text-muted-foreground disabled:shadow-none"
          >
            <Plus className="h-4 w-4" />
          </button>
        </label>
        <p className="mt-1 px-1 text-[11px] text-muted-foreground">Podés pegar varios juntos: “#suv, #autos changan”.</p>
      </form>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 pb-3">
        <Section
          title={brandName ? `De ${brandName}` : "Sin cliente"}
          count={saved.length || undefined}
          action={
            missingFromText.length > 0 && (
              <SmallButton onClick={() => onInsert(missingFromText)}>
                {missingFromText.length === saved.length ? "Insertar todos" : `Insertar ${missingFromText.length} que faltan`}
              </SmallButton>
            )
          }
        >
          {saved.length ? (
            <Chips>
              {saved.map((tag) => (
                <Chip key={tag} tag={tag} dim={has(inText, tag)} onClick={() => onInsert([tag])} side={{ label: brandName ? `Quitar de ${brandName}` : "Quitar", icon: "x", onClick: () => onForget(tag) }} />
              ))}
            </Chips>
          ) : (
            <p className="rounded-2xl border border-dashed border-foreground/15 px-3 py-3 text-xs leading-relaxed text-muted-foreground">
              Todavía no hay hashtags {brandName ? `de ${brandName}` : "para los textos sin cliente"}. Escribilos arriba o
              guardá los que ya pusiste en el texto.
              {!brandName && " Arriba podés elegir un cliente para ver o cargar los suyos."}
            </p>
          )}
        </Section>

        {unsaved.length > 0 && (
          <Section
            title="En este texto"
            count={inText.length}
            action={
              <SmallButton onClick={() => onSave(unsaved)}>
                {brandName ? `Guardar ${unsaved.length === 1 ? "" : `${unsaved.length} `}en ${brandName}` : "Guardar"}
              </SmallButton>
            }
          >
            <Chips>
              {unsaved.map((tag) => (
                <Chip key={tag} tag={tag} onClick={() => onSave([tag])} title={saveIn} lead={<Plus className="h-3 w-3" />} />
              ))}
            </Chips>
          </Section>
        )}

        {others.length > 0 && (
          <Section title="Recientes" note="de tus otros textos">
            <Chips>
              {others.map((tag) => (
                <Chip key={tag} tag={tag} onClick={() => onInsert([tag])} side={{ label: saveIn, icon: "plus", onClick: () => onSave([tag]) }} />
              ))}
            </Chips>
          </Section>
        )}

        {inText.length > MAX_HASHTAGS && (
          <p className="rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
            Hay {inText.length} hashtags: Instagram acepta hasta {MAX_HASHTAGS} por publicación.
          </p>
        )}
      </div>

      <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">
        Click: inserta en el cursor · <span className="font-medium">#</span> en el texto los sugiere
      </p>
    </div>
  );
}

function Section({
  title,
  count,
  note,
  action,
  children,
}: {
  title: string;
  count?: number;
  note?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-1.5 flex min-h-6 items-center gap-2 px-0.5">
        <h3 className="flex min-w-0 items-baseline gap-2 text-xs font-semibold">
          <span className="truncate">{title}</span>
          {count !== undefined && <span className="font-normal tabular-nums text-muted-foreground">{count}</span>}
          {note && <span className="truncate font-normal text-muted-foreground">{note}</span>}
        </h3>
        {action && <div className="ml-auto shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}

function SmallButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onMouseDown={keepFocus}
      onClick={onClick}
      className="rounded-full bg-foreground px-2.5 py-1 text-[11px] font-semibold text-background transition hover:bg-foreground/85"
    >
      {children}
    </button>
  );
}

function Chips({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-1">{children}</div>;
}

function Chip({
  tag,
  onClick,
  title,
  lead,
  dim,
  side,
}: {
  tag: string;
  onClick: () => void;
  title?: string;
  lead?: ReactNode;
  /** Ya está en el texto. */
  dim?: boolean;
  side?: { label: string; icon: "x" | "plus"; onClick: () => void };
}) {
  return (
    <span
      className={cn(
        "group/chip inline-flex max-w-full items-center rounded-full border bg-card text-[13px] shadow-[0_1px_0_hsl(40_20%_20%/0.04)]",
        dim && "border-dashed bg-transparent text-muted-foreground"
      )}
    >
      <button
        type="button"
        onMouseDown={keepFocus}
        onClick={onClick}
        title={title ?? (dim ? "Ya está en el texto: click para insertarlo otra vez" : "Insertar en el cursor")}
        className={cn("flex min-w-0 items-center gap-1 rounded-full py-1 pl-2.5 transition-colors hover:bg-secondary", side ? "pr-1.5" : "pr-2.5")}
      >
        {lead}
        <span className="truncate">#{tag}</span>
      </button>
      {side && (
        <button
          type="button"
          aria-label={side.label}
          title={side.label}
          onMouseDown={keepFocus}
          onClick={side.onClick}
          className="mr-1 grid h-5 w-5 shrink-0 place-items-center rounded-full text-muted-foreground opacity-0 transition hover:bg-secondary hover:text-foreground group-hover/chip:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
        >
          {side.icon === "x" ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
        </button>
      )}
    </span>
  );
}
