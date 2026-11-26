"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Film, PenLine, Presentation, StickyNote } from "lucide-react";
import { ClientMark } from "@/components/clients/ClientMark";
import { useRedacciones } from "@/hooks/useRedacciones";
import { dondeDejaste, type UltimaPresentacion, type UltimaTarjeta, type UltimoBanner } from "@/lib/inicio/repo";
import type { Brand } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CAJA, Seccion, hace } from "./piezas";
import type { DatosInicio } from "./useInicio";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/**
 * Seguí donde dejaste: lo último que tocaste en cada herramienta (tu redacción, tu tarjeta, tu
 * presentación, tus banners), con un botón para volver justo ahí.
 */
export function Seguir({ d }: { d: DatosInicio }) {
  const redacciones = useRedacciones();
  const [ultimas, setUltimas] = useState<{ tarjeta: UltimaTarjeta | null; presentacion: UltimaPresentacion | null; banner: UltimoBanner | null } | null>(null);

  useEffect(() => {
    if (d.userId) dondeDejaste(d.userId).then(setUltimas);
  }, [d.userId]);

  const redaccion = redacciones.items.find((r) => r.body.trim() || r.titleEdited) ?? null;
  const marca = (id: string | null | undefined) => (id ? (d.marcaPorId.get(id) ?? null) : null);

  const tarjetas: ReactNode[] = [];
  if (redaccion)
    tarjetas.push(
      <Item
        key="redaccion"
        href={`/redaccion?abrir=${redaccion.id}`}
        icono={PenLine}
        herramienta="Redacción"
        titulo={redaccion.title || "Sin título"}
        texto={redaccion.body}
        cuando={redaccion.updatedAt}
        marca={marca(redaccion.brandId)}
      />
    );
  if (ultimas?.tarjeta)
    tarjetas.push(
      <Item
        key="tarjeta"
        href={`/tarjetas?abrir=${ultimas.tarjeta.id}`}
        icono={StickyNote}
        herramienta="Tarjetas"
        titulo={ultimas.tarjeta.title || "Tarjeta sin título"}
        texto={ultimas.tarjeta.content_text}
        cuando={ultimas.tarjeta.updated_at}
        marca={marca(ultimas.tarjeta.brand_id)}
      />
    );
  if (ultimas?.presentacion) {
    const p = ultimas.presentacion;
    const m = marca(p.brand_id);
    tarjetas.push(
      <Item
        key="presentacion"
        href={`/presentaciones/${p.id}`}
        icono={Presentation}
        herramienta="Presentaciones"
        titulo={p.titulo || `${m?.name ?? "Presentación"} · ${MESES[p.mes - 1]}`}
        texto={`${MESES[p.mes - 1][0].toUpperCase()}${MESES[p.mes - 1].slice(1)} ${p.anio}`}
        cuando={p.updated_at}
        marca={m}
      />
    );
  }
  if (ultimas?.banner)
    tarjetas.push(
      <Item
        key="banner"
        href="/gif"
        icono={Film}
        herramienta="GIF"
        titulo={`${ultimas.banner.cantidad} ${ultimas.banner.cantidad === 1 ? "banner exportado" : "banners exportados"}`}
        texto="Los frames no se guardan: para otra tanda, arrastralos de nuevo."
        cuando={ultimas.banner.creado}
      />
    );

  if (!tarjetas.length && ultimas) return null;
  return (
    <Seccion id="seguir" titulo="Seguí donde dejaste">
      {!ultimas && !redaccion ? (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-36 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">{tarjetas}</div>
      )}
    </Seccion>
  );
}

function Item({
  href,
  icono: Icono,
  herramienta,
  titulo,
  texto,
  cuando,
  marca,
}: {
  href: string;
  icono: typeof PenLine;
  herramienta: string;
  titulo: string;
  texto?: string;
  cuando: string;
  marca?: Brand | null;
}) {
  return (
    <Link href={href} className={cn(CAJA, "group flex min-h-[9.5rem] flex-col p-4 transition-colors hover:border-foreground/25")}>
      <span className="flex items-center gap-2 text-[12px] text-muted-foreground">
        <Icono className="h-3.5 w-3.5" /> {herramienta} · {hace(cuando)}
      </span>
      <span className="mt-2 line-clamp-2 font-display text-[1.45rem] leading-tight">{titulo}</span>
      {texto && <span className="mt-1 line-clamp-2 text-[13px] text-muted-foreground">{texto}</span>}
      <span className="mt-auto flex items-center justify-between gap-2 pt-3">
        {marca ? (
          <span className="flex min-w-0 items-center gap-1.5 text-[12px]">
            <ClientMark brand={marca} className="h-6 w-6 rounded-md text-[8px]" pad="p-[14%]" />
            <span className="truncate">{marca.name}</span>
          </span>
        ) : (
          <span />
        )}
        <span className="inline-flex items-center gap-1 text-[13px] font-semibold transition-transform group-hover:translate-x-0.5">
          Seguir <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </span>
    </Link>
  );
}
