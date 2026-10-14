"use client";

import { useEffect } from "react";
import { toast } from "@/components/ui/toaster";
import { refreshIntegraciones } from "@/hooks/useIntegraciones";

/**
 * Al volver de conectar Basecamp o Google, la URL trae el resultado (?basecamp=conectado,
 * ?google=error&motivo=…): se avisa y se limpia la URL.
 */
export function useOAuthResult(onConectado?: (proveedor: "basecamp" | "google") => void) {
  useEffect(() => {
    const url = new URL(window.location.href);
    let tocado = false;
    for (const proveedor of ["basecamp", "google"] as const) {
      const r = url.searchParams.get(proveedor);
      if (!r) continue;
      tocado = true;
      const nombre = proveedor === "basecamp" ? "Basecamp" : "el Drive";
      if (r === "conectado") {
        toast(`Listo: ${nombre} quedó conectado`);
        onConectado?.(proveedor);
      } else toast(`No se pudo conectar ${nombre}: ${url.searchParams.get("motivo") ?? "error"}`, "error");
      url.searchParams.delete(proveedor);
    }
    if (tocado) {
      url.searchParams.delete("motivo");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
      refreshIntegraciones();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
