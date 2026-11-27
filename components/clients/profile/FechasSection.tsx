"use client";

import { useEffect, useState } from "react";
import { DatabaseZap, Loader2, Plus, Trash2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { diasHasta, hoyISO } from "@/lib/inicio/fechas";
import { borrarFecha, crearFecha, faltaMigracionInicio, fechasDeMarcas, proximaVez, tipoFecha, TIPOS_FECHA, type FechaMarca, type TipoFecha } from "@/lib/inicio/repo";
import { fechaCorta } from "@/lib/perfil";
import type { Brand } from "@/lib/types";
import { Section } from "./Section";

/**
 * Las fechas de la marca: lanzamientos, campañas, eventos, aniversarios. Las ve el estudio en el
 * Inicio (en la tarjeta de la marca y en el calendario) de quienes la trabajan. Las anuales se repiten.
 */
export function FechasSection({ brand }: { brand: Brand }) {
  const [fechas, setFechas] = useState<FechaMarca[] | null>(null);
  const [falta, setFalta] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [fecha, setFecha] = useState("");
  const [tipo, setTipo] = useState<TipoFecha>("lanzamiento");
  const [guardando, setGuardando] = useState(false);
  const hoy = hoyISO();

  const leer = () => fechasDeMarcas([brand.id]).then(setFechas);
  useEffect(() => {
    leer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand.id]);

  const sumar = async () => {
    if (!titulo.trim() || !fecha) return;
    setGuardando(true);
    try {
      await crearFecha({ brand_id: brand.id, fecha, titulo: titulo.trim().slice(0, 120), tipo, anual: tipo === "aniversario" });
      setTitulo("");
      setFecha("");
      toast("Fecha guardada: el estudio la ve en el Inicio");
      leer();
    } catch (e) {
      const m = (e as Error).message;
      if (faltaMigracionInicio(m)) setFalta(true);
      else toast(m, "error");
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async (f: FechaMarca) => {
    try {
      await borrarFecha(f.id);
      setFechas((prev) => (prev ?? []).filter((x) => x.id !== f.id));
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const ordenadas = (fechas ?? [])
    .map((f) => ({ ...f, cuando: proximaVez(f, hoy) }))
    .sort((a, b) => (a.cuando ?? `9${a.fecha}`).localeCompare(b.cuando ?? `9${b.fecha}`));

  return (
    <Section id="fechas" title="Fechas" hint="Lanzamientos, campañas y aniversarios. Aparecen en el Inicio de quienes trabajan la marca.">
      {falta && (
        <div className="mb-4 flex items-start gap-3 rounded-2xl bg-primary/25 px-4 py-3 text-sm">
          <DatabaseZap className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Para guardar fechas falta un paso en la base: correr <code className="rounded bg-foreground/10 px-1 text-[13px]">supabase/migracion-inicio.sql</code> en Supabase → SQL Editor.
          </p>
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          sumar();
        }}
        className="flex flex-wrap items-center gap-2"
      >
        <Select value={tipo} onValueChange={(v) => setTipo(v as TipoFecha)}>
          <SelectTrigger className="h-10 w-40" aria-label="Tipo">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIPOS_FECHA.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.emoji} {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <input
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder={tipo === "aniversario" ? "Ej: Aniversario de la marca" : "Ej: Lanzamiento del modelo nuevo"}
          className="h-10 min-w-[12rem] flex-1 rounded-md border bg-card px-3 text-sm shadow-sm"
        />
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="h-10 rounded-md border bg-card px-3 text-sm shadow-sm" aria-label="Fecha" />
        <button
          type="submit"
          disabled={guardando || !titulo.trim() || !fecha}
          className="inline-flex h-10 items-center gap-1.5 rounded-full bg-ink px-4 text-sm font-semibold text-cream disabled:opacity-40 dark:bg-cream dark:text-ink"
        >
          {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Sumar
        </button>
      </form>
      {tipo === "aniversario" && <p className="mt-2 text-xs text-muted-foreground">Los aniversarios se repiten todos los años.</p>}

      {fechas === null ? (
        <div className="skeleton mt-4 h-12 rounded-xl" />
      ) : !ordenadas.length ? (
        <p className="mt-4 text-sm text-muted-foreground">Todavía no hay fechas cargadas.</p>
      ) : (
        <ul className="mt-4 divide-y divide-foreground/[0.07]">
          {ordenadas.map((f) => {
            const t = tipoFecha(f.tipo);
            const n = f.cuando ? diasHasta(f.cuando) : null;
            return (
              <li key={f.id} className="flex items-center gap-3 py-2.5">
                <span aria-hidden className="w-6 text-center text-lg">
                  {t.emoji}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{f.titulo}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t.label} · {fechaCorta(f.cuando ?? f.fecha)}
                    {f.anual ? " · todos los años" : ""}
                    {n === null ? " · ya pasó" : n === 0 ? " · hoy" : n === 1 ? " · mañana" : ` · en ${n} días`}
                  </span>
                </span>
                <button type="button" onClick={() => borrar(f)} aria-label={`Borrar ${f.titulo}`} className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-foreground/5 hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
