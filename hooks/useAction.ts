"use client";

import { useCallback, useState } from "react";
import { toast } from "@/components/ui/toaster";

/**
 * Envuelve una operación contra la base: maneja el estado de "ocupado",
 * avisa si sale bien y muestra el error si falla. Evita repetir el mismo
 * try/catch en cada pestaña.
 */
export function useAction() {
  const [busy, setBusy] = useState(false);

  const run = useCallback(async (fn: () => Promise<unknown>, success?: string) => {
    setBusy(true);
    try {
      await fn();
      if (success) toast(success);
      return true;
    } catch (e) {
      toast(e instanceof Error ? e.message : "Algo falló", "error");
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  return { busy, run };
}
