"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Copy, Mail, PenLine, Settings2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import { Hint } from "@/components/ui/tooltip";
import { hace } from "@/components/tareas/comun";
import { PersonaDialog } from "@/components/tareas/equipo/PersonaDialog";
import { useClients } from "@/hooks/useClients";
import { useEquipo } from "@/hooks/useEquipo";
import type { EquipoData, Persona } from "@/lib/board/equipo";
import { copyPlain } from "@/lib/cards/clipboard";
import { cuandoCumple, cumpleDe, cumpleHoy, textoCumple } from "@/lib/cumple";
import { conAlfa, fueraDeOficina, hoyISO, nombreDe } from "@/lib/perfil";
import type { Brand } from "@/lib/types";
import { abrirPerfil, cerrarPerfil, usePerfilAbierto } from "./abrir";
import { EnElEstudio } from "./EnElEstudio";
import { EstadoLinea, FotoPerfil, Portada, PuestoPills, RedesLinks } from "./piezas";
import { enComun, relacionesDe } from "./relaciones";

/**
 * El perfil de un compañero, al tocarlo en el Board, en el organigrama o en /perfil. Uno por página:
 * se abre con abrirPerfil(id). Los admins tienen, además, "Editar" (la ficha del organigrama).
 */
export function PerfilHost() {
  const abierto = usePerfilAbierto();
  const { data, admin, loaded, error } = useEquipo();
  const { clients } = useClients();
  const [editando, setEditando] = useState<string | null>(null);
  const persona = abierto && data ? (data.personas.find((p) => p.id === abierto) ?? null) : null;
  const aEditar = editando && data ? (data.personas.find((p) => p.id === editando) ?? null) : null;

  // Al irse de la página, el perfil no queda abierto para la próxima.
  useEffect(() => cerrarPerfil, []);

  return (
    <>
      <Dialog open={Boolean(abierto)} onOpenChange={(open) => !open && cerrarPerfil()}>
        {abierto && (
          <DialogContent
            className="max-w-md gap-0 p-0"
            // El foco va al diálogo, no al primer botón: si no, al abrir salta su cartelito ("Escribirle a…").
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              (e.currentTarget as HTMLElement | null)?.focus();
            }}
          >
            {persona && data ? (
              <PerfilCompanero
                key={persona.id}
                persona={persona}
                data={data}
                brands={clients}
                onEditar={
                  admin
                    ? () => {
                        cerrarPerfil();
                        setEditando(persona.id);
                      }
                    : undefined
                }
              />
            ) : (
              <div className="p-6">
                <DialogTitle>{loaded ? "No encontramos a esa persona" : "Cargando…"}</DialogTitle>
                <DialogDescription className="mt-1">{loaded ? (error ?? "Puede que ya no esté en el equipo.") : "Un segundo."}</DialogDescription>
              </div>
            )}
          </DialogContent>
        )}
      </Dialog>
      {aEditar && data && <PersonaDialog persona={aEditar} data={data} admin={admin} onClose={() => setEditando(null)} />}
    </>
  );
}

