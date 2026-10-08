"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, FileText, Plus, Search, Trash2 } from "lucide-react";
import { Hint } from "@/components/ui/tooltip";
import { fold, fullDate, timeAgo } from "@/lib/redaccion/text";
import type { BrandLite, Redaccion } from "@/lib/redaccion/types";
import { cn } from "@/lib/utils";

/** La hora actual, refrescada cada tanto: "hace 5 min" no se queda congelado. */
function useNow(every = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(timer);
  }, [every]);
  return now;
}

type Tab = "recientes" | "clientes";
const TAB_KEY = "redaccion:lista";
/** Clave del grupo "sin cliente" (los ids de cliente son uuid: no choca). */
const NONE = "sin-cliente";

type Props = {
  /** De la más nueva a la más vieja. */
  items: Redaccion[];
  brands: BrandLite[];
  currentId: string | null;
  onOpen: (id: string) => void;
  onDelete: (item: Redaccion) => void;
  /** Empezar una redacción nueva para ese cliente (null: sin cliente). */
  onNewFor: (brandId: string | null) => void;
  className?: string;
};

/**
 * La columna de la izquierda, en dos pestañas:
 *  - Recientes: todas las redacciones, de la más nueva a la más vieja.
 *  - Clientes: las mismas, agrupadas por cliente (el que tiene la más nueva, arriba).
 *    Se filtra escribiendo el nombre o tocando un cliente para ver solo las suyas.
 */
