"use client";

import { Fragment, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, CornerDownRight, Eye, EyeOff, Loader2, Reply, RotateCcw, Send, Trash2, X } from "lucide-react";
import { BotonPegar, pegarEn } from "@/components/ui/pegar";
import { useEquipo } from "@/hooks/useEquipo";
import type { Comentario } from "@/lib/plani/types";
import { fold, timeAgo } from "@/lib/redaccion/text";
import { cn } from "@/lib/utils";

const iniciales = (n: string) =>
  n
    .trim()
    .split(/\s+/)
    .filter((w) => /^\p{L}/u.test(w))
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";

/** Alguien del equipo a quien se puede nombrar con @. */
export type Mencionable = { id: string; nombre: string; avatar_url: string | null };

/** Lo que se manda con un comentario además del texto. */
export type ExtraComentario = { respuesta_a: string | null; menciones: string[] };

/** La gente del equipo para nombrar con @ (solo del lado del estudio) y quién soy. */
export function useGenteParaMencionar() {
  const { data } = useEquipo();
  return useMemo(
    () => ({
      personas: (data?.personas ?? []).filter((p) => p.activo).map((p) => ({ id: p.id, nombre: p.nombre, avatar_url: p.avatar_url })),
      yo: data?.yo?.equipo_id ?? null,
    }),
    [data]
  );
}

/** Cómo se escribe alguien después de la @: su nombre, o nombre y apellido si hay otro con el mismo nombre. */
function etiquetaDe(p: Mencionable, todos: Mencionable[]) {
  const primero = p.nombre.trim().split(/\s+/)[0] ?? p.nombre;
  const repetido = todos.some((o) => o.id !== p.id && fold(o.nombre.trim().split(/\s+/)[0] ?? "") === fold(primero));
  return repetido ? p.nombre.trim() : primero;
}

/** El texto de un comentario, con las @menciones resaltadas. */
function ConMenciones({ texto, menciones, personas }: { texto: string; menciones: string[]; personas: Mencionable[] }) {
  const etiquetas = menciones
    .map((id) => personas.find((p) => p.id === id))
    .filter((p): p is Mencionable => Boolean(p))
    .flatMap((p) => [p.nombre.trim(), p.nombre.trim().split(/\s+/)[0]])
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  if (!etiquetas.length) return <>{texto}</>;
  const rx = new RegExp(`(@(?:${etiquetas.map((e) => e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")}))`, "gu");
  const partes = texto.split(rx);
  return (
    <>
      {partes.map((parte, i) =>
        i % 2 === 1 ? (
          <span key={i} className="rounded bg-primary/25 px-0.5 font-semibold">
            {parte}
          </span>
        ) : (
          <Fragment key={i}>{parte}</Fragment>
        )
      )}
    </>
  );
}

