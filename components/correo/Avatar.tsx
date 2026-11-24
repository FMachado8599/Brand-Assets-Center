"use client";

import { useState } from "react";
import type { Contacto } from "@/lib/correo/contactos";
import { nombreDireccion, type Direccion } from "@/lib/correo/types";
import { cn } from "@/lib/utils";

/** El color de la inicial sale del mail: la misma persona tiene siempre el mismo. */
function tono(email: string) {
  let h = 0;
  for (const c of email) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 55% 82%)`;
}

/**
 * La cara de quien manda (o recibe) un mail: su foto, si la app la conoce (perfil, asignada o Basecamp),
 * o un círculo con su inicial. El tamaño lo da quien lo usa (className).
 */
export function Avatar({ d, contacto, className }: { d?: Direccion; contacto?: Contacto | null; className?: string }) {
  const [rota, setRota] = useState<string | null>(null);
  const foto = contacto?.foto && contacto.foto !== rota ? contacto.foto : null;
  const base = "grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full";

  if (foto) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={foto}
        alt=""
        aria-hidden
        draggable={false}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setRota(foto)}
        className={cn(base, "bg-black/[0.06] object-cover", className)}
      />
    );
  }

  const texto = contacto?.nombre || (d ? nombreDireccion(d) : "?");
  return (
    <span aria-hidden className={cn(base, "text-[15px] font-semibold text-ink", className)} style={{ background: tono(d?.email ?? "") }}>
      {texto.replace(/^["'\s]+/, "").charAt(0).toUpperCase() || "?"}
    </span>
  );
}
