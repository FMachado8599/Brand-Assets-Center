"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Grid3x3, LayoutGrid, List, Plus, Star, type LucideIcon } from "lucide-react";
import { MissingConfig } from "@/components/board/MissingConfig";
import { useData } from "@/components/data/DataProvider";
import { BarAction, BarButton, BarDivider, BarSearch, ContextBar } from "@/components/shell/ContextBar";
import { Hint } from "@/components/ui/tooltip";
import { useClients } from "@/hooks/useClients";
import { useFavoriteClients } from "@/hooks/useFavoriteClients";
import { useRedacciones } from "@/hooks/useRedacciones";
import { useStoredState } from "@/hooks/useStoredState";
import { fold } from "@/lib/redaccion/text";
import { hasSupabase } from "@/lib/supabase";
import type { Brand } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ClientMark } from "./ClientMark";
import { openNewClient } from "./newClient";
import { MigrationNotice } from "./profile/Section";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Cómo se ven los clientes: fichas con su resumen, compacta (solo logo y nombre) o lista. */
type View = "fichas" | "compacta" | "lista";

const VIEWS: { value: View; label: string; icon: LucideIcon }[] = [
  { value: "fichas", label: "Fichas", icon: LayoutGrid },
  { value: "compacta", label: "Compacta: más clientes a la vista", icon: Grid3x3 },
  { value: "lista", label: "Lista", icon: List },
];

const isView = (v: unknown): v is View => VIEWS.some((o) => o.value === v);

/** Lo que tiene a su nombre, para el resumen de cada uno. */
type Stats = [number, string, string][];

/**
 * Clientes: todos de un vistazo, con su logo y sus colores. Cada uno abre su
 * ficha, donde está todo lo que tiene a su nombre. Los favoritos (de cada uno)
 * van primero, aparte.
 */
export function ClientsShell() {
  const router = useRouter();
  const { clients, loading, hasProfile } = useClients();
  const { cards, products } = useData();
  const redacciones = useRedacciones();
  const favorites = useFavoriteClients();
  const [storedView, setView, viewLoaded] = useStoredState<View>("clientes:vista", "fichas");
  const view = isView(storedView) ? storedView : "fichas";
  const viewIndex = VIEWS.findIndex((v) => v.value === view);
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

  const statsOf = (client: Brand): Stats => [
    [client.logos?.length ?? 0, "logo", "logos"],
    [counts.cards.get(client.id) ?? 0, "tarjeta", "tarjetas"],
    [counts.products.get(client.id) ?? 0, "producto", "productos"],
    [client.font_families?.length ?? 0, "tipografía", "tipografías"],
    [counts.redacciones.get(client.id) ?? 0, "redacción tuya", "redacciones tuyas"],
  ];

  const q = fold(query.trim());
  const visible = q ? clients.filter((c) => fold(c.name).includes(q)) : clients;
  const starred = visible.filter((c) => favorites.has(c.id));
  const rest = visible.filter((c) => !favorites.has(c.id));

  // Desde la lista, el cliente recién creado se abre: lo que sigue es completar su ficha.
  const create = (name?: string) => openNewClient({ name, onCreated: (b) => router.push(`/clientes/${b.id}`) });

  if (!hasSupabase) return <MissingConfig />;

  const layout = (list: Brand[], withNew: boolean) => (
    <Layout view={view}>
      {list.map((client) => (
        <ClientItem
          key={client.id}
          view={view}
          client={client}
          stats={statsOf(client)}
          favorite={favorites.has(client.id)}
          onFavorite={() => favorites.toggle(client.id)}
        />
      ))}
      {withNew && <NewItem view={view} onClick={() => create()} />}
    </Layout>
  );

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
        <div role="group" aria-label="Cómo se ven los clientes" className="hidden shrink-0 items-center gap-0.5 sm:flex">
          {VIEWS.map((v) => (
            <BarButton key={v.value} label={v.label} icon={v.icon} pressed={view === v.value} onClick={() => setView(v.value)} />
          ))}
        </div>
        {/* En el celular no entran los tres: uno solo, que pasa a la vista siguiente. */}
        <BarButton
          className="sm:hidden"
          label={`Vista: ${VIEWS[viewIndex].label.split(":")[0]} · cambiar a ${VIEWS[(viewIndex + 1) % VIEWS.length].label.split(":")[0].toLowerCase()}`}
          icon={VIEWS[viewIndex].icon}
          onClick={() => setView(VIEWS[(viewIndex + 1) % VIEWS.length].value)}
        />
        <BarDivider />
        <BarAction label="Nuevo cliente" icon={Plus} onClick={() => create()} />
      </ContextBar>

      <main className="mx-auto max-w-5xl px-4 pb-16 pt-[5.5rem] sm:px-6">
        <h1 className="sr-only">Clientes</h1>

        {hasProfile === false && <MigrationNotice className="mb-6" />}

        {/* Hasta leer la vista y los favoritos guardados: si no, la lista salta apenas carga. */}
        {loading || !viewLoaded || !favorites.loaded ? (
          <Layout view={view}>
            {Array.from({ length: view === "compacta" ? 12 : 8 }, (_, i) => (
              <SkeletonItem key={i} view={view} />
            ))}
          </Layout>
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
          <div className="grid gap-9">
            {starred.length > 0 && (
              <Group
                title={
                  <>
                    <Star className="h-3 w-3 fill-primary text-primary" /> Favoritos
                  </>
                }
              >
                {layout(starred, false)}
              </Group>
            )}
            {rest.length > 0 || !q ? (
              <Group title={starred.length ? "Todos los clientes" : null}>{layout(rest, !q)}</Group>
            ) : null}
          </div>
        )}
      </main>
    </>
  );
}

