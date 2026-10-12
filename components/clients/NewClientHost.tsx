"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useNewClientRequest } from "./newClient";

// El diálogo (y Supabase con él) se descarga recién la primera vez que alguien lo abre.
const NewClientDialog = dynamic(() => import("./NewClientDialog").then((m) => m.NewClientDialog), { ssr: false });

/** El único diálogo de "Nuevo cliente" de la app. Se abre desde cualquier lado con openNewClient(). */
export function NewClientHost() {
  const request = useNewClientRequest();
  const [used, setUsed] = useState(false);
  useEffect(() => {
    if (request) setUsed(true);
  }, [request]);
  return used ? <NewClientDialog request={request} /> : null;
}
