"use client";

import { useEffect, useState } from "react";
import { useAccount } from "@/components/shell/AccountProvider";
import { supabase } from "@/lib/supabase";

/**
 * Si quien entró es admin de la app (es_admin, de migracion-equipo.sql). Para mostrar lo que es solo
 * de admins fuera del Board (los Ajustes de la sidebar) sin leer todo el equipo en cada página: se
 * pregunta una vez por cuenta y se recuerda mientras la pestaña está abierta. La base igual protege
 * cada cosa; esto solo decide qué se muestra.
 */
const cache = new Map<string, Promise<boolean>>();

function preguntar(userId: string) {
  let p = cache.get(userId);
  if (!p) {
    p = Promise.resolve(supabase.rpc("es_admin")).then(
      ({ data, error }) => !error && data === true,
      () => false
    );
    cache.set(userId, p);
  }
  return p;
}

export function useEsAdmin() {
  const account = useAccount();
  const userId = account?.user?.id ?? null;
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    if (!userId) {
      setAdmin(false);
      return;
    }
    let vivo = true;
    preguntar(userId).then((v) => vivo && setAdmin(v));
    return () => {
      vivo = false;
    };
  }, [userId]);
  return admin;
}