function Group({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section>
      {title && <h2 className="eyebrow mb-3 flex items-center gap-1.5">{title}</h2>}
      {children}
    </section>
  );
}

/** La grilla (o la lista) de cada vista. Las fichas, más angostas que antes: el logo va cuadrado. */
function Layout({ view, children }: { view: View; children: ReactNode }) {
  if (view === "lista") {
    return (
      <ul className="overflow-hidden rounded-[1.5rem] border border-black/[0.06] bg-card shadow-[0_1px_2px_hsl(40_30%_20%/0.04)]">
        {children}
      </ul>
    );
  }
  return (
    <ul
      className={cn(
        "grid",
        view === "fichas" ? "grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4" : "grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7"
      )}
    >
      {children}
    </ul>
  );
}

function ClientItem({
  view,
  client,
  stats,
  favorite,
  onFavorite,
}: {
  view: View;
  client: Brand;
  stats: Stats;
  favorite: boolean;
  onFavorite: () => void;
}) {
  const href = `/clientes/${client.id}`;
  const summary = stats.filter(([n]) => n > 0).map(([n, one, many]) => plural(n, one, many));
  const palette = client.palette?.length ? client.palette.map((c) => c.hex) : [client.color];
  const star = <FavoriteButton name={client.name} favorite={favorite} onClick={onFavorite} small={view === "compacta"} />;

  if (view === "lista") {
    return (
      <li className="group relative flex items-center border-b border-black/[0.06] last:border-b-0">
        <span className="pl-2 sm:pl-3">{star}</span>
        <Link href={href} className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-2 pr-4 transition-colors hover:bg-secondary/40">
          {/* Sin photoPad: un padding en % se mide contra el ancho de la fila, no del recuadro. */}
          <ClientMark brand={client} className="h-11 w-11 rounded-xl text-sm" pad="p-[14%]" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold">{client.name}</span>
            <span className={cn("block truncate text-xs text-muted-foreground", !summary.length && "italic")}>
              {summary.length ? summary.join(" · ") : "Ficha por completar"}
            </span>
          </span>
          <span aria-hidden className="hidden shrink-0 items-center gap-1 sm:flex">
            {palette.slice(0, 6).map((hex, i) => (
              <span key={`${hex}-${i}`} className="h-4 w-4 rounded-full ring-1 ring-inset ring-black/10" style={{ background: hex }} />
            ))}
          </span>
          <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition-[transform,color] duration-300 group-hover:rotate-45 group-hover:text-foreground" />
        </Link>
      </li>
    );
  }

  if (view === "compacta") {
    return (
      <li className="group relative">
        <Link href={href} title={client.name} className="flex flex-col gap-1.5 rounded-2xl p-1.5 transition-colors hover:bg-card/80">
          <ClientMark
            brand={client}
            className="aspect-square w-full rounded-xl text-[clamp(1.25rem,3.2vw,1.75rem)]"
            pad="p-[16%]"
            photoPad="p-[10%]"
          />
          <span className="truncate px-0.5 text-center text-xs font-medium">{client.name}</span>
        </Link>
        <span className="absolute right-2.5 top-2.5">{star}</span>
      </li>
    );
  }

  return (
    <li className="group relative">
      <Link
        href={href}
        className="flex h-full flex-col overflow-hidden rounded-[1.5rem] border border-black/[0.06] bg-card shadow-[0_1px_2px_hsl(40_30%_20%/0.04)] transition-[transform,box-shadow] duration-300 ease-smooth hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-24px_hsl(40_45%_20%/0.45)]"
      >
        <ClientMark brand={client} className="aspect-square w-full text-[clamp(2.25rem,5vw,3.25rem)]" pad="p-[16%]" photoPad="p-[12%]" />
        <span aria-hidden className="flex h-1.5">
          {palette.map((hex, i) => (
            <span key={`${hex}-${i}`} className="flex-1" style={{ background: hex }} />
          ))}
        </span>
        <span className="flex items-start gap-2 p-3.5">
          <span className="min-w-0 flex-1">
            <span className="block truncate font-display text-[1.45rem] leading-tight">{client.name}</span>
            <span className={cn("mt-0.5 block truncate text-xs text-muted-foreground", !summary.length && "italic")}>
              {summary.length ? summary.slice(0, 2).join(" · ") : "Ficha por completar"}
            </span>
          </span>
          <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-[transform,color] duration-300 group-hover:rotate-45 group-hover:text-foreground" />
        </span>
      </Link>
      <span className="absolute right-3 top-3">{star}</span>
    </li>
  );
}

