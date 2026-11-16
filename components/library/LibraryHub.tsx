"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LAST_LIBRARY_KEY, LIBRARIES } from "@/lib/modules";

/** /library: abre la última librería que se usó en este navegador (o Emojis), y ahí se cambia desde la barra. */
export function LibraryHub() {
  const router = useRouter();
  useEffect(() => {
    let last: string | null = null;
    try {
      last = localStorage.getItem(LAST_LIBRARY_KEY);
    } catch {
      /* sin almacenamiento */
    }
    const target = LIBRARIES.find((l) => l.href === last) ?? LIBRARIES[0];
    router.replace(target.href);
  }, [router]);
  return null;
}
