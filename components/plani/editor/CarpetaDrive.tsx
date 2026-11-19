"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronRight, FolderOpen, FolderPlus, HardDrive, Loader2, TriangleAlert } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";

type Carpeta = { id: string; name: string };
type Paso = { nombre: string; id: string | null };
type Estado = {
  sinDrive?: boolean;
  completo?: boolean;
  raiz?: { id: string; nombre: string } | null;
  actual?: { id: string; ruta: Carpeta[] | null } | null;
  sugerida?: { pasos: Paso[]; falta: "raiz" | "marca" | null };
  error?: string;
};

const linkDe = (id: string) => `https://drive.google.com/drive/folders/${id}`;

/**
 * La carpeta de Drive de la presentación, en una fila: dónde va el material y, si todavía no tiene,
 * el aviso (lo que se sube queda en "Sin carpeta", y sin carpeta no pasa a Revisión).
 */
export function CarpetaDrive({
  presentacionId,
  carpetaId,
  onCambio,
  abrir,
  onAbrir,
}: {
  presentacionId: string;
  carpetaId: string | null;
  onCambio: (id: string) => void;
  /** Abierto desde afuera (ej: al querer pasar a Revisión sin carpeta). */
  abrir: boolean;
  onAbrir: (o: boolean) => void;
}) {
  const [estado, setEstado] = useState<Estado | null>(null);
  const cargar = useCallback(async () => {
    const r = await fetch(`/api/drive/carpeta?presentacion=${presentacionId}`);
    setEstado(await r.json().catch(() => ({ error: "No se pudo leer el Drive" })));
  }, [presentacionId]);
  useEffect(() => {
    cargar();
  }, [cargar, carpetaId]);

  if (!estado || estado.sinDrive) return null;
  const ruta = estado.actual?.ruta;

  return (
    <>
      <div
        className={cn(
          "flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl border px-3.5 py-2.5 text-sm",
          carpetaId ? "border-black/[0.06] bg-card" : "border-[#8A6A3B]/30 bg-[#8A6A3B]/[0.07]"
        )}
      >
        {carpetaId ? <HardDrive className="h-4 w-4 shrink-0 text-muted-foreground" /> : <TriangleAlert className="h-4 w-4 shrink-0 text-[#8A6A3B]" />}
        <span className="min-w-0 flex-1">
          {carpetaId ? (
            <span className="block truncate" title={ruta?.map((c) => c.name).join(" / ")}>
              {ruta ? ruta.map((c) => c.name).join(" / ") : "Carpeta de Drive elegida"}
            </span>
          ) : (
            <span>
              <b className="font-semibold">Sin carpeta de Drive.</b>{" "}
              <span className="text-muted-foreground">Lo que se sube queda en “Sin carpeta”. Elegila para poder pasar a Revisión.</span>
            </span>
          )}
        </span>
        {carpetaId && (
          <a href={linkDe(carpetaId)} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-full border bg-card px-3 text-xs font-medium hover:bg-secondary">
            <FolderOpen className="h-3.5 w-3.5" /> Abrir
          </a>
        )}
        <button
          type="button"
          onClick={() => onAbrir(true)}
          className={cn(
            "inline-flex h-8 items-center rounded-full px-3 text-xs font-semibold",
            carpetaId ? "border bg-card font-medium hover:bg-secondary" : "bg-foreground text-background hover:opacity-90"
          )}
        >
          {carpetaId ? "Cambiar" : "Elegir carpeta"}
        </button>
      </div>
      <ElegirCarpeta
        open={abrir}
        onOpenChange={onAbrir}
        presentacionId={presentacionId}
        estado={estado}
        onElegida={(id) => {
          onCambio(id);
          onAbrir(false);
          cargar();
        }}
      />
    </>
  );
}

