"use client";

import { useState } from "react";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { useAccount } from "@/components/shell/AccountProvider";
import { Switch } from "@/components/ui/switch";
import { useSuggestionBoard } from "@/hooks/useSuggestionBoard";
import { cn } from "@/lib/utils";
import { NOTE_COLORS, SuggestionBoard } from "./SuggestionBoard";

type Kind = "sugerencia" | "error";
type Status = { state: "idle" | "sending" } | { state: "sent"; at: number } | { state: "failed"; message: string };

const KINDS: { value: Kind; label: string; color: string; placeholder: string }[] = [
  {
    value: "sugerencia",
    label: "Idea",
    color: NOTE_COLORS.idea.bg,
    placeholder: "Una idea, algo que te gustaría que haga, algo que te ahorraría tiempo…",
  },
  {
    value: "error",
    label: "Error",
    color: NOTE_COLORS.error.bg,
    placeholder: "Qué pasó, en qué herramienta y qué estabas haciendo.",
  },
];

/**
 * Sugerencias y errores, al final del Inicio. Se guardan en la base y, con sesión
 * del estudio (`board`), se ven debajo como un tablero de post-its: amarillos las
 * ideas, rojos los errores. Sin sesión se pueden mandar igual (ej: "no puedo
 * entrar"), pero el tablero no se muestra.
 */
export function FeedbackSection({ board = false }: { board?: boolean }) {
  const account = useAccount();
  const user = account?.user ?? null;
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const myName = [meta.full_name, meta.name].find((v): v is string => typeof v === "string" && v.trim() !== "") ?? user?.email ?? "";
  const myAvatar = (typeof meta.avatar_url === "string" && meta.avatar_url) || (typeof meta.picture === "string" && meta.picture) || "";

  const tablero = useSuggestionBoard(board);
  const [kind, setKind] = useState<Kind>("sugerencia");
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [signed, setSigned] = useState(true);
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const [fresh, setFresh] = useState<string | null>(null);

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
        body: JSON.stringify({
          kind,
          message,
          name: user ? "" : name,
          showIdentity: !!user && signed,
          website,
          page: window.location.pathname,
        }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string; id?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? "No se pudo mandar");
      setStatus({ state: "sent", at: Date.now() });
      setMessage("");
      if (board) {
        // La nueva entra al tablero con un salto (es la más reciente: va primera).
        setFresh(body?.id ?? null);
        await tablero.reload();
      }
    } catch (error) {
      setStatus({ state: "failed", message: error instanceof Error ? error.message : "No se pudo mandar" });
    }
  };

  return (
    <section id="sugerencias" className="scroll-mt-16 overflow-hidden bg-cream text-ink">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 md:py-28">
        <div className="grid gap-6 md:grid-cols-[12rem_1fr] md:gap-10">
          <p className="site-label pt-2 text-ink/50">Sugerencias</p>
          <div>
            <p className="max-w-3xl font-display text-[clamp(1.9rem,4vw,3.25rem)] leading-[1.05] tracking-[-0.015em]">
              ¿Algo para mejorar <em className="text-ink/40">o algo que no anda?</em>
            </p>

            <form onSubmit={send} className="mt-7 max-w-2xl">
              <div className="rounded-2xl border border-ink/20 bg-white/60 transition-colors focus-within:border-ink focus-within:bg-white">
                <div className="flex items-center gap-1 px-2 pt-2">
                  <div role="radiogroup" aria-label="Tipo" className="inline-flex rounded-full bg-ink/[0.06] p-0.5">
                    {KINDS.map((k) => (
                      <button
                        key={k.value}
                        type="button"
                        role="radio"
                        aria-checked={kind === k.value}
                        onClick={() => setKind(k.value)}
                        className={cn(
                          "flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-ink/60 transition-colors hover:text-ink",
                          kind === k.value && "bg-ink text-cream hover:text-cream"
                        )}
                      >
                        <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: k.color }} />
                        {k.label}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="block">
                  <span className="sr-only">{current.label}</span>
                  <textarea
                    value={message}
                    onChange={(e) => {
                      setMessage(e.target.value);
                      if (status.state !== "idle" && status.state !== "sending") setStatus({ state: "idle" });
                    }}
                    required
                    minLength={3}
                    maxLength={5000}
                    rows={3}
                    placeholder={current.placeholder}
                    className="block w-full resize-y bg-transparent px-4 py-3 text-[15px] leading-relaxed outline-none placeholder:text-ink/40"
                  />
                </label>
              </div>

              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                {user ? (
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-full px-1 py-1">
                    <Switch checked={signed} onCheckedChange={setSigned} aria-label="Firmar con mi nombre y foto" />
                    {signed ? (
                      <span className="flex min-w-0 items-center gap-2 text-sm">
                        {myAvatar ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={myAvatar} alt="" referrerPolicy="no-referrer" className="h-6 w-6 shrink-0 rounded-full object-cover" />
                        ) : null}
                        <span className="truncate">
                          Firmada por <strong className="font-semibold">{myName}</strong>
                        </span>
                      </span>
                    ) : (
                      <span className="text-sm text-ink/60">Anónima: tu nombre no se muestra en el tablero</span>
                    )}
                  </label>
                ) : (
                  <label className="flex-1">
                    <span className="sr-only">Tu nombre (opcional)</span>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      maxLength={80}
                      autoComplete="name"
                      placeholder="Tu nombre (opcional)"
                      className="h-11 w-full rounded-full border border-ink/20 bg-white/60 px-5 text-[15px] outline-none transition-colors placeholder:text-ink/40 focus:border-ink focus:bg-white"
                    />
                  </label>
                )}
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
                  className="group inline-flex h-11 shrink-0 items-center justify-center gap-2.5 rounded-full bg-ink px-6 text-sm font-semibold text-cream transition hover:bg-ink/85 active:scale-[0.98] disabled:opacity-40"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {board ? "Pegar en el tablero" : "Enviar"}
                  {!sending && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />}
                </button>
              </div>

              <p className="mt-3 min-h-[1.25rem] text-[13px] text-ink/50" role="status" aria-live="polite">
                {status.state === "failed" ? (
                  <span className="text-destructive">{status.message}.</span>
                ) : status.state === "sent" ? (
                  <span key={status.at} className="inline-flex items-center gap-1.5 text-ink duration-300 animate-in fade-in-0">
                    <Check className="h-4 w-4" /> ¡Gracias! {board ? "Ya está en el tablero." : "Ya llegó."}
                  </span>
                ) : board ? null : user ? (
                  "Gracias por avisar."
                ) : (
                  "Sin nombre, llega como anónima. Con tu cuenta del estudio también ves lo que propone el resto."
                )}
              </p>
            </form>
          </div>
        </div>

        {board && (
          <div className="mt-14 border-t border-ink/15 pt-10 md:mt-16">
            <SuggestionBoard
              items={tablero.items}
              loading={tablero.loading}
              failed={tablero.failed}
              fresh={fresh}
              onVote={tablero.vote}
              onStatus={tablero.setStatus}
              onRemove={tablero.remove}
            />
          </div>
        )}
      </div>
    </section>
  );
}