/** La estrella: marca o desmarca el favorito. Sin marcar, en compu aparece al pasar el mouse. */
function FavoriteButton({ name, favorite, onClick, small }: { name: string; favorite: boolean; onClick: () => void; small?: boolean }) {
  const label = favorite ? `Quitar ${name} de favoritos` : `Agregar ${name} a favoritos`;
  return (
    <Hint label={favorite ? "Quitar de favoritos" : "Agregar a favoritos"}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={favorite}
        onClick={onClick}
        className={cn(
          "grid place-items-center rounded-full transition-[opacity,background-color,transform] hover:scale-105 focus-visible:opacity-100",
          small ? "h-6 w-6" : "h-8 w-8",
          favorite
            ? "bg-primary text-primary-foreground shadow-sm"
            : "bg-black/10 text-foreground/70 backdrop-blur-sm hover:bg-black/20 hover:text-foreground sm:opacity-0 sm:group-hover:opacity-100"
        )}
      >
        <Star className={cn(small ? "h-3 w-3" : "h-4 w-4", favorite && "fill-current")} />
      </button>
    </Hint>
  );
}

function NewItem({ view, onClick }: { view: View; onClick: () => void }) {
  if (view === "lista") {
    return (
      <li>
        <button
          type="button"
          onClick={onClick}
          className="flex w-full items-center gap-3 py-2.5 pl-[3.25rem] pr-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary/40 hover:text-foreground sm:pl-[3.5rem]"
        >
          <span className="grid h-11 w-11 place-items-center rounded-xl border-2 border-dashed border-foreground/15">
            <Plus className="h-4 w-4" />
          </span>
          Nuevo cliente
        </button>
      </li>
    );
  }
  const compact = view === "compacta";
  return (
    <li className={cn(compact && "p-1.5")}>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "group flex w-full flex-col items-center justify-center gap-2 border-2 border-dashed border-foreground/15 text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground",
          compact ? "aspect-square rounded-xl" : "h-full min-h-[12rem] rounded-[1.5rem]"
        )}
      >
        <span
          className={cn(
            "grid place-items-center rounded-full bg-secondary transition-colors group-hover:bg-primary group-hover:text-primary-foreground",
            compact ? "h-8 w-8" : "h-11 w-11"
          )}
        >
          <Plus className={compact ? "h-4 w-4" : "h-5 w-5"} />
        </span>
        <span className={cn("font-medium", compact ? "text-xs" : "text-sm")}>Nuevo cliente</span>
      </button>
    </li>
  );
}

function SkeletonItem({ view }: { view: View }) {
  if (view === "lista") {
    return (
      <li className="flex items-center gap-3 border-b border-black/[0.06] px-4 py-2.5 last:border-b-0">
        <span className="skeleton h-11 w-11 rounded-xl" />
        <span className="flex-1 space-y-1.5">
          <span className="skeleton block h-4 w-1/3 rounded-full" />
          <span className="skeleton block h-3 w-1/4 rounded-full" />
        </span>
      </li>
    );
  }
  if (view === "compacta") {
    return (
      <li className="flex flex-col gap-1.5 p-1.5">
        <span className="skeleton aspect-square rounded-xl" />
        <span className="skeleton mx-auto block h-3 w-2/3 rounded-full" />
      </li>
    );
  }
  return (
    <li className="overflow-hidden rounded-[1.5rem] bg-card/70">
      <span className="skeleton block aspect-square" />
      <span className="block space-y-2 p-3.5">
        <span className="skeleton block h-5 w-1/2 rounded-full" />
        <span className="skeleton block h-3 w-1/3 rounded-full" />
      </span>
    </li>
  );
}
