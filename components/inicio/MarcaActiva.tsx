"use client";

import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { ClientMark } from "@/components/clients/ClientMark";
import { Hint } from "@/components/ui/tooltip";
import { useClients } from "@/hooks/useClients";
import { useStoredState } from "@/hooks/useStoredState";
import type { Brand } from "@/lib/types";

/**
 * El modo marca: se elige una marca en el Inicio (o con ⌘K) y Redacción, Tarjetas, Ads y
 * Presentaciones arrancan con ella. Se guarda en la cuenta, como las demás preferencias. Mientras está
 * prendido, una píldora abajo a la izquierda lo recuerda y lo apaga.
 */

export const MARCA_ACTIVA_KEY = "app:modo-marca";

type Ctx = { marcaId: string | null; listo: boolean; setMarca: (id: string | null) => void };

const MarcaCtx = createContext<Ctx>({ marcaId: null, listo: false, setMarca: () => {} });

/** Vive en el marco de la app. No lee los clientes: eso lo hace quien muestra la marca (no todas las páginas lo necesitan). */
export function MarcaActivaProvider({ children }: { children: ReactNode }) {
  const [marcaId, setMarcaId, listo] = useStoredState<string | null>(MARCA_ACTIVA_KEY, null);
  return <MarcaCtx.Provider value={{ marcaId, listo, setMarca: setMarcaId }}>{children}</MarcaCtx.Provider>;
}

/** La marca del modo marca (con su ficha, si ya se leyeron los clientes). */
export function useMarcaActiva() {
  const ctx = useContext(MarcaCtx);
  const { clients, loading } = useClients();
  const marca = ctx.marcaId ? (clients.find((c) => c.id === ctx.marcaId) ?? null) : null;
  const { marcaId, setMarca } = ctx;
  // Si la marca se borró, el modo se apaga solo.
  useEffect(() => {
    if (!loading && clients.length && marcaId && !marca) setMarca(null);
  }, [loading, clients.length, marcaId, marca, setMarca]);
  return { ...ctx, marca, clientesListos: !loading };
}

/** Solo si hay modo marca y cuál, sin leer los clientes (para el marco de la app). */
export const useMarcaActivaId = () => useContext(MarcaCtx);

/**
 * Corre `aplicar` una sola vez, apenas se sabe si hay modo marca (para que cada herramienta arranque con
 * esa marca). Si no hay, no hace nada. `saltear`: hay otra indicación (un link que ya dice qué abrir).
 * `listo`: la herramienta ya leyó lo suyo (si no, lo guardado pisaría la marca).
 */
export function useAlArrancarConMarca(aplicar: (marca: Brand) => void, { saltear = false, listo: listoModulo = true } = {}) {
  const { marca, marcaId, listo, clientesListos: loaded } = useMarcaActiva();
  const hecho = useRef(false);
  const fn = useRef(aplicar);
  fn.current = aplicar;
  useEffect(() => {
    if (hecho.current || !listo || !listoModulo) return;
    if (!marcaId || saltear) {
      hecho.current = true;
      return;
    }
    if (!loaded || !marca) return;
    hecho.current = true;
    fn.current(marca);
  }, [listo, listoModulo, marcaId, marca, loaded, saltear]);
}

/** Dónde se ve la píldora: en las herramientas que siguen al modo marca, y en el Inicio. */
const DONDE = ["/", "/redaccion", "/tarjetas", "/ads", "/presentaciones"];

export function MarcaActivaPildora() {
  const { marcaId } = useMarcaActivaId();
  const pathname = usePathname();
  if (!marcaId || !DONDE.some((d) => (d === "/" ? pathname === "/" : pathname.startsWith(d)))) return null;
  return <Pildora />;
}

function Pildora() {
  const { marca, setMarca } = useMarcaActiva();
  if (!marca) return null;
  return (
    <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2">
      <div className="floating-ink pointer-events-auto flex h-11 items-center gap-2 rounded-full py-1 pl-1 pr-1.5">
        <ClientMark brand={marca} className="h-9 w-9 rounded-full text-[10px]" pad="p-[18%]" />
        <span className="max-w-[11rem] truncate text-[13px] font-semibold leading-tight">
          <span className="block text-[9.5px] font-medium uppercase tracking-[0.14em] text-cream/50">Modo marca</span>
          {marca.name}
        </span>
        <Hint label="Apagar el modo marca">
          <button
            type="button"
            onClick={() => setMarca(null)}
            aria-label="Apagar el modo marca"
            className="grid h-8 w-8 place-items-center rounded-full text-cream/60 transition-colors hover:bg-cream/10 hover:text-cream"
          >
            <X className="h-4 w-4" />
          </button>
        </Hint>
      </div>
    </div>
  );
}
