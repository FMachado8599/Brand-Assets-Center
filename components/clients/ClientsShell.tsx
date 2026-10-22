"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Plus } from "lucide-react";
import { MissingConfig } from "@/components/board/MissingConfig";
import { useData } from "@/components/data/DataProvider";
import { BarAction, BarDivider, BarSearch, ContextBar } from "@/components/shell/ContextBar";
import { useClients } from "@/hooks/useClients";
import { useRedacciones } from "@/hooks/useRedacciones";
import { fold } from "@/lib/redaccion/text";
import { hasSupabase } from "@/lib/supabase";
import type { Brand } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ClientMark } from "./ClientMark";
import { openNewClient } from "./newClient";
import { MigrationNotice } from "./profile/Section";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Clientes: todos de un vistazo, con su logo y sus colores. Cada uno abre su
 * ficha, donde está todo lo que tiene a su nombre.
 */
export function ClientsShell() {
  const router = useRouter();
  const { clients, loading, hasProfile } = useClients();
  const { cards, products } = useData();
  const redacciones = useRedacciones();
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const tally = (ids: (string | null)[]) => {
      const map = new Map<string, number>();
      ids.forEach((id) => id && map.set(id, (map.get(id) ?? 0) + 1));
      return map;
    };
    return {
      cards: tally(cards.map((c) => c.brand_id)),
      products: tally(products.map((p) => p.brand_id)),
      redacciones: tally(redacciones.items.map((r) => r.brandId)),
    };
  }, [cards, products, redacciones.items]);

  const q = fold(query.trim());
  const visible = q ? clients.filter((c) => fold(c.name).includes(q)) : clients;

  // Desde la lista, el cliente recién creado se abre: lo que sigue es completar su ficha.
  const create = (name?: string) => openNewClient({ name, onCreated: (b) => router.push(`/clientes/${b.id}`) });

  if (!hasSupabase) return <MissingConfig />;

  return (
    <>
      <ContextBar>
        <BarSearch
          value={query}
          onChange={setQuery}
          placeholder={clients.length ? `Buscar en ${clients.length} clientes…` : "Buscar cliente…"}
          onEnter={() => visible.length === 1 && router.push(`/clientes/${visible[0].id}`)}
        />
        <BarDivider />
        <BarAction label="Nuevo cliente" icon={Plus} onClick={() => create()} />
      </ContextBar>

      <main className="mx-auto max-w-7xl px-4 pb-16 pt-[5.5rem] sm:px-6">
        <h1 className="sr-only">Clientes</h1>

        {hasProfile === false && <MigrationNotice className="mb-6" />}

        {loading ? (
          <Grid>
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="overflow-hidden rounded-[1.5rem] bg-card/70">
                <div className="skeleton aspect-[16/10]" />
                <div className="space-y-2 p-4">
                  <span className="skeleton block h-6 w-1/2 rounded-full" />
                  <span className="skeleton block h-3 w-1/3 rounded-full" />
                </div>
              </div>
            ))}
          </Grid>
        ) : !clients.length ? (
          <div className="mx-auto flex max-w-md flex-col items-center py-20 text-center">
            <p className="eyebrow">Clientes</p>
            <h2 className="mt-3 font-display text-4xl leading-tight">Todavía no hay clientes</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Cada cliente junta su logo, sus colores, sus tipografías y todo lo que se hace para él en Tarjetas y Redacción.
            </p>
            <button
              type="button"
              onClick={() => create()}
              className="mt-6 flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-95"
            >
              <Plus className="h-4 w-4" /> Crear el primero
            </button>
          </div>
        ) : !visible.length ? (
          <div className="py-20 text-center">
            <p className="text-sm text-muted-foreground">Ningún cliente se llama “{query.trim()}”.</p>
            <button
              type="button"
              onClick={() => create(query.trim())}
              className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-full border bg-card px-4 text-sm font-medium shadow-sm transition-colors hover:bg-secondary"
            >
              <Plus className="h-4 w-4" /> Crear “{query.trim()}”
            </button>
          </div>
        ) : (
          <Grid>
            {visible.map((client) => (
              <ClientCard
                key={client.id}
                client={client}
                stats={[
                  [counts.cards.get(client.id) ?? 0, "tarjeta", "tarjetas"],
                  [counts.products.get(client.id) ?? 0, "producto", "productos"],
                  [client.font_families?.length ?? 0, "tipografía", "tipografías"],
                  [counts.redacciones.get(client.id) ?? 0, "redacción tuya", "redacciones tuyas"],
                ]}
              />
            ))}
            {!q && (
              <button
                type="button"
                onClick={() => create()}
                className="group flex min-h-[14rem] flex-col items-center justify-center gap-2 rounded-[1.5rem] border-2 border-dashed border-foreground/15 text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
              >
                <span className="grid h-11 w-11 place-items-center rounded-full bg-secondary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <Plus className="h-5 w-5" />
                </span>
                <span className="text-sm font-medium">Nuevo cliente</span>
              </button>
            )}
          </Grid>
        )}
      </main>
    </>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{children}</div>;
}

function ClientCard({ client, stats }: { client: Brand; stats: [number, string, string][] }) {
  const palette = client.palette?.length ? client.palette.map((c) => c.hex) : [client.color];
  const summary = stats.filter(([n]) => n > 0).map(([n, one, many]) => plural(n, one, many));

  return (
    <Link
      href={`/clientes/${client.id}`}
      className="group flex flex-col overflow-hidden rounded-[1.5rem] border border-black/[0.06] bg-card shadow-[0_1px_2px_hsl(40_30%_20%/0.04)] transition-[transform,box-shadow] duration-300 ease-smooth hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-24px_hsl(40_45%_20%/0.45)]"
    >
      <ClientMark brand={client} className="aspect-[16/10] w-full text-[clamp(2.5rem,6vw,3.5rem)]" pad="p-[12%]" photoPad="p-[8%]" />
      <div aria-hidden className="flex h-1.5">
        {palette.map((hex, i) => (
          <span key={`${hex}-${i}`} className="flex-1" style={{ background: hex }} />
        ))}
      </div>
      <div className="flex items-start gap-2 p-4">
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-display text-[1.75rem] leading-tight">{client.name}</h2>
          <p className={cn("mt-0.5 truncate text-xs text-muted-foreground", !summary.length && "italic")}>
            {summary.length ? summary.slice(0, 3).join(" · ") : "Ficha por completar"}
          </p>
        </div>
        <ArrowUpRight className="mt-1.5 h-5 w-5 shrink-0 text-muted-foreground transition-[transform,color] duration-300 group-hover:rotate-45 group-hover:text-foreground" />
      </div>
    </Link>
  );
}
