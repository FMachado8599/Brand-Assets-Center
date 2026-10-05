"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Avisa al servidor cada vez que se abre una página (también al navegar sin
 * recargar). El servidor anota la visita como invitado o con la cuenta de la
 * sesión: el cliente nunca dice quién es.
 */
export function VisitTracker() {
  const pathname = usePathname();
  const last = useRef("");

  useEffect(() => {
    // En desarrollo React monta dos veces: que no cuente doble.
    if (last.current === pathname) return;
    last.current = pathname;
    fetch("/api/visits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: pathname, referrer: document.referrer || null }),
      keepalive: true,
    }).catch(() => {});
  }, [pathname]);

  return null;
}
