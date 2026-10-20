"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { buscar, indexar, textosParaEntrenar, type FuenteMaterial } from "@/lib/redaccion/material";

/** El repositorio se carga recién cuando hace falta (Redacción no carga Supabase de entrada). */
const loadRepo = () => import("@/lib/repos/materials").then((m) => m.materialsRepo);

/** Lo ya leído de cada cliente, por unos minutos: abrir otra redacción no vuelve a pedir todo. */
const cache = new Map<string, { fuentes: FuenteMaterial[]; at: number; pedido?: Promise<FuenteMaterial[]> }>();
const VIGENCIA = 5 * 60_000;

async function leer(brandId: string): Promise<FuenteMaterial[]> {
  const repo = await loadRepo();
  const { data } = await repo.textsForAI(brandId);
  return (data ?? [])
    .map((m) => ({ id: m.id, nombre: m.name, nota: m.note ?? "", texto: m.text_content ?? "" }))
    .filter((f) => f.texto.trim() || f.nota.trim());
}

function fuentesDe(brandId: string) {
  const hit = cache.get(brandId);
  if (hit && Date.now() - hit.at < VIGENCIA) return hit.pedido ?? Promise.resolve(hit.fuentes);
  const pedido = leer(brandId)
    .catch(() => [] as FuenteMaterial[])
    .then((fuentes) => {
      cache.set(brandId, { fuentes, at: Date.now() });
      return fuentes;
    });
  cache.set(brandId, { fuentes: hit?.fuentes ?? [], at: Date.now(), pedido });
  return pedido;
}

/** Hay que volver a leer el material de un cliente (se sumó, cambió o se borró algo en su ficha). */
export function invalidarMaterialMarca(brandId: string) {
  cache.delete(brandId);
}

/**
 * Lo que la IA sabe de la marca por el material que se subió a la ficha del cliente: los textos de
 * sus documentos y presentaciones y las notas de cada archivo. `buscar` devuelve los pasajes que
 * vienen al caso con lo que se está escribiendo y `textos` entrena al texto predictivo.
 */
export function useMaterialMarca(brandId: string | null) {
  const [leido, setLeido] = useState<{ brandId: string; fuentes: FuenteMaterial[] } | null>(null);

  useEffect(() => {
    if (!brandId) return;
    let vivo = true;
    const previo = cache.get(brandId)?.fuentes;
    if (previo) setLeido({ brandId, fuentes: previo });
    fuentesDe(brandId).then((fuentes) => vivo && setLeido({ brandId, fuentes }));
    return () => {
      vivo = false;
    };
  }, [brandId]);

  // Lo leído de otro cliente no se usa: al cambiar de cliente, hasta que llega lo nuevo, no hay material.
  const fuentes = useMemo(() => (leido && leido.brandId === brandId ? leido.fuentes : []), [leido, brandId]);
  const indice = useMemo(() => indexar(fuentes), [fuentes]);
  const textos = useMemo(() => textosParaEntrenar(fuentes), [fuentes]);
  const buscarPasajes = useCallback((antes: string) => buscar(indice, antes), [indice]);

  return { textos, buscar: buscarPasajes, cantidad: fuentes.length };
}