function PerfilCompanero({ persona: p, data, brands, onEditar }: { persona: Persona; data: EquipoData; brands: Brand[]; onEditar?: () => void }) {
  const scroll = useRef<HTMLDivElement>(null);
  const rel = relacionesDe(p, data, brands);
  const yo = data.personas.find((x) => x.id === data.yo?.equipo_id) ?? null;
  const esYo = yo?.id === p.id;
  const comun = yo ? enComun(yo, p, data, brands) : [];
  const nombre = nombreDe(p.perfil, p.nombre);
  const acento = p.perfil?.acento ?? null;
  const fuera = fueraDeOficina(p.perfil);
  const puestos = rel.puestos.map((x) => x.nombre);
  // Debajo del puesto: su nombre completo (si se hace llamar distinto) y, sin puesto, el cargo de Basecamp.
  const subtitulo = [nombre !== p.nombre ? p.nombre : null, puestos.length ? null : p.cargo].filter(Boolean).join(" · ");

  // Con llaves: en Chrome nuevo scrollTo devuelve una promesa, y React la tomaría como limpieza.
  useEffect(() => {
    scroll.current?.scrollTo({ top: 0 });
  }, [p.id]);

  const copiar = async () => {
    if (!p.email) return;
    const ok = await copyPlain(p.email);
    toast(ok ? `Copiado: ${p.email}` : "No se pudo copiar", ok ? "ok" : "error");
  };
  const icono =
    "grid h-9 w-9 place-items-center rounded-full border bg-card text-muted-foreground shadow-sm transition-colors hover:border-foreground/30 hover:text-foreground";

  return (
    <div ref={scroll} className="min-h-0 overflow-y-auto" data-scroll-y>
      <Portada perfil={p.perfil} />
      <div className="px-5 pb-5">
        <div className="-mt-9 flex items-end justify-between gap-3">
          <FotoPerfil nombre={nombre} url={p.avatar_url} acento={acento} fuera={Boolean(fuera)} size={84} />
          <div className="flex items-center gap-1.5 pb-1">
            {p.email && !esYo && (
              <>
                <Hint label={`Escribirle a ${p.email}`}>
                  <a href={`mailto:${p.email}`} aria-label={`Escribirle a ${p.email}`} className={icono}>
                    <Mail className="h-4 w-4" />
                  </a>
                </Hint>
                <Hint label="Copiar su mail">
                  <button type="button" onClick={copiar} aria-label="Copiar su mail" className={icono}>
                    <Copy className="h-4 w-4" />
                  </button>
                </Hint>
              </>
            )}
            {onEditar && (
              <Hint label="Editar puestos, hub, jefes y rol">
                <button type="button" onClick={onEditar} aria-label="Editar en Organización" className={icono}>
                  <Settings2 className="h-4 w-4" />
                </button>
              </Hint>
            )}
          </div>
        </div>

        <DialogTitle className="mt-3 text-[1.9rem] leading-none">
          {nombre}
          {esYo && <span className="ml-2 align-middle font-sans text-xs font-medium text-muted-foreground">vos</span>}
        </DialogTitle>
        <PuestoPills puestos={puestos} acento={acento} className="mt-2.5" />
        <DialogDescription className="mt-1.5">{subtitulo || p.email || "En el equipo"}</DialogDescription>
        <RedesLinks redes={p.perfil?.redes} size="sm" className="mt-2.5" />

        <EstadoLinea perfil={p.perfil} className="mt-3" />
        <CumpleLinea persona={p} esYo={esYo} />

        {comun.length > 0 && (
          <div className="mt-4 rounded-2xl p-3" style={{ background: acento ? conAlfa(acento, 0.1) : "hsl(var(--secondary) / 0.7)" }}>
            <p className="eyebrow mb-1.5">En común con vos</p>
            <ul className="space-y-0.5 text-sm">
              {comun.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-4 border-t pt-4">
          <EnElEstudio rel={rel} onPersona={(id) => id !== p.id && abrirPerfil(id)} />
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            {!p.perfil
              ? "Todavía no entró a Herramientas."
              : p.ultima_actividad
                ? `Última actividad ${hace(p.ultima_actividad)}.`
                : !p.activo
                  ? "Inactivo en el equipo."
                  : ""}
          </span>
          {esYo && (
            <Link
              href="/perfil"
              onClick={() => cerrarPerfil()}
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-foreground px-3 text-xs font-semibold text-background transition-opacity hover:opacity-90"
            >
              <PenLine className="h-3.5 w-3.5" /> Editar tu perfil
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

/** Su cumpleaños, si lo cargó. El día del cumple, con el link para saludarlo. */
function CumpleLinea({ persona: p, esYo }: { persona: Persona; esYo: boolean }) {
  const c = cumpleDe(p);
  if (!c) return null;
  const hoy = hoyISO();
  if (cumpleHoy(c, hoy)) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl bg-primary/25 px-3 py-2 text-sm font-medium">
        <span>🎂 {esYo ? "¡Hoy es tu cumpleaños!" : "¡Hoy es su cumpleaños!"}</span>
        {!esYo && (
          <Link
            href={`/saludar?a=${p.id}`}
            onClick={() => cerrarPerfil()}
            className="ml-auto inline-flex h-7 items-center rounded-full bg-foreground px-3 text-xs font-semibold text-background hover:opacity-90"
          >
            Saludar
          </Link>
        )}
      </div>
    );
  }
  const cuando = cuandoCumple(c, hoy);
  return (
    <p className="mt-2 text-[13px] text-muted-foreground">
      🎂 Cumple {cuando.startsWith("El ") ? `el ${textoCumple(c)}` : `${cuando.toLowerCase()} (${textoCumple(c)})`}
    </p>
  );
}
