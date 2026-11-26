"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "@/components/ui/toaster";
import { supabase } from "@/lib/supabase";
import { MESES } from "@/lib/plani/config";
import type { Herramienta } from "@/lib/plani/tipos";
import type { Aprobacion, Comentario, Pieza } from "@/lib/plani/types";
import { MedioBaseProvider, VistaClienteProvider } from "./bits";
import type { MockupBrand } from "./Mockups";
import { PresentacionVista, type PresentacionPlani } from "./Presentacion";

type Datos = {
  presentacion: PresentacionPlani & { titulo: string; brand_id: string };
  tipo: { id: string; nombre: string; color: string; icono: string; herramientas?: Herramienta[] } | null;
  brand: MockupBrand | null;
  piezas: Partial<Pieza>[];
  comentarios: (Omit<Comentario, "presentacion_id" | "autor_id" | "interno"> & { del_cliente: boolean })[];
};

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
 * (o la plani entera) y aprobarla o pedir cambios. No necesita cuenta: el link es la llave.
 */
export function PlaniCliente({ token }: { token: string }) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [estado, setEstado] = useState<"cargando" | "listo" | "invalido" | "error">("cargando");
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
    const { data, error } = await supabase.rpc("presentacion_publica", { p_token: token });
    if (error) {
      setEstado("error");
      return;
    }
    if (!data) {
      setEstado("invalido");
      return;
    }
    setDatos(data as Datos);
    setEstado("listo");
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
    const { error } = await supabase.rpc("presentacion_publica_comentar", { p_token: token, p_pieza: piezaId, p_nombre: nombre, p_texto: texto });
    if (error) {
      toast("No se pudo enviar el comentario", "error");
      return false;
    }
    await cargar();
    toast("Comentario enviado");
    return true;
  };

  const aprobar = async (piezaId: string, nuevo: Aprobacion) => {
    setDatos((d) => (d ? { ...d, piezas: d.piezas.map((p) => (p.id === piezaId ? { ...p, estado_cliente: nuevo } : p)) } : d));
    const { error } = await supabase.rpc("presentacion_publica_aprobar", { p_token: token, p_pieza: piezaId, p_estado: nuevo });
    if (error) {
      toast("No se pudo guardar", "error");
      cargar();
    } else if (nuevo === "aprobada") toast("Pieza aprobada");
  };

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
      </VistaClienteProvider>
    </MedioBaseProvider>
  );
}