function ElegirCarpeta({
  open,
  onOpenChange,
  presentacionId,
  estado,
  onElegida,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  presentacionId: string;
  estado: Estado;
  onElegida: (id: string) => void;
}) {
  const [link, setLink] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [nav, setNav] = useState<{ ruta: Carpeta[]; hijas: Carpeta[] } | null>(null);
  const [navError, setNavError] = useState<string | null>(null);
  const [nueva, setNueva] = useState("");

  const sug = estado.sugerida;
  const listo = estado.completo && estado.raiz;

  const ir = useCallback(async (en?: string) => {
    setNavError(null);
    const r = await fetch(`/api/drive/carpetas${en ? `?en=${encodeURIComponent(en)}` : ""}`);
    const body = await r.json().catch(() => ({}));
    if (!r.ok) return setNavError(body.error ?? "No se pudo abrir la carpeta");
    setNav(body);
  }, []);

  // Se arranca a navegar en la última carpeta que existe del camino sugerido (ej: la del año).
  useEffect(() => {
    if (!open || !listo) return;
    const ultima = [...(sug?.pasos ?? [])].reverse().find((p) => p.id)?.id;
    ir(ultima ?? undefined);
  }, [open, listo, sug, ir]);

  const usar = async (cuerpo: { sugerida?: boolean; carpeta?: string }) => {
    setGuardando(true);
    const r = await fetch("/api/drive/carpeta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ presentacion: presentacionId, ...cuerpo }),
    });
    const body = await r.json().catch(() => ({}));
    setGuardando(false);
    if (!r.ok) return toast(body.error ?? "No se pudo elegir la carpeta", "error");
    toast(`Carpeta: ${(body.ruta as Carpeta[] | null)?.map((c) => c.name).join(" / ") ?? "elegida"}. Lo que ya estaba subido pasó ahí.`);
    setLink("");
    onElegida(body.id);
  };

  const crear = async () => {
    if (!nav || !nueva.trim()) return;
    const actual = nav.ruta[nav.ruta.length - 1];
    const r = await fetch("/api/drive/carpetas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ en: actual.id, nombre: nueva.trim() }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) return toast(body.error ?? "No se pudo crear la carpeta", "error");
    setNueva("");
    ir(body.id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Carpeta de Drive</DialogTitle>
          <DialogDescription>Dónde va el material de esta presentación. Lo que ya se subió se mueve ahí.</DialogDescription>
        </DialogHeader>

        {!estado.completo ? (
          <p className="rounded-xl bg-secondary/60 p-3 text-sm">
            Falta volver a conectar el Drive con el permiso para ver las carpetas del estudio (lo hace un admin, en Presentaciones → Basecamp y Drive).
          </p>
        ) : !estado.raiz ? (
          <p className="rounded-xl bg-secondary/60 p-3 text-sm">Falta que un admin elija la carpeta raíz (ej: PAUTAS DIGITAL), en Presentaciones → Basecamp y Drive.</p>
        ) : (
          <div className="space-y-5">
            {sug && sug.pasos.length > 0 && (
              <section className="space-y-2">
                <p className="eyebrow">La que le toca</p>
                <p className="flex flex-wrap items-center gap-1 text-sm">
                  {sug.pasos.map((p, i) => (
                    <span key={i} className="inline-flex items-center gap-1">
                      {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                      <span className={cn(p.id ? "font-medium" : "text-muted-foreground")}>{p.nombre}</span>
                      {!p.id && <span className="rounded-full bg-secondary px-1.5 text-[10px] text-muted-foreground">nueva</span>}
                    </span>
                  ))}
                </p>
                {sug.falta === "marca" ? (
                  <p className="text-xs text-muted-foreground">No encontré la carpeta de la marca en ese año: buscala abajo (o creala) y elegí la del mes, o pegá el link.</p>
                ) : (
                  <button
                    type="button"
                    disabled={guardando}
                    onClick={() => usar({ sugerida: true })}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground px-4 text-sm font-semibold text-background disabled:opacity-50"
                  >
                    {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Usar esta
                  </button>
                )}
              </section>
            )}

            <section className="space-y-2">
              <p className="eyebrow">Pegar el link de una carpeta</p>
              <div className="flex gap-1.5">
                <input
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder="https://drive.google.com/drive/folders/…"
                  className="h-9 min-w-0 flex-1 rounded-full border border-black/[0.08] bg-card px-3.5 text-sm outline-none focus:border-foreground/25"
                />
                <button
                  type="button"
                  disabled={!link.trim() || guardando}
                  onClick={() => usar({ carpeta: link })}
                  className="h-9 rounded-full border bg-card px-4 text-sm font-medium hover:bg-secondary disabled:opacity-40"
                >
                  Usar
                </button>
              </div>
            </section>

            <section className="space-y-2">
              <p className="eyebrow">O buscarla</p>
              {navError ? (
                <p className="text-xs text-destructive">{navError}</p>
              ) : !nav ? (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Abriendo el Drive…
                </p>
              ) : (
                <div className="rounded-xl border bg-card">
                  <div className="flex flex-wrap items-center gap-1 border-b px-3 py-2 text-xs">
                    {nav.ruta.map((c, i) => (
                      <span key={c.id} className="inline-flex items-center gap-1">
                        {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                        <button type="button" onClick={() => ir(c.id)} className={cn("hover:underline", i === nav.ruta.length - 1 && "font-semibold")}>
                          {c.name}
                        </button>
                      </span>
                    ))}
                  </div>
                  <ul className="max-h-56 overflow-y-auto py-1">
                    {nav.hijas.length ? (
                      nav.hijas.map((c) => (
                        <li key={c.id}>
                          <button type="button" onClick={() => ir(c.id)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-secondary">
                            <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <span className="truncate">{c.name}</span>
                          </button>
                        </li>
                      ))
                    ) : (
                      <li className="px-3 py-2 text-xs italic text-muted-foreground">No tiene carpetas adentro.</li>
                    )}
                  </ul>
                  <div className="flex flex-wrap items-center gap-1.5 border-t px-3 py-2">
                    <input
                      value={nueva}
                      onChange={(e) => setNueva(e.target.value)}
                      placeholder="Nueva carpeta acá…"
                      className="h-8 min-w-0 flex-1 rounded-full border border-black/[0.08] bg-background/60 px-3 text-xs outline-none focus:border-foreground/25"
                    />
                    <button type="button" onClick={crear} disabled={!nueva.trim()} className="inline-flex h-8 items-center gap-1 rounded-full border px-2.5 text-xs font-medium hover:bg-secondary disabled:opacity-40">
                      <FolderPlus className="h-3.5 w-3.5" /> Crear
                    </button>
                    <button
                      type="button"
                      disabled={guardando || nav.ruta.length < 2}
                      onClick={() => usar({ carpeta: nav.ruta[nav.ruta.length - 1].id })}
                      className="ml-auto h-8 rounded-full bg-foreground px-3 text-xs font-semibold text-background disabled:opacity-40"
                    >
                      Usar “{nav.ruta[nav.ruta.length - 1].name}”
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