export function RecentList({ items, brands, currentId, onOpen, onDelete, onNewFor, className }: Props) {
  const now = useNow();
  const [tab, setTab] = useState<Tab>("recientes");
  const [query, setQuery] = useState("");
  /** Cliente abierto en la pestaña Clientes (solo sus redacciones). */
  const [only, setOnly] = useState<string | null>(null);
  const byId = useMemo(() => new Map(brands.map((b) => [b.id, b])), [brands]);

  useEffect(() => {
    try {
      if (localStorage.getItem(TAB_KEY) === "clientes") setTab("clientes");
    } catch {
      /* sin almacenamiento */
    }
  }, []);

  const changeTab = (next: Tab) => {
    setTab(next);
    setQuery("");
    try {
      localStorage.setItem(TAB_KEY, next);
    } catch {
      /* sin almacenamiento */
    }
  };

  const q = fold(query.trim());

  const recents = useMemo(() => {
    if (!q) return items;
    return items.filter((r) => fold(`${r.title}\n${r.body}\n${byId.get(r.brandId ?? "")?.name ?? ""}`).includes(q));
  }, [items, q, byId]);

  /** Cada cliente con sus redacciones; primero el que tiene la más nueva, y al final los que no tienen ninguna. */
  const groups = useMemo(() => {
    const byClient = new Map<string, Redaccion[]>();
    for (const r of items) {
      // Un cliente que ya no existe (o que todavía no cargó) va a "Sin cliente" solo si no hay lista de clientes.
      const key = r.brandId && (byId.has(r.brandId) || !brands.length) ? r.brandId : NONE;
      byClient.set(key, [...(byClient.get(key) ?? []), r]);
    }
    const list = [
      ...brands.map((b) => ({ key: b.id, name: b.name, color: b.color as string | null, items: byClient.get(b.id) ?? [] })),
      ...(byClient.has(NONE) ? [{ key: NONE, name: "Sin cliente", color: null, items: byClient.get(NONE)! }] : []),
    ];
    const newest = (g: (typeof list)[number]) => g.items[0]?.updatedAt ?? "";
    return list
      .filter((g) => !q || fold(g.name).includes(q))
      .sort((a, b) => (newest(a) < newest(b) ? 1 : newest(a) > newest(b) ? -1 : a.name.localeCompare(b.name)));
  }, [items, brands, byId, q]);

  const opened = only ? groups.find((g) => g.key === only) ?? null : null;

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div role="tablist" aria-label="Listas" className="mb-2 flex shrink-0 gap-0.5 rounded-full bg-secondary/80 p-0.5">
        {(
          [
            ["recientes", "Recientes", items.length],
            ["clientes", "Clientes", brands.length],
          ] as const
        ).map(([value, label, count]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => changeTab(value)}
            className={cn(
              "flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground",
              tab === value && "bg-card text-foreground shadow-sm"
            )}
          >
            {label}
            {count > 0 && <span className="text-[11px] tabular-nums text-muted-foreground">{count}</span>}
          </button>
        ))}
      </div>

      {(tab === "recientes" ? items.length > 4 : !opened) && (
        <label className="relative mb-2 flex h-8 shrink-0 items-center">
          <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && query) {
                e.stopPropagation();
                setQuery("");
              }
            }}
            placeholder={tab === "recientes" ? "Buscar redacciones…" : "Filtrar clientes…"}
            aria-label={tab === "recientes" ? "Buscar redacciones" : "Filtrar clientes"}
            className="h-8 w-full rounded-full bg-secondary/70 pl-8 pr-3 text-[13px] outline-none placeholder:text-muted-foreground focus:bg-secondary focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60 focus-visible:ring-offset-0"
          />
        </label>
      )}

      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 pb-1">
        {tab === "recientes" ? (
          items.length === 0 ? (
            <Empty>Todavía no hay redacciones. Lo que escribas se guarda solo y aparece acá.</Empty>
          ) : recents.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">Nada coincide con “{query.trim()}”.</p>
          ) : (
            <ul className="space-y-0.5">
              {recents.map((r) => (
                <Row key={r.id} item={r} client={clientOf(r, byId)} showClient now={now} active={r.id === currentId} onOpen={onOpen} onDelete={onDelete} />
              ))}
            </ul>
          )
        ) : opened ? (
          <section>
            <div className="mb-1 flex items-center gap-1">
              <button
                type="button"
                onClick={() => setOnly(null)}
                className="flex h-8 items-center gap-1 rounded-full pl-1.5 pr-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <ChevronLeft className="h-4 w-4" /> Clientes
              </button>
            </div>
            <GroupHeader group={opened} onNew={() => onNewFor(opened.key === NONE ? null : opened.key)} />
            <GroupItems group={opened} now={now} currentId={currentId} onOpen={onOpen} onDelete={onDelete} />
          </section>
        ) : groups.length === 0 ? (
          brands.length === 0 && !items.length ? (
            <Empty>Todavía no hay clientes. Se agregan en Tarjetas → Ajustes → Marcas.</Empty>
          ) : (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">Ningún cliente se llama “{query.trim()}”.</p>
          )
        ) : (
          <div className="space-y-3">
            {groups.map((g) => (
              <section key={g.key}>
                <GroupHeader group={g} onOpen={() => setOnly(g.key)} onNew={() => onNewFor(g.key === NONE ? null : g.key)} />
                {g.items.length > 0 && (
                  <GroupItems group={g} limit={4} now={now} currentId={currentId} onOpen={onOpen} onDelete={onDelete} onMore={() => setOnly(g.key)} />
                )}
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

type Group = { key: string; name: string; color: string | null; items: Redaccion[] };

function clientOf(r: Redaccion, byId: Map<string, BrandLite>) {
  if (!r.brandId) return { name: "Sin cliente", color: null };
  const b = byId.get(r.brandId);
  // Con cliente pero sin encontrarlo (todavía cargan, o lo borraron): no se muestra nada.
  return b ? { name: b.name, color: b.color } : null;
}

function GroupHeader({ group, onOpen, onNew }: { group: Group; onOpen?: () => void; onNew: () => void }) {
  const title = (
    <>
      <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10" style={{ background: group.color ?? "transparent" }} />
      <span className="truncate">{group.name}</span>
      <span className="text-[11px] font-normal tabular-nums text-muted-foreground">{group.items.length}</span>
    </>
  );
  return (
    <div className="group/head flex items-center gap-1">
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          title={`Ver solo las de ${group.name}`}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1 text-left text-[13px] font-semibold transition-colors hover:bg-secondary/70"
        >
          {title}
        </button>
      ) : (
        <h3 className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1 text-[13px] font-semibold">{title}</h3>
      )}
      <Hint label={group.key === NONE ? "Nueva sin cliente" : `Nueva para ${group.name}`}>
        <button
          type="button"
          aria-label={group.key === NONE ? "Nueva redacción sin cliente" : `Nueva redacción para ${group.name}`}
          onClick={onNew}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground opacity-0 transition hover:bg-secondary hover:text-foreground group-hover/head:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-70"
        >
          <Plus className="h-4 w-4" />
        </button>
      </Hint>
    </div>
  );
}

function GroupItems({
  group,
  limit,
  now,
  currentId,
  onOpen,
  onDelete,
  onMore,
}: {
  group: Group;
  limit?: number;
  now: number;
  currentId: string | null;
  onOpen: (id: string) => void;
  onDelete: (item: Redaccion) => void;
  onMore?: () => void;
}) {
  if (!group.items.length) {
    return <p className="px-2 py-1 text-xs text-muted-foreground">Todavía no hay redacciones.</p>;
  }
  const shown = limit ? group.items.slice(0, limit) : group.items;
  const rest = group.items.length - shown.length;
  return (
    <ul className="space-y-0.5">
      {shown.map((r) => (
        <Row key={r.id} item={r} client={null} now={now} active={r.id === currentId} onOpen={onOpen} onDelete={onDelete} />
      ))}
      {rest > 0 && onMore && (
        <li>
          <button
            type="button"
            onClick={onMore}
            className="w-full rounded-lg px-3 py-1 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground"
          >
            Ver {rest} más
          </button>
        </li>
      )}
    </ul>
  );
}

function Row({
  item: r,
  client,
  showClient,
  now,
  active,
  onOpen,
  onDelete,
}: {
  item: Redaccion;
  client: { name: string; color: string | null } | null;
  showClient?: boolean;
  now: number;
  active: boolean;
  onOpen: (id: string) => void;
  onDelete: (item: Redaccion) => void;
}) {
  return (
    <li className="group/item relative">
      <button
        type="button"
        onClick={() => onOpen(r.id)}
        aria-current={active ? "true" : undefined}
        className={cn(
          "flex w-full flex-col gap-0.5 rounded-xl px-3 py-2 pr-9 text-left transition-colors hover:bg-white/80",
          active && "bg-white shadow-[0_1px_8px_-4px_rgba(0,0,0,0.18)] ring-1 ring-black/5 hover:bg-white"
        )}
      >
        <span className="truncate text-[13px] font-medium leading-snug">{r.title}</span>
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
          {showClient && client && (
            <>
              <span aria-hidden className="h-2 w-2 shrink-0 rounded-full ring-1 ring-black/10" style={{ background: client.color ?? "transparent" }} />
              <span className="truncate">{client.name}</span>
              <span aria-hidden>·</span>
            </>
          )}
          <time dateTime={r.updatedAt} title={`Editada el ${fullDate(r.updatedAt)}`} className="shrink-0 tabular-nums">
            {timeAgo(r.updatedAt, now)}
          </time>
        </span>
      </button>
      <button
        type="button"
        aria-label={`Borrar “${r.title}”`}
        title="Borrar"
        onClick={() => onDelete(r)}
        className="absolute right-1.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-muted-foreground opacity-0 transition hover:bg-destructive/10 hover:text-destructive group-hover/item:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-60"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-foreground/15 px-4 py-5 text-center">
      <FileText className="mx-auto h-5 w-5 text-muted-foreground" />
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}