/**
 * Un hilo de comentarios (de una pieza o de la plani entera).
 *  - Estudio: ve los internos y los del cliente. Lo que escribe es interno salvo que tilde "Que lo
 *    vea el cliente"; puede resolver cualquiera, borrar los suyos, responder a un comentario y nombrar
 *    a alguien con @ (le llega a la campanita).
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
  gente,
}: {
  comentarios: Comentario[];
  modo: "estudio" | "cliente";
  /** Id de quien mira (estudio): para poder borrar los propios. */
  yo?: string | null;
  onEnviar: (texto: string, paraCliente: boolean, extra: ExtraComentario) => Promise<boolean>;
  onResolver?: (id: string, resuelto: boolean) => void;
  onBorrar?: (id: string) => void;
  vacio?: string;
  compacto?: boolean;
  className?: string;
  /** Cliente: su nombre (se pide una vez y queda en el navegador). */
  nombre?: { value: string; onChange: (v: string) => void };
  /** Estudio: a quién se puede nombrar con @ y el id de equipo de quien escribe. */
  gente?: { personas: Mencionable[]; yo: string | null };
}) {
  const [texto, setTexto] = useState("");
  const [paraCliente, setParaCliente] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [verResueltos, setVerResueltos] = useState(false);
  const [respondiendo, setRespondiendo] = useState<Comentario | null>(null);
  // Las menciones elegidas de la lista: cuenta las que siguen escritas al mandar.
  const [elegidas, setElegidas] = useState<{ id: string; etiqueta: string }[]>([]);
  const [buscando, setBuscando] = useState<{ q: string; desde: number } | null>(null);
  const [marcada, setMarcada] = useState(0);
  const campo = useRef<HTMLTextAreaElement>(null);
  const personas = gente?.personas ?? [];
  const puedeNombrar = modo === "estudio" && personas.length > 0;

  // Los hilos: cada comentario con sus respuestas abajo (las respuestas a una respuesta van al mismo hilo).
  const hilos = useMemo(() => {
    const porId = new Map(comentarios.map((c) => [c.id, c]));
    const raiz = (c: Comentario) => {
      let r = c;
      for (let i = 0; i < 20 && r.respuesta_a && porId.has(r.respuesta_a); i++) r = porId.get(r.respuesta_a)!;
      return r;
    };
    const respuestas = new Map<string, Comentario[]>();
    const raices: Comentario[] = [];
    for (const c of comentarios) {
      const r = raiz(c);
      if (r.id === c.id) raices.push(c);
      else respuestas.set(r.id, [...(respuestas.get(r.id) ?? []), c]);
    }
    return raices.map((c) => ({ c, respuestas: respuestas.get(c.id) ?? [] }));
  }, [comentarios]);

  const resueltos = hilos.filter((h) => h.c.resuelto).length;
  const lista = verResueltos ? hilos : hilos.filter((h) => !h.c.resuelto);

  const opciones = useMemo(() => {
    if (!buscando) return [];
    const q = fold(buscando.q);
    return personas
      .filter((p) => p.id !== gente?.yo)
      .filter((p) => !q || fold(p.nombre).split(/\s+/).some((w) => w.startsWith(q)) || fold(p.nombre).startsWith(q))
      .slice(0, 6);
  }, [buscando, personas, gente?.yo]);

  // Si lo que está antes del cursor es "@algo", se busca a quién nombrar.
  const mirarCursor = (el: HTMLTextAreaElement) => {
    if (!puedeNombrar) return;
    const antes = el.value.slice(0, el.selectionStart ?? el.value.length);
    const m = antes.match(/(^|\s)@([\p{L}\d._-]{0,30})$/u);
    setBuscando(m ? { q: m[2], desde: antes.length - m[2].length - 1 } : null);
    setMarcada(0);
  };

  const nombrar = (p: Mencionable) => {
    const el = campo.current;
    if (!el || !buscando) return;
    const etiqueta = etiquetaDe(p, personas);
    const fin = el.selectionStart ?? el.value.length;
    el.setSelectionRange(buscando.desde, fin);
    pegarEn(el, `@${etiqueta} `);
    setElegidas((prev) => [...prev.filter((x) => x.id !== p.id), { id: p.id, etiqueta }]);
    setBuscando(null);
  };

  const responder = (c: Comentario) => {
    setRespondiendo(c);
    // Responderle al cliente es para el cliente; a un compañero, lo nombra.
    const delCliente = c.del_cliente ?? (!c.autor_id && !c.interno);
    if (delCliente) setParaCliente(true);
    const autor = c.autor_equipo_id ? personas.find((p) => p.id === c.autor_equipo_id) : null;
    if (autor && autor.id !== gente?.yo) {
      const etiqueta = etiquetaDe(autor, personas);
      if (!texto.includes(`@${etiqueta}`)) setTexto((t) => `@${etiqueta} ${t}`);
      setElegidas((prev) => [...prev.filter((x) => x.id !== autor.id), { id: autor.id, etiqueta }]);
    }
    setTimeout(() => campo.current?.focus(), 0);
  };

  const enviar = async () => {
    if (!texto.trim() || enviando) return;
    setEnviando(true);
    const menciones = [...new Set(elegidas.filter((m) => texto.includes(`@${m.etiqueta}`)).map((m) => m.id))];
    const ok = await onEnviar(texto, paraCliente, { respuesta_a: respondiendo?.id ?? null, menciones });
    setEnviando(false);
    if (ok) {
      setTexto("");
      setElegidas([]);
      setRespondiendo(null);
    }
  };

  const uno = (c: Comentario, respuesta: boolean): ReactNode => {
    const delCliente = c.del_cliente ?? (!c.autor_id && !c.interno);
    return (
      <div key={c.id} className={cn("group flex gap-2.5", respuesta && "ml-5 border-l border-black/[0.08] pl-3")}>
        <span
          className={cn(
            "mt-0.5 grid shrink-0 place-items-center rounded-full font-bold",
            respuesta ? "h-6 w-6 text-[9px]" : "h-7 w-7 text-[10px]",
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
          <p className="mt-0.5 whitespace-pre-line break-words text-sm leading-snug">
            <ConMenciones texto={c.texto} menciones={c.menciones ?? []} personas={personas} />
          </p>
          {modo === "estudio" && (
            <div className="mt-1 flex gap-2 text-[11px] font-medium text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100">
              <button type="button" onClick={() => responder(c)} className="inline-flex items-center gap-1 hover:text-foreground">
                <Reply className="h-3 w-3" /> Responder
              </button>
              {onResolver && !respuesta && (
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
      </div>
    );
  };

  return (
    <div className={cn("flex min-h-0 flex-col gap-3", className)}>
      {lista.length > 0 ? (
        <ul className={cn("min-h-0 space-y-3 overflow-y-auto pr-1", compacto ? "max-h-64" : "max-h-[22rem]")}>
          {lista.map(({ c, respuestas }) => (
            <li key={c.id} className={cn("space-y-2", c.resuelto && "opacity-55")}>
              {uno(c, false)}
              {respuestas.map((r) => uno(r, true))}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs italic text-muted-foreground">{vacio}</p>
      )}

      {resueltos > 0 && (
        <button type="button" onClick={() => setVerResueltos((v) => !v)} className="self-start text-[11px] font-medium text-muted-foreground hover:text-foreground">
          {verResueltos ? "Ocultar resueltos" : `Ver ${resueltos} ${resueltos === 1 ? "resuelto" : "resueltos"}`}
        </button>
      )}

      <div className="relative rounded-2xl border border-black/[0.08] bg-background/60 focus-within:border-foreground/25 focus-within:bg-card">
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
        {respondiendo && (
          <div className="flex items-center gap-1.5 border-b border-black/[0.06] px-3 py-1.5 text-[11px] text-muted-foreground">
            <CornerDownRight className="h-3 w-3 shrink-0" />
            <span className="min-w-0 flex-1 truncate">
              Respondiendo a <span className="font-semibold text-foreground">{respondiendo.autor_nombre || "Cliente"}</span>: {respondiendo.texto}
            </span>
            <button type="button" aria-label="No responder" onClick={() => setRespondiendo(null)} className="grid h-5 w-5 place-items-center rounded-full hover:bg-secondary hover:text-foreground">
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
        <div className="group/texto relative">
          <textarea
            ref={campo}
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              mirarCursor(e.target);
            }}
            onClick={(e) => mirarCursor(e.currentTarget)}
            onBlur={() => setTimeout(() => setBuscando(null), 150)}
            onKeyDown={(e) => {
              if (buscando && opciones.length) {
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  setMarcada((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + opciones.length) % opciones.length);
                  return;
                }
                if (e.key === "Enter" || e.key === "Tab") {
                  e.preventDefault();
                  nombrar(opciones[marcada] ?? opciones[0]);
                  return;
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  setBuscando(null);
                  return;
                }
              }
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                enviar();
              }
            }}
            rows={2}
            maxLength={4000}
            placeholder={
              modo === "cliente"
                ? "Escribí tu comentario…"
                : respondiendo
                  ? "Tu respuesta…"
                  : paraCliente
                    ? "Respuesta para el cliente…"
                    : puedeNombrar
                      ? "Comentario interno… (con @ nombrás a alguien)"
                      : "Comentario interno…"
            }
            className="block w-full resize-none bg-transparent px-3 pr-[4.5rem] pt-2.5 text-sm outline-none placeholder:text-muted-foreground/70"
          />
          <BotonPegar
            onTexto={(t) => campo.current && pegarEn(campo.current, t)}
            className="absolute right-1.5 top-1.5 opacity-0 focus-visible:opacity-100 group-focus-within/texto:opacity-100 group-hover/texto:opacity-100"
          />
          {buscando && opciones.length > 0 && (
            <ul role="listbox" aria-label="Nombrar a" className="absolute bottom-full left-2 z-20 mb-1 w-60 overflow-hidden rounded-xl border bg-card py-1 shadow-lg">
              {opciones.map((p, i) => (
                <li key={p.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === marcada}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => nombrar(p)}
                    onMouseEnter={() => setMarcada(i)}
                    className={cn("flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm", i === marcada && "bg-secondary")}
                  >
                    {p.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.avatar_url} alt="" className="h-5 w-5 rounded-full object-cover" />
                    ) : (
                      <span className="grid h-5 w-5 place-items-center rounded-full bg-ink text-[8px] font-bold text-cream">{iniciales(p.nombre)}</span>
                    )}
                    <span className="truncate">{p.nombre}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
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
            {enviando ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />} {respondiendo ? "Responder" : "Enviar"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Cuántos quedan sin resolver (para el globito del botón): los hilos, no las respuestas. */
export const pendientes = (cs: Comentario[] | undefined) => (cs ?? []).filter((c) => !c.resuelto && !c.respuesta_a).length;
