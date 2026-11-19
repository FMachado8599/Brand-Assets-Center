"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount } from "@/components/shell/AccountProvider";
import { toast } from "@/components/ui/toaster";
import { planiErrorMessage, planiRepo } from "@/lib/plani/repo";
import type { Comentario } from "@/lib/plani/types";

/**
 * Los comentarios de una plani, del lado del estudio: los internos y los del cliente. Cada uno
 * comenta con su nombre; cualquiera del estudio puede marcar uno como resuelto. Se releen al
 * volver a la pestaña (el cliente comenta desde su link).
 */
export function useComentarios(planiId: string | null) {
  const account = useAccount();
  const [items, setItems] = useState<Comentario[]>([]);
  const [cargado, setCargado] = useState(false);

  const cargar = useCallback(async () => {
    if (!planiId) return;
    const { data, error } = await planiRepo.comentarios(planiId);
    if (!error) setItems(data ?? []);
    setCargado(true);
  }, [planiId]);

  useEffect(() => {
    cargar();
    window.addEventListener("focus", cargar);
    return () => window.removeEventListener("focus", cargar);
  }, [cargar]);

  const meta = (account?.user?.user_metadata ?? {}) as Record<string, unknown>;
  const nombre = [meta.full_name, meta.name].find((v): v is string => typeof v === "string" && !!v.trim()) ?? account?.user?.email ?? "Estudio";

  const comentar = useCallback(
    async (piezaId: string | null, texto: string, interno: boolean, extra?: { respuesta_a: string | null; menciones: string[] }) => {
      if (!planiId || !texto.trim()) return false;
      const { data, error } = await planiRepo.comentar({
        presentacion_id: planiId,
        pieza_id: piezaId,
        texto: texto.trim(),
        autor_nombre: nombre,
        interno,
        respuesta_a: extra?.respuesta_a ?? null,
        menciones: extra?.menciones ?? [],
      });
      if (error || !data) {
        toast(planiErrorMessage(error ?? { message: "No se pudo comentar" }), "error");
        return false;
      }
      setItems((prev) => [...prev, data]);
      return true;
    },
    [planiId, nombre]
  );

  const resolver = useCallback(async (id: string, resuelto: boolean) => {
    setItems((prev) => prev.map((c) => (c.id === id ? { ...c, resuelto } : c)));
    const { error } = await planiRepo.resolver(id, resuelto);
    if (error) toast(planiErrorMessage(error), "error");
  }, []);

  const borrar = useCallback(async (id: string) => {
    setItems((prev) => prev.filter((c) => c.id !== id));
    const { error } = await planiRepo.borrarComentario(id);
    if (error) toast(planiErrorMessage(error), "error");
  }, []);

  /** Por pieza (la clave "" son los generales de la plani). */
  const porPieza = useMemo(() => {
    const map = new Map<string, Comentario[]>();
    for (const c of items) {
      const k = c.pieza_id ?? "";
      map.set(k, [...(map.get(k) ?? []), c]);
    }
    return map;
  }, [items]);

  return { items, porPieza, cargado, comentar, resolver, borrar, yo: account?.user?.id ?? null, recargar: cargar };
}

export type ComentariosStore = ReturnType<typeof useComentarios>;
