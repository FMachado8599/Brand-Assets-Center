"use client";

import { useState } from "react";
import { Check, Eye, EyeOff, Loader2, RotateCcw, Send, Trash2 } from "lucide-react";
import type { Comentario } from "@/lib/plani/types";
import { timeAgo } from "@/lib/redaccion/text";
import { cn } from "@/lib/utils";

const iniciales = (n: string) =>
  n
    .trim()
    .split(/\s+/)
    .filter((w) => /^\p{L}/u.test(w))
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";

/**
 * Un hilo de comentarios (de una pieza o de la plani entera).
 *  - Estudio: ve los internos y los del cliente. Lo que escribe es interno salvo que tilde "Que lo
 *    vea el cliente"; puede resolver cualquiera y borrar los suyos.
 *  - Cliente: ve lo suyo y lo que el estudio le respondió, y comenta con su nombre.
 */
export function HiloComentarios({
  comentarios,
  modo,
  yo,
  onEnviar,
  onResolver,
  onBorrar,
  vacio = "Sin comentarios todavía.",
  compacto,
  className,
  nombre,
}: {
  comentarios: Comentario[];
  modo: "estudio" | "cliente";
  /** Id de quien mira (estudio): para poder borrar los propios. */
  yo?: string | null;
  onEnviar: (texto: string, paraCliente: boolean) => Promise<boolean>;
  onResolver?: (id: string, resuelto: boolean) => void;
  onBorrar?: (id: string) => void;
  vacio?: string;
  compacto?: boolean;
  className?: string;
  /** Cliente: su nombre (se pide una vez y queda en el navegador). */
  nombre?: { value: string; onChange: (v: string) => void };
}) {
  const [texto, setTexto] = useState("");
  const [paraCliente, setParaCliente] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [verResueltos, setVerResueltos] = useState(false);

  const resueltos = comentarios.filter((c) => c.resuelto).length;
  const lista = verResueltos ? comentarios : comentarios.filter((c) => !c.resuelto);

  const enviar = async () => {
    if (!texto.trim() || enviando) return;
    setEnviando(true);
    const ok = await onEnviar(texto, paraCliente);
    setEnviando(false);
    if (ok) setTexto("");
  };

  return (
    <div className={cn("flex min-h-0 flex-col gap-3", className)}>
      {lista.length > 0 ? (
        <ul className={cn("min-h-0 space-y-2.5 overflow-y-auto pr-1", compacto ? "max-h-64" : "max-h-[22rem]")}>
          {lista.map((c) => {
            const delCliente = c.del_cliente ?? (!c.autor_id && !c.interno);
            return (
              <li key={c.id} className={cn("group flex gap-2.5", c.resuelto && "opacity-55")}>
                <span
                  className={cn(
                    "mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-bold",
                    delCliente ? "bg-primary text-primary-foreground" : "bg-ink text-cream"
                  )}
                >
                  {iniciales(c.autor_nombre)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
                    <span className="font-semibold">{c.autor_nombre || (delCliente ? "Cliente" : "Estudio")}</span>
                    {modo === "estudio" && delCliente && <span className="rounded-full bg-primary/30 px-1.5 text-[10px] font-semibold">Cliente</span>}
                    {modo === "estudio" && !delCliente && !c.interno && (
                      <span className="rounded-full bg-secondary px-1.5 text-[10px] font-medium text-muted-foreground">Lo ve el cliente</span>
                    )}
                    <span className="text-muted-foreground">{timeAgo(c.created_at, Date.now())}</span>
                  </div>
                  <p className="mt-0.5 whitespace-pre-line break-words text-sm leading-snug">{c.texto}</p>
                  {modo === "estudio" && (
                    <div className="mt-1 flex gap-2 text-[11px] font-medium text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100">
                      {onResolver && (
                        <button type="button" onClick={() => onResolver(c.id, !c.resuelto)} className="inline-flex items-center gap-1 hover:text-foreground">
                          {c.resuelto ? <RotateCcw className="h-3 w-3" /> : <Check className="h-3 w-3" />}
                          {c.resuelto ? "Reabrir" : "Resolver"}
                        </button>
                      )}
                      {onBorrar && yo && c.autor_id === yo && (
                        <button type="button" onClick={() => onBorrar(c.id)} className="inline-flex items-center gap-1 hover:text-destructive">
                          <Trash2 className="h-3 w-3" /> Borrar
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs italic text-muted-foreground">{vacio}</p>
      )}

      {resueltos > 0 && (
        <button type="button" onClick={() => setVerResueltos((v) => !v)} className="self-start text-[11px] font-medium text-muted-foreground hover:text-foreground">
          {verResueltos ? "Ocultar resueltos" : `Ver ${resueltos} ${resueltos === 1 ? "resuelto" : "resueltos"}`}
        </button>
      )}

      <div className="rounded-2xl border border-black/[0.08] bg-background/60 focus-within:border-foreground/25 focus-within:bg-card">
        {nombre && (
          <input
            value={nombre.value}
            onChange={(e) => nombre.onChange(e.target.value)}
            maxLength={80}
            placeholder="Tu nombre"
            aria-label="Tu nombre"
            className="block w-full border-b border-black/[0.06] bg-transparent px-3 py-2 text-sm font-medium outline-none placeholder:font-normal placeholder:text-muted-foreground/70"
          />
        )}
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              enviar();
            }
          }}
          rows={2}
          maxLength={4000}
          placeholder={modo === "cliente" ? "Escribí tu comentario…" : paraCliente ? "Respuesta para el cliente…" : "Comentario interno…"}
          className="block w-full resize-none bg-transparent px-3 pt-2.5 text-sm outline-none placeholder:text-muted-foreground/70"
        />
        <div className="flex items-center gap-2 px-2 pb-2">
          {modo === "estudio" && (
            <button
              type="button"
              aria-pressed={paraCliente}
              onClick={() => setParaCliente((v) => !v)}
              title={paraCliente ? "El cliente lo va a ver en su link" : "Solo lo ve el estudio"}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium transition-colors",
                paraCliente ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              {paraCliente ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              {paraCliente ? "Lo ve el cliente" : "Interno"}
            </button>
          )}
          <button
            type="button"
            onClick={enviar}
            disabled={!texto.trim() || enviando || (!!nombre && !nombre.value.trim())}
            className="ml-auto inline-flex h-7 items-center gap-1.5 rounded-full bg-foreground px-3 text-[11px] font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-35"
          >
            {enviando ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />} Enviar
          </button>
        </div>
      </div>
    </div>
  );
}

/** Cuántos quedan sin resolver (para el globito del botón). */
export const pendientes = (cs: Comentario[] | undefined) => (cs ?? []).filter((c) => !c.resuelto).length;
