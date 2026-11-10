"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { LayoutGrid } from "lucide-react";
import { BarButton, BarDivider, BarSegmented, ContextBar } from "@/components/shell/ContextBar";
import { juego, JUEGOS, type JuegoId } from "@/lib/rest/juegos";

/** La página de un juego: en la barra se cambia de juego (y lo que sume cada uno); al costado, el ranking. */
export function JuegoShell({
  actual,
  barra,
  ranking,
  children,
}: {
  actual: JuegoId;
  barra?: ReactNode;
  ranking: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();
  const info = juego(actual);
  return (
    <>
      <ContextBar>
        <BarButton label="Todos los juegos" icon={LayoutGrid} onClick={() => router.push("/rest")} />
        <BarDivider />
        <BarSegmented
          label="Juego"
          value={actual}
          onChange={(id) => router.push(juego(id).href)}
          options={JUEGOS.map((j) => ({ value: j.id, label: j.nombre }))}
        />
        {barra && (
          <>
            <BarDivider />
            {barra}
          </>
        )}
      </ContextBar>

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-[6.5rem] sm:px-6">
        <header className="mb-6">
          <p className="eyebrow">Rest</p>
          <h1 className="mt-2 font-display text-5xl leading-none tracking-[-0.01em] sm:text-6xl">{info.nombre}</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">{info.bajada}</p>
        </header>

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_21rem]">
          <div className="min-w-0">
            {children}
            <p className="mt-3 text-xs text-muted-foreground">{info.controles}</p>
          </div>
          <aside>{ranking}</aside>
        </div>
      </main>
    </>
  );
}
