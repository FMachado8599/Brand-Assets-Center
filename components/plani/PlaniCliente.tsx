"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "@/components/ui/toaster";
import { MESES } from "@/lib/plani/config";
import type { Herramienta } from "@/lib/plani/tipos";
import type { Aprobacion, Comentario, Pieza } from "@/lib/plani/types";
import { MedioBaseProvider, VistaClienteProvider } from "./bits";
import { EntrarCliente, type Portada } from "./EntrarCliente";
import type { MockupBrand } from "./Mockups";
import { PresentacionVista, type PresentacionPlani } from "./Presentacion";

type Datos = {
  presentacion: PresentacionPlani & { titulo: string; brand_id: string };
  tipo: { id: string; nombre: string; color: string; icono: string; herramientas?: Herramienta[] } | null;
  brand: MockupBrand | null;
  piezas: Partial<Pieza>[];
  comentarios: (Omit<Comentario, "presentacion_id" | "autor_id" | "interno"> & { del_cliente: boolean })[];
  /** Con qué mail entró este navegador (o si es alguien del estudio con su sesión). */
  entrada?: { email?: string; estudio?: boolean };
};

/** Lo que contesta /api/p/[token]. */
type Respuesta = { estado: "listo"; datos: Datos } | { estado: "entrar"; portada: Portada } | { estado: "invalido" | "error" };

