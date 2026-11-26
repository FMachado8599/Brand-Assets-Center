"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Eye, LayoutGrid, Search, Target } from "lucide-react";
import { abrirBuscador } from "@/components/inicio/Buscador";
import { Encabezado } from "@/components/inicio/Encabezado";
import { Estudio } from "@/components/inicio/Estudio";
import { Herramientas, useOrdenHerramientas } from "@/components/inicio/Herramientas";
import { Recreo } from "@/components/inicio/Recreo";
import { SoltarArchivos, escribiendo } from "@/components/inicio/Rapido";
import { Seguir } from "@/components/inicio/Seguir";
import { TuDia } from "@/components/inicio/TuDia";
import { TusMarcas } from "@/components/inicio/TusMarcas";
import { AjustesProvider, SECCIONES_INICIO, useAjustesInicio, useAjustesInicioState } from "@/components/inicio/piezas";
import { useInicio, type DatosInicio } from "@/components/inicio/useInicio";
import { PerfilHost } from "@/components/perfil/PerfilDialog";
import { useAccount } from "@/components/shell/AccountProvider";
import { FeedbackSection } from "@/components/site/FeedbackSection";
import { SiteFooter } from "@/components/site/SiteFooter";
import { ConfirmProvider } from "@/components/ui/confirm";
import { toast } from "@/components/ui/toaster";
import { empezarFoco, useFoco } from "@/lib/inicio/foco";
import { cn } from "@/lib/utils";


/**
 * Inicio con sesión del estudio: un panel de cada uno. Arriba el saludo (y la marca en foco); después
 * tus marcas, tu día, tus herramientas (por cuánto las usás), lo que dejaste a medias, el estudio y un
 * respiro. Se acomoda: cada sección se puede esconder y las herramientas y las marcas se mueven.
 * La presentación (app/page.tsx) es para quien llega sin sesión.
 */
export function Dashboard({ name }: { name: string | null }) {
  const router = useRouter();
  const account = useAccount();
  const { ajustes, cambiar } = useAjustesInicioState();
  const [acomodando, setAcomodando] = useState(false);

  // Si se cierra la sesión (acá o en otra pestaña), Inicio vuelve a ser la presentación.
  // Una sola vez: si el servidor igual manda el panel, no se queda refrescando.
  const refreshed = useRef(false);
  const signedOut = !!account?.ready && !account.user;
  useEffect(() => {
    if (!signedOut || refreshed.current) return;
    refreshed.current = true;
    router.refresh();
  }, [signedOut, router]);

  return (
    <ConfirmProvider>
      <AjustesProvider value={{ ajustes, cambiar, acomodando }}>
        <Panel nombreServidor={name} acomodando={acomodando} setAcomodando={setAcomodando} />
      </AjustesProvider>
      <PerfilHost />
    </ConfirmProvider>
  );
}

function Panel({ nombreServidor, acomodando, setAcomodando }: { nombreServidor: string | null; acomodando: boolean; setAcomodando: (v: boolean) => void }) {
  const router = useRouter();
  const datos = useInicio();
  const d: DatosInicio = { ...datos, nombre: datos.nombre ?? nombreServidor };
  const orden = useOrdenHerramientas(d);
  const { foco } = useFoco();
  const { ajustes, cambiar } = useAjustesInicio();

  // Las teclas 1 a 9 abren tus herramientas, en el orden en que se ven.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || escribiendo(e.target)) return;
      const tool = orden.lista[Number(e.key) - 1];
      if (!tool || !/^[1-9]$/.test(e.key)) return;
      e.preventDefault();
      router.push(tool.href);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, orden.lista]);

  // Un saludo que llega desde la campanita (/#cumple) baja hasta los festejos.
  useEffect(() => {
    if (window.location.hash === "#cumple" || window.location.hash === "#aniversario" || window.location.hash === "#bienvenida") {
      setTimeout(() => document.getElementById("cumple")?.scrollIntoView({ behavior: "smooth", block: "center" }), 600);
    }
  }, []);

  const escondidas = SECCIONES_INICIO.filter((s) => ajustes.seccionesOcultas.includes(s.id));
  const boton = "inline-flex h-11 items-center gap-2 rounded-full px-4 text-[13px] font-semibold transition-colors";

  const acciones = (viernes: boolean) => {
    const viernesClaro = viernes ? "bg-ink/10 text-ink ring-1 ring-ink/10 hover:bg-ink/15" : "bg-cream/[0.08] text-cream ring-1 ring-cream/10 hover:bg-cream/15";
    return (
    <>
      <button type="button" onClick={() => abrirBuscador()} className={cn(boton, viernesClaro, "lg:hidden")}>
        <Search className="h-4 w-4" /> Buscar
      </button>
      {!foco && (
        <button
          type="button"
          onClick={() => {
            empezarFoco(25);
            toast("Modo foco: 25 minutos. Lo seguís abajo a la izquierda.");
          }}
          className={cn(boton, viernesClaro)}
        >
          <Target className="h-4 w-4" /> Modo foco
        </button>
      )}
      <button type="button" onClick={() => setAcomodando(!acomodando)} className={cn(boton, acomodando ? (viernes ? "bg-ink text-cream" : "bg-primary text-primary-foreground") : viernesClaro)}>
        {acomodando ? <Check className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
        {acomodando ? "Listo" : "Acomodar"}
      </button>
    </>
    );
  };

  return (
    <div className="bg-background text-foreground">
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-20 sm:px-8 md:pb-24 md:pt-24">
        <Encabezado d={d} acciones={acciones} />

        {acomodando && (
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-foreground/25 px-4 py-3 text-[13px] duration-300 animate-in fade-in-0">
            <span className="font-semibold">Acomodando el Inicio:</span>
            <span className="text-muted-foreground">arrastrá tus herramientas y tus marcas para cambiarlas de lugar, y escondé lo que no uses.</span>
            {escondidas.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => cambiar((a) => ({ seccionesOcultas: a.seccionesOcultas.filter((x) => x !== s.id) }))}
                className="inline-flex h-7 items-center gap-1 rounded-full border px-2.5 hover:border-foreground/30"
              >
                <Eye className="h-3 w-3" /> {s.label}
              </button>
            ))}
          </div>
        )}

        <div className="mt-8 space-y-10">
          <TusMarcas d={d} />
          <TuDia d={d} />
          <Herramientas d={d} />
          <Seguir d={d} />
          <Estudio d={d} />
          <Recreo d={d} />
        </div>
      </main>

      <div className="mx-auto max-w-6xl px-4 sm:px-8">
        <div className="border-t border-foreground/15" />
      </div>
      <FeedbackSection board />
      <SiteFooter />
      <SoltarArchivos />
    </div>
  );
}
