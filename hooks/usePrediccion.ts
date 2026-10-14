"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { entrenar, sugerir } from "@/lib/redaccion/prediccion";

/** El cliente de Supabase se carga recién cuando hace falta (Redacción no lo carga de entrada). */
const loadClient = () => import("@/lib/supabase").then((m) => m.supabase);

/** Lo ya leído de cada cliente, por unos minutos: abrir otra pieza o redacción no vuelve a pedir todo. */
const cache = new Map<string, { textos: string[]; at: number; pedido?: Promise<string[]> }>();
const VIGENCIA = 5 * 60_000;
const GENERAL = "__sin-cliente__";

type CopyRow = { copys: { todas?: string; html?: string } & Record<string, string | undefined> | null };

async function leerTextos(brandId: string | null): Promise<string[]> {
  const supabase = await loadClient();
  const textos: string[] = [];
  // Los copys de todas sus planis (de cualquier mes).
  if (brandId) {
    const { data } = await supabase
      .from("plani_piezas")
      .select("copys, planificaciones!inner(brand_id)")
      .eq("planificaciones.brand_id", brandId)
      .limit(1500);
    for (const r of (data ?? []) as CopyRow[]) {
      const c = r.copys ?? {};
      const texto = typeof c.todas === "string" ? c.todas : Object.entries(c).find(([k, v]) => k !== "html" && v)?.[1];
      if (texto) textos.push(texto);
    }
  }
  // Sus redacciones (las de quien escribe: cada redacción es de su autor).
  const q = supabase.from("redacciones").select("body").is("deleted_at", null).limit(400);
  const { data } = await (brandId ? q.eq("brand_id", brandId) : q.is("brand_id", null));
  for (const r of (data ?? []) as { body: string | null }[]) if (r.body) textos.push(r.body);
  return textos;
}

function textosDe(brandId: string | null) {
  const key = brandId ?? GENERAL;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < VIGENCIA) return hit.pedido ?? Promise.resolve(hit.textos);
  const pedido = leerTextos(brandId)
    .catch(() => [] as string[])
    .then((textos) => {
      cache.set(key, { textos, at: Date.now() });
      return textos;
    });
  cache.set(key, { textos: hit?.textos ?? [], at: Date.now(), pedido });
  return pedido;
}

/**
 * Texto predictivo con el vocabulario de un cliente: lo que ya se escribió para él (copys de sus
 * planis y redacciones) más `extra` (lo que está abierto ahora, que todavía no se guardó del todo).
 * Devuelve la función que el editor llama mientras se escribe.
 */
export function usePrediccion(brandId: string | null, extra: string[] = []) {
  const [textos, setTextos] = useState<string[]>(() => cache.get(brandId ?? GENERAL)?.textos ?? []);

  useEffect(() => {
    let vivo = true;
    textosDe(brandId).then((t) => vivo && setTextos(t));
    return () => {
      vivo = false;
    };
  }, [brandId]);

  const clave = extra.join("\u0000");
  const modelo = useMemo(
    () => entrenar([...textos, ...extra]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [textos, clave]
  );

  return useCallback((antes: string) => sugerir(modelo, antes), [modelo]);
}