/** Un pedido a las rutas de la presentación. 401: la entrada venció (hay que volver a poner el mail). */
async function enviar(token: string, ruta: string, body: unknown) {
  const r = await fetch(`/api/p/${encodeURIComponent(token)}/${ruta}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => null);
  return { ok: Boolean(r?.ok), sinEntrada: r?.status === 401 };
}

const NOMBRE_KEY = "plani:cliente:nombre";

/** Lo que el cliente no recibe (indicaciones internas, referencias…) se completa vacío para los mockups. */
function completar(p: Partial<Pieza>): Pieza {
  return {
    instrucciones: "",
    slides: [],
    referencias: [],
    assets: [],
    anuncio: {},
    ancho: null,
    alto: null,
    estado_agencia: "pendiente",
    updated_at: "",
    ...p,
  } as Pieza;
}

/**
 * La plani en el link del cliente: la presentación, sin nada interno. Puede comentar cada pieza
 * (o la plani entera) y aprobarla o pedir cambios. No necesita cuenta, pero el link solo no alcanza:
 * entra con un mail de su empresa y un código que le llega por mail (EntrarCliente).
 */
export function PlaniCliente({ token }: { token: string }) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [portada, setPortada] = useState<Portada | null>(null);
  const [estado, setEstado] = useState<"cargando" | "listo" | "entrar" | "invalido" | "error">("cargando");
  const [nombre, setNombreState] = useState("");

  useEffect(() => {
    try {
      setNombreState(localStorage.getItem(NOMBRE_KEY) ?? "");
    } catch {
      /* sin almacenamiento */
    }
  }, []);
  const setNombre = (v: string) => {
    setNombreState(v);
    try {
      localStorage.setItem(NOMBRE_KEY, v);
    } catch {
      /* sin almacenamiento */
    }
  };

  const cargar = useCallback(async () => {
    const r = await fetch(`/api/p/${encodeURIComponent(token)}`, { cache: "no-store" }).catch(() => null);
    const j = (r ? await r.json().catch(() => null) : null) as Respuesta | null;
    if (!j) {
      // Sin red un rato: lo que ya se ve queda.
      setEstado((e) => (e === "cargando" ? "error" : e));
      return;
    }
    if (j.estado === "listo") {
      setDatos(j.datos);
      setEstado("listo");
    } else if (j.estado === "entrar") {
      setPortada(j.portada);
      setDatos(null);
      setEstado("entrar");
    } else setEstado(j.estado);
  }, [token]);

  useEffect(() => {
    cargar();
    window.addEventListener("focus", cargar);
    return () => window.removeEventListener("focus", cargar);
  }, [cargar]);

  useEffect(() => {
    if (datos?.brand) document.title = `${datos.brand.name} · ${datos.tipo?.nombre ?? "Presentación"} ${MESES[datos.presentacion.mes - 1]} ${datos.presentacion.anio}`;
  }, [datos]);

  const comentar = async (piezaId: string | null, texto: string) => {
    if (!nombre.trim()) {
      toast("Escribí tu nombre para comentar", "error");
      return false;
    }
    const r = await enviar(token, "comentar", { pieza: piezaId, nombre, texto });
    if (r.sinEntrada) {
      await cargar();
      return false;
    }
    if (!r.ok) {
      toast("No se pudo enviar el comentario", "error");
      return false;
    }
    await cargar();
    toast("Comentario enviado");
    return true;
  };

  const aprobar = async (piezaId: string, nuevo: Aprobacion) => {
    setDatos((d) => (d ? { ...d, piezas: d.piezas.map((p) => (p.id === piezaId ? { ...p, estado_cliente: nuevo } : p)) } : d));
    const r = await enviar(token, "aprobar", { pieza: piezaId, estado: nuevo });
    if (!r.ok) {
      if (!r.sinEntrada) toast("No se pudo guardar", "error");
      cargar();
    } else if (nuevo === "aprobada") toast("Pieza aprobada");
  };

  if (estado === "entrar" && portada) {
    return <EntrarCliente token={token} portada={portada} onAdentro={cargar} />;
  }

  if (estado !== "listo" || !datos) {
    return (
      <main className="grain grid min-h-screen place-items-center bg-ink px-6 text-center text-cream">
        <div>
          <p className="site-label text-cream/50">
            Cámara <span className="text-primary">\</span> TBWA
          </p>
          <h1 className="mt-5 font-display text-5xl leading-tight">
            {estado === "cargando" ? "Cargando…" : estado === "invalido" ? "Este link ya no está disponible" : "No se pudo abrir la presentación"}
          </h1>
          {estado === "invalido" && <p className="mt-3 text-sm text-cream/60">Pedile al estudio un link nuevo.</p>}
        </div>
      </main>
    );
  }

  return (
    <MedioBaseProvider value={`/api/p/${encodeURIComponent(token)}/archivo`}>
      <VistaClienteProvider value={true}>
        <PresentacionVista
          plani={datos.presentacion}
          tipoNombre={datos.tipo?.nombre ?? "Presentación"}
          herramientas={datos.tipo?.herramientas ?? []}
          piezas={datos.piezas.map(completar)}
          brand={datos.brand ?? { name: "Cliente", color: "#52525B", logo_url: null, logo_bg: "light" }}
          modo="cliente"
          comentarios={datos.comentarios.map((c) => ({ ...c, presentacion_id: datos.presentacion.id, autor_id: null, interno: false }))}
          onComentar={comentar}
          onAprobar={aprobar}
          nombre={{ value: nombre, onChange: setNombre }}
        />
        {datos.entrada?.email && <Salir token={token} email={datos.entrada.email} onFuera={cargar} />}
      </VistaClienteProvider>
    </MedioBaseProvider>
  );
}

/** Con qué mail entró este navegador y, para una computadora compartida, la opción de salir. */
function Salir({ token, email, onFuera }: { token: string; email: string; onFuera: () => void }) {
  return (
    <footer className="bg-ink px-4 py-5 text-center text-xs text-cream/50">
      Entraste como <span className="text-cream/80">{email}</span> ·{" "}
      <button
        type="button"
        onClick={async () => {
          await fetch(`/api/p/${encodeURIComponent(token)}/entrar`, { method: "DELETE" }).catch(() => null);
          onFuera();
        }}
        className="underline underline-offset-2 transition-colors hover:text-cream"
      >
        Salir
      </button>
    </footer>
  );
}
