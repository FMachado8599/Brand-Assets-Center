"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BarDivider, BarSegmented } from "@/components/shell/ContextBar";
import { LAST_LIBRARY_KEY, LIBRARIES } from "@/lib/modules";

/**
 * Lo primero de la barra en cada librería: para pasar de Emojis a GIFs o a Íconos sin abrir la sidebar.
 * Cada librería tiene su ruta (/library/…); esto solo navega. Recuerda la última, que es la que abre /library.
 */
export function LibrarySwitcher() {
  const pathname = usePathname();
  const router = useRouter();
  const current = LIBRARIES.find((l) => pathname.startsWith(l.href))?.href ?? LIBRARIES[0].href;

  useEffect(() => {
    try {
      localStorage.setItem(LAST_LIBRARY_KEY, current);
    } catch {
      /* sin almacenamiento */
    }
  }, [current]);

  return (
    <>
      <BarSegmented
        label="Librería"
        value={current}
        onChange={(href) => href !== current && router.push(href)}
        options={LIBRARIES.map((l) => ({ value: l.href, label: l.label, icon: l.icon }))}
      />
      <BarDivider />
    </>
  );
}
