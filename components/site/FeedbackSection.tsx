"use client";

import { useState } from "react";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Kind = "sugerencia" | "error";
type Status = { state: "idle" | "sending" | "sent" } | { state: "failed"; message: string };

const KINDS: { value: Kind; label: string; placeholder: string }[] = [
  { value: "sugerencia", label: "Sugerencia", placeholder: "Una idea, algo que te gustaría que haga, algo que te molesta…" },
  { value: "error", label: "Error", placeholder: "Qué pasó, en qué herramienta y qué estabas haciendo." },
];

/**
 * Sugerencias y errores, desde el Inicio. Llegan por mail (ver
 * app/api/sugerencias). El nombre es opcional: sin nombre llega como anónimo.
 */
export function FeedbackSection() {
  const [kind, setKind] = useState<Kind>("sugerencia");
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<Status>({ state: "idle" });

  const sending = status.state === "sending";
  const current = KINDS.find((k) => k.value === kind)!;

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim().length < 3 || sending) return;
    setStatus({ state: "sending" });
    try {
      const res = await fetch("/api/sugerencias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, message, name, website, page: window.location.pathname }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? "No se pudo mandar");
      setStatus({ state: "sent" });
      setMessage("");
    } catch (error) {
      setStatus({ state: "failed", message: error instanceof Error ? error.message : "No se pudo mandar" });
    }
  };

  return (
    <section id="sugerencias" className="scroll-mt-16 bg-cream text-ink">
      <div className="mx-auto grid max-w-6xl gap-6 px-5 py-24 sm:px-8 md:grid-cols-[12rem_1fr] md:gap-10 md:py-32">
        <p className="site-label pt-3 text-ink/50">Sugerencias</p>
        <div>
          <p className="max-w-3xl font-display text-[clamp(2rem,4.8vw,4rem)] leading-[1.04] tracking-[-0.015em]">
            ¿Algo para mejorar <em className="text-ink/40">o algo que no anda?</em>
          </p>

          {status.state === "sent" ? (
            <div className="mt-10 flex max-w-2xl flex-col items-start gap-5 border-t border-ink/20 pt-8 duration-500 animate-in fade-in-0">
              <p className="flex items-center gap-3 text-lg">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground">
                  <Check className="h-4 w-4" />
                </span>
                ¡Gracias! Ya llegó.
              </p>
              <button
                type="button"
                onClick={() => setStatus({ state: "idle" })}
                className="site-label text-ink/55 underline-offset-4 transition-colors hover:text-ink hover:underline"
              >
                Mandar otra
              </button>
            </div>
          ) : (
            <form onSubmit={send} className="mt-10 max-w-2xl border-t border-ink/20 pt-8">
              <div role="radiogroup" aria-label="Tipo" className="inline-flex rounded-full border border-ink/20 p-1">
                {KINDS.map((k) => (
                  <button
                    key={k.value}
                    type="button"
                    role="radio"
                    aria-checked={kind === k.value}
                    onClick={() => setKind(k.value)}
                    className={cn(
                      "h-9 rounded-full px-4 text-sm font-medium text-ink/60 transition-colors hover:text-ink",
                      kind === k.value && "bg-ink text-cream hover:text-cream"
                    )}
                  >
                    {k.label}
                  </button>
                ))}
              </div>

              <label className="mt-6 block">
                <span className="sr-only">{current.label}</span>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  required
                  minLength={3}
                  maxLength={5000}
                  rows={5}
                  placeholder={current.placeholder}
                  className="w-full resize-y rounded-2xl border border-ink/20 bg-white/60 px-4 py-3 text-[15px] leading-relaxed outline-none transition-colors placeholder:text-ink/40 focus:border-ink focus:bg-white"
                />
              </label>

              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                <label className="flex-1">
                  <span className="sr-only">Tu nombre (opcional)</span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={80}
                    autoComplete="name"
                    placeholder="Tu nombre (opcional)"
                    className="h-12 w-full rounded-full border border-ink/20 bg-white/60 px-5 text-[15px] outline-none transition-colors placeholder:text-ink/40 focus:border-ink focus:bg-white"
                  />
                </label>
                {/* Trampa para bots: no se ve ni se puede enfocar. */}
                <input
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden
                  className="absolute -left-[9999px] h-0 w-0 opacity-0"
                />
                <button
                  type="submit"
                  disabled={sending || message.trim().length < 3}
                  className="group inline-flex h-12 items-center justify-center gap-2.5 rounded-full bg-ink px-6 text-sm font-semibold text-cream transition hover:bg-ink/85 active:scale-[0.98] disabled:opacity-40"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Enviar
                  {!sending && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />}
                </button>
              </div>

              <p className="mt-4 text-[13px] text-ink/50" role="status" aria-live="polite">
                {status.state === "failed" ? (
                  <span className="text-destructive">{status.message}.</span>
                ) : (
                  "Sin nombre, llega como anónimo."
                )}
              </p>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
