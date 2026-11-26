"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, Star } from "lucide-react";
import { ClientMark } from "@/components/clients/ClientMark";
import { useConfirm } from "@/components/ui/confirm";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cambiarEquipo } from "@/hooks/useEquipo";
import { equipoRepo, type EquipoData, type Persona } from "@/lib/board/equipo";
import { fold } from "@/lib/redaccion/text";
import type { Brand } from "@/lib/types";
import { cn } from "@/lib/utils";

type Estado = "principal" | "secundaria" | null;

/**
 * Las marcas de una persona, en cada sector de sus puestos. Salen de los proyectos de Basecamp en los
 * que está; entre esas elige las principales (es el designado: las tareas nuevas de esa marca en su
 * sector le llegan a ella) y las secundarias (también las trabaja y se entera de sus novedades). Cada
 * marca tiene una sola principal por sector; si ya es de otro, un admin se la puede pasar. Un admin
 * además puede elegir entre todas las marcas (ej: alguien que no está en Basecamp).
 */
export function MarcasDialog({
  persona,
  data,
  marcas,
  editable,
  admin,
  propia = false,
  onClose,
}: {
  persona: Persona | null;
  data: EquipoData;
  marcas: Brand[];
  editable: boolean;
  admin: boolean;
  /** Las de quien mira ("Mis marcas"): el texto le habla a esa persona. */
  propia?: boolean;
  onClose: () => void;
}) {
  const confirm = useConfirm();
  const [buscar, setBuscar] = useState("");
  const [guardando, setGuardando] = useState<string | null>(null);
  const [todas, setTodas] = useState(false);
  // Las marcas de sus proyectos de Basecamp. null: leyendo.
  const [deBasecamp, setDeBasecamp] = useState<Set<string> | null>(null);
  const [errorBasecamp, setErrorBasecamp] = useState<string | null>(null);

  // Los sectores de sus puestos, en el orden de siempre.
  const sectores = useMemo(() => {
    if (!persona) return [];
    const ids = new Set(persona.puestos.flatMap((id) => data.puestos.find((p) => p.id === id)?.sectores ?? []));
    return data.sectores.filter((s) => ids.has(s.id));
  }, [persona, data]);

  const [sector, setSector] = useState<string | null>(null);
  useEffect(() => {
    setSector(sectores[0]?.id ?? null);
    setBuscar("");
  }, [persona?.id, sectores]);

  const bcId = persona?.bc_persona_id ?? null;
  const personaId = persona?.id ?? null;
  // Por la persona (su id), no por el objeto: después de cada cambio el equipo se vuelve a leer.
  useEffect(() => {
    setErrorBasecamp(null);
    // Sin persona de Basecamp no hay de dónde sacarlas: un admin las elige entre todas.
    setTodas(bcId == null && admin);
    if (!personaId) return;
    if (bcId == null) {
      setDeBasecamp(new Set());
      return;
    }
    let vivo = true;
    setDeBasecamp(null);
    equipoRepo
      .marcasDeBasecamp(bcId)
      .then((ids) => vivo && setDeBasecamp(new Set(ids)))
      .catch((e: Error) => {
        if (!vivo) return;
        setDeBasecamp(new Set());
        setErrorBasecamp(e.message);
      });
    return () => {
      vivo = false;
    };
  }, [personaId, bcId, admin]);

  const nombreDe = useMemo(() => new Map(data.personas.map((p) => [p.id, p.nombre])), [data.personas]);
  // En el sector elegido: de quién es la principal de cada marca y qué es cada marca para esta persona.
  const { principalDe, estadoDe } = useMemo(() => {
    const principalDe = new Map<string, string>();
    const estadoDe = new Map<string, Estado>();
    for (const d of data.designaciones) {
      if (d.sector_id !== sector) continue;
      principalDe.set(d.brand_id, d.persona_id);
      if (d.persona_id === persona?.id) estadoDe.set(d.brand_id, "principal");
    }
    for (const d of data.secundarias) if (d.sector_id === sector && d.persona_id === persona?.id) estadoDe.set(d.brand_id, "secundaria");
    return { principalDe, estadoDe };
  }, [data.designaciones, data.secundarias, sector, persona?.id]);

  const grupos = useMemo(() => {
    const q = fold(buscar).trim();
    const orden = (a: Brand, b: Brand) => a.name.localeCompare(b.name, "es");
    const visibles = marcas.filter((m) => !q || fold(m.name).includes(q)).sort(orden);
    return {
      principales: visibles.filter((m) => estadoDe.get(m.id) === "principal"),
      secundarias: visibles.filter((m) => estadoDe.get(m.id) === "secundaria"),
      resto: visibles.filter((m) => !estadoDe.get(m.id) && (todas || deBasecamp?.has(m.id))),
    };
  }, [marcas, buscar, estadoDe, todas, deBasecamp]);

  const cuantas = (sectorId: string) =>
    [...data.designaciones, ...data.secundarias].filter((d) => d.persona_id === persona?.id && d.sector_id === sectorId).length;

  async function poner(marca: Brand, quiero: Exclude<Estado, null>) {
    if (!persona || !sector || !editable) return;
    const actual = estadoDe.get(marca.id) ?? null;
    setGuardando(marca.id);
    try {
      // Tocar lo que ya está la saca.
      if (actual === quiero) {
        await cambiarEquipo(() => equipoRepo.quitarDesignacion(marca.id, sector, persona.id));
        return;
      }
      if (quiero === "secundaria") {
        await cambiarEquipo(() => equipoRepo.secundaria(marca.id, sector, persona.id));
        return;
      }
      const otro = principalDe.get(marca.id);
      if (otro && otro !== persona.id) {
        if (!admin) return;
        const nombreSector = data.sectores.find((s) => s.id === sector)?.nombre ?? sector;
        const ok = await confirm({
          title: `¿Pasarle ${marca.name} a ${persona.nombre}?`,
          description: `En ${nombreSector}, la principal de ${marca.name} hoy es de ${nombreDe.get(otro) ?? "otra persona"}. Va a quedar como principal de ${persona.nombre}.`,
          confirmLabel: "Pasársela",
        });
        if (!ok) return;
      }
      await cambiarEquipo(() => equipoRepo.designar(marca.id, sector, persona.id));
    } finally {
      setGuardando(null);
    }
  }

  const fila = (m: Brand) => {
    const estado = estadoDe.get(m.id) ?? null;
    const otro = principalDe.get(m.id);
    const deOtro = otro && otro !== persona?.id ? otro : null;
    const fueraDeBasecamp = estado && deBasecamp && bcId != null && !deBasecamp.has(m.id);
    const nota = deOtro
      ? `Principal: ${nombreDe.get(deOtro) ?? "otra persona"}`
      : fueraDeBasecamp
        ? `${propia ? "No estás" : "No está"} en este proyecto de Basecamp`
        : null;
    const principalBloqueada = Boolean(deOtro) && !admin;
    return (
      <li key={m.id} className="flex items-center gap-3 rounded-xl px-2 py-1.5">
        <ClientMark brand={m} className="h-8 w-8 rounded-lg text-[10px]" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{m.name}</span>
          {nota && <span className="block truncate text-xs text-muted-foreground">{nota}</span>}
        </span>
        {guardando === m.id && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
        {editable ? (
          <span className="flex shrink-0 rounded-full border bg-card p-0.5" role="group" aria-label={`${m.name}: principal o secundaria`}>
            <button
              type="button"
              disabled={guardando === m.id || (principalBloqueada && estado !== "principal")}
              onClick={() => poner(m, "principal")}
              aria-pressed={estado === "principal"}
              title={
                principalBloqueada
                  ? `La principal es de ${nombreDe.get(deOtro!) ?? "otra persona"}. Un admin te la puede pasar.`
                  : estado === "principal"
                    ? "Sacarla de las principales"
                    : "Principal: las tareas nuevas de esta marca te llegan a vos"
              }
              className={cn(
                "inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-medium transition-colors",
                estado === "principal" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                principalBloqueada && estado !== "principal" && "cursor-not-allowed opacity-40 hover:text-muted-foreground"
              )}
            >
              <Star className={cn("h-3 w-3", estado === "principal" && "fill-current")} /> Principal
            </button>
            <button
              type="button"
              disabled={guardando === m.id}
              onClick={() => poner(m, "secundaria")}
              aria-pressed={estado === "secundaria"}
              title={estado === "secundaria" ? "Sacarla de las secundarias" : "Secundaria: también la trabajás y te enterás de sus novedades"}
              className={cn(
                "inline-flex h-7 items-center rounded-full px-2.5 text-xs font-medium transition-colors",
                estado === "secundaria" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Secundaria
            </button>
          </span>
        ) : (
          estado && <span className="shrink-0 text-xs font-medium text-muted-foreground">{estado === "principal" ? "Principal" : "Secundaria"}</span>
        )}
      </li>
    );
  };

  const titulo = (texto: string, n: number) => (
    <li className="eyebrow px-2 pb-1 pt-3 text-muted-foreground first:pt-0">
      {texto} <span className="tabular-nums">{n}</span>
    </li>
  );

  const nadaQueMostrar = !grupos.principales.length && !grupos.secundarias.length && (!editable || !grupos.resto.length);
  const sinBasecamp = bcId == null;

  return (
    <Dialog open={Boolean(persona)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[85vh] max-w-lg flex-col gap-3">
        <DialogHeader>
          <DialogTitle>{propia ? "Tus marcas" : `Marcas de ${persona?.nombre ?? ""}`}</DialogTitle>
          <DialogDescription>
            {propia
              ? "Las de los proyectos de Basecamp en los que estás. Marcá las principales (sos el designado: las tareas nuevas de esa marca en tu sector te llegan a vos) y las secundarias (también las trabajás y te enterás de sus novedades)."
              : "Las de los proyectos de Basecamp en los que está. Principales: es el designado y sus tareas nuevas le llegan a esa persona. Secundarias: también las trabaja."}
          </DialogDescription>
        </DialogHeader>

        {!sectores.length ? (
          <p className="rounded-xl bg-primary/20 p-3 text-sm">Primero necesita un puesto: las marcas se eligen por sector.</p>
        ) : (
          <>
            {sectores.length > 1 && (
              <div className="flex flex-wrap gap-1.5">
                {sectores.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSector(s.id)}
                    className={cn(
                      "h-8 rounded-full border px-3 text-[13px] font-medium",
                      sector === s.id ? "border-foreground bg-foreground text-background" : "bg-card hover:border-foreground/30"
                    )}
                  >
                    {s.nombre} <span className="tabular-nums opacity-60">{cuantas(s.id)}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <label className="flex h-9 flex-1 items-center gap-2 rounded-full border bg-card px-3">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  value={buscar}
                  onChange={(e) => setBuscar(e.target.value)}
                  placeholder="Buscar una marca"
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                />
              </label>
              {admin && editable && (
                <button
                  type="button"
                  onClick={() => setTodas((v) => !v)}
                  aria-pressed={todas}
                  title="Solo admins: elegir también entre las marcas de proyectos en los que no está"
                  className={cn("h-9 rounded-full border px-3 text-[13px] font-medium", todas && "border-foreground bg-foreground text-background")}
                >
                  Todas
                </button>
              )}
            </div>

            {editable && sinBasecamp && !admin && (
              <p className="rounded-xl bg-secondary p-3 text-sm text-muted-foreground">
                {propia ? "Tu cuenta" : "Esta persona"} no está vinculada a nadie de Basecamp (se cruza por el mail), así que no hay marcas de ahí. Un admin las puede cargar.
              </p>
            )}
            {errorBasecamp && <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">No se pudieron leer las marcas de Basecamp: {errorBasecamp}</p>}

            <ul className="-mx-2 min-h-0 flex-1 overflow-y-auto">
              {grupos.principales.length > 0 && titulo("Principales", grupos.principales.length)}
              {grupos.principales.map(fila)}
              {grupos.secundarias.length > 0 && titulo("Secundarias", grupos.secundarias.length)}
              {grupos.secundarias.map(fila)}
              {editable && (
                <>
                  {deBasecamp == null && !todas ? (
                    <li className="space-y-2 px-2 pt-3">
                      <div className="skeleton h-9 rounded-xl" />
                      <div className="skeleton h-9 rounded-xl" />
                      <div className="skeleton h-9 rounded-xl" />
                    </li>
                  ) : (
                    grupos.resto.length > 0 && (
                      <>
                        {titulo(todas ? "Las demás marcas" : propia ? "Tus otras marcas de Basecamp" : "Sus otras marcas de Basecamp", grupos.resto.length)}
                        {grupos.resto.map(fila)}
                      </>
                    )
                  )}
                </>
              )}
              {nadaQueMostrar && (deBasecamp != null || todas) && (
                <li className="p-6 text-center text-sm text-muted-foreground">
                  {buscar ? "No hay marcas que coincidan." : editable ? "No hay marcas de Basecamp para elegir." : "Todavía no tiene marcas."}
                </li>
              )}
            </ul>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
