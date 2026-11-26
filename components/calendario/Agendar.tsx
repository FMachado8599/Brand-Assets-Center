"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarPlus, Loader2, Video, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toaster";
import type { Persona } from "@/lib/board/equipo";
import { nombreDe } from "@/lib/perfil";
import { supabase } from "@/lib/supabase";
import { fold } from "@/lib/redaccion/text";
import type { Brand } from "@/lib/types";
import { cn } from "@/lib/utils";

const DURACIONES = [15, 30, 45, 60, 90, 120, 180];
const NINGUNA = "__ninguna";
const MAIL = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[a-z]{2,}$/i;

const textoDuracion = (m: number) => (m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`);

/**
 * Agendar una reunión en el Google Calendar del estudio: título, día y hora, invitados (gente del
 * estudio o cualquier mail) y, si se quiere, link de Meet. La invitación les llega por mail.
 */
export function Agendar({
  open,
  onClose,
  dia,
  personas,
  marcas,
  onCreada,
}: {
  open: boolean;
  onClose: () => void;
  dia: string;
  personas: Persona[];
  marcas: Brand[];
  onCreada: () => void;
}) {
  const [titulo, setTitulo] = useState("");
  const [fecha, setFecha] = useState(dia);
  const [todoElDia, setTodoElDia] = useState(false);
  const [hora, setHora] = useState("10:00");
  const [duracion, setDuracion] = useState(60);
  const [meet, setMeet] = useState(true);
  const [marca, setMarca] = useState<string>(NINGUNA);
  const [descripcion, setDescripcion] = useState("");
  const [invitados, setInvitados] = useState<string[]>([]);
  const [buscar, setBuscar] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (open) setFecha(dia);
  }, [open, dia]);

  const conMail = useMemo(() => personas.filter((p) => p.activo && p.email), [personas]);
  const porMail = useMemo(() => new Map(conMail.map((p) => [p.email!, p])), [conMail]);
  const sugerencias = useMemo(() => {
    const q = fold(buscar).trim();
    if (!q) return [];
    return conMail
      .filter((p) => !invitados.includes(p.email!) && (fold(nombreDe(p.perfil, p.nombre)).includes(q) || fold(p.email!).includes(q)))
      .slice(0, 6);
  }, [buscar, conMail, invitados]);

  const sumar = (mail: string) => {
    const m = mail.trim().toLowerCase();
    if (!m || invitados.includes(m)) return;
    setInvitados((xs) => [...xs, m]);
    setBuscar("");
  };

  /** El equipo de la marca elegida, de un toque (designados, hub y directores). */
  const invitarEquipo = async () => {
    const { data, error } = await supabase.rpc("marca_gente", { p_brand: marca });
    if (error) return toast(`No se pudo traer el equipo: ${error.message}`, "error");
    const mails = ((data ?? []) as { email: string | null }[]).map((p) => p.email).filter((m): m is string => Boolean(m));
    setInvitados((xs) => [...new Set([...xs, ...mails])]);
    toast(mails.length ? `${mails.length} del equipo invitados` : "La marca todavía no tiene equipo cargado");
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      const r = await fetch("/api/calendario/eventos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo,
          fecha,
          hora: todoElDia ? null : hora,
          duracion,
          meet: !todoElDia && meet,
          descripcion: descripcion.trim() || null,
          invitados,
          brandId: marca === NINGUNA ? null : marca,
        }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error ?? `Error ${r.status}`);
      toast(invitados.length ? `Agendada: les llegó la invitación a ${invitados.length} ${invitados.length === 1 ? "persona" : "personas"}` : "Agendada en el calendario del estudio");
      setTitulo("");
      setDescripcion("");
      setInvitados([]);
      setMarca(NINGUNA);
      onCreada();
      onClose();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setGuardando(false);
    }
  };

  const etiqueta = "mb-1 block text-xs font-medium text-muted-foreground";
  const campo = "h-10 w-full rounded-md border bg-card px-3 text-sm outline-none focus:border-foreground/40";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-lg gap-4 overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="h-5 w-5" /> Agendar
          </DialogTitle>
          <DialogDescription>Queda en el Google Calendar del estudio y a los invitados les llega la invitación por mail.</DialogDescription>
        </DialogHeader>

        <div>
          <label className={etiqueta} htmlFor="agendar-titulo">
            Título
          </label>
          <input id="agendar-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={200} placeholder="Ej: Presentación plani de diciembre" className={campo} autoFocus />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 sm:col-span-1">
            <label className={etiqueta} htmlFor="agendar-dia">
              Día
            </label>
            <input id="agendar-dia" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={campo} />
          </div>
          <label className="col-span-2 flex items-center gap-2 self-end pb-2 text-sm sm:col-span-1">
            <Switch checked={todoElDia} onCheckedChange={setTodoElDia} aria-label="Todo el día" /> Todo el día
          </label>
          {!todoElDia && (
            <>
              <div>
                <label className={etiqueta} htmlFor="agendar-hora">
                  Hora
                </label>
                <input id="agendar-hora" type="time" value={hora} onChange={(e) => setHora(e.target.value)} step={300} className={campo} />
              </div>
              <div>
                <span className={etiqueta}>Duración</span>
                <Select value={String(duracion)} onValueChange={(v) => setDuracion(Number(v))}>
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DURACIONES.map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        {textoDuracion(d)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </div>

        {!todoElDia && (
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={meet} onCheckedChange={setMeet} aria-label="Con link de Google Meet" />
            <Video className="h-4 w-4 text-muted-foreground" /> Con link de Google Meet
          </label>
        )}

        <div>
          <span className={etiqueta}>Invitados</span>
          {invitados.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {invitados.map((m) => {
                const p = porMail.get(m);
                return (
                  <span key={m} className="inline-flex items-center gap-1 rounded-full bg-secondary py-1 pl-2.5 pr-1 text-xs" title={m}>
                    {p ? nombreDe(p.perfil, p.nombre) : m}
                    <button type="button" onClick={() => setInvitados((xs) => xs.filter((x) => x !== m))} aria-label={`Sacar a ${m}`} className="rounded-full p-0.5 hover:bg-foreground/10">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                );
              })}
            </div>
          )}
          <div className="relative">
            <input
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === ",") && buscar.trim()) {
                  e.preventDefault();
                  if (sugerencias[0]) sumar(sugerencias[0].email!);
                  else if (MAIL.test(buscar.trim())) sumar(buscar);
                  else toast("Eso no parece un mail", "error");
                }
              }}
              placeholder="Alguien del estudio o un mail (cliente@marca.com)"
              className={campo}
            />
            {sugerencias.length > 0 && (
              <ul className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-xl border bg-popover shadow-lg">
                {sugerencias.map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => sumar(p.email!)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-secondary">
                      <span className="truncate">{nombreDe(p.perfil, p.nombre)}</span>
                      <span className="truncate text-xs text-muted-foreground">{p.email}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <span className={etiqueta}>Marca (opcional)</span>
            <Select value={marca} onValueChange={setMarca}>
              <SelectTrigger className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NINGUNA}>Ninguna</SelectItem>
                {marcas.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {marca !== NINGUNA && (
            <button
              type="button"
              onClick={invitarEquipo}
              className="h-10 self-end rounded-full border bg-card px-3.5 text-[13px] font-medium shadow-sm transition-colors hover:border-foreground/30"
            >
              Invitar al equipo de la marca
            </button>
          )}
        </div>

        <div>
          <label className={etiqueta} htmlFor="agendar-notas">
            Descripción (opcional)
          </label>
          <textarea
            id="agendar-notas"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            rows={3}
            maxLength={4000}
            className="w-full resize-none rounded-md border bg-card px-3 py-2 text-sm outline-none focus:border-foreground/40"
          />
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={guardar}
            disabled={!titulo.trim() || !fecha || guardando}
            className={cn(
              "inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm hover:brightness-95 disabled:opacity-50"
            )}
          >
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />} Agendar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
