"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Copy, PenLine, Plus, StickyNote, X } from "lucide-react";
import { useConfirm } from "@/components/ui/confirm";
import { toast } from "@/components/ui/toaster";
import { Hint } from "@/components/ui/tooltip";
import { imageUrl } from "@/lib/emojis/types";
import { isDuplicateError, productsRepo } from "@/lib/repos";
import { timeAgo } from "@/lib/redaccion/text";
import type { BrandKit, Redaccion } from "@/lib/redaccion/types";
import type { Brand, Card, Product } from "@/lib/types";
import { copyWithToast, Empty, Section, SmallAction } from "./Section";

/** La hora actual, refrescada cada tanto: "hace 5 min" no se queda congelado. */
function useNow(every = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(timer);
  }, [every]);
  return now;
}

/** Los modelos del cliente (en Tarjetas, cada tarjeta puede ser de uno). */
export function ProductsSection({
  brand,
  products,
  cards,
  reload,
}: {
  brand: Brand;
  products: Product[];
  cards: Card[];
  reload: () => Promise<void>;
}) {
  const confirm = useConfirm();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    const { error } = await productsRepo.create(name, brand.id);
    setBusy(false);
    if (error) {
      toast(isDuplicateError(error.message) ? `${brand.name} ya tiene un producto con ese nombre` : error.message, "error");
      return;
    }
    setName("");
    await reload();
  };

  const remove = async (product: Product) => {
    const used = cards.filter((c) => c.product_id === product.id).length;
    if (used) {
      const sure = await confirm({
        title: `¿Quitar ${product.name}?`,
        description: `${used} ${used === 1 ? "tarjeta queda" : "tarjetas quedan"} sin producto.`,
        confirmLabel: "Quitar",
        destructive: true,
      });
      if (!sure) return;
    }
    const { error } = await productsRepo.remove(product.id);
    if (error) return toast(error.message, "error");
    await reload();
    toast(`${product.name} quitado`);
  };

  return (
    <Section id="productos" title="Productos" hint="Los modelos o líneas del cliente. En Tarjetas se usan para agrupar.">
      <div className="flex flex-wrap items-center gap-1.5">
        {products.map((p) => (
          <span key={p.id} className="group inline-flex h-8 items-center gap-1 rounded-full bg-secondary/80 pl-3 pr-1 text-sm">
            {p.name}
            <button
              type="button"
              onClick={() => remove(p)}
              aria-label={`Quitar ${p.name}`}
              className="grid h-6 w-6 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
          className="relative flex h-8 items-center"
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={products.length ? "Otro…" : "Ej: Lumin"}
            aria-label={`Agregar un producto a ${brand.name}`}
            maxLength={60}
            className="h-8 w-36 rounded-full border border-dashed border-foreground/20 bg-transparent pl-3 pr-8 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-solid focus:bg-card focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-0"
          />
          <button
            type="submit"
            aria-label="Agregar producto"
            disabled={!name.trim() || busy}
            className="absolute right-1 grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground transition disabled:bg-transparent disabled:text-muted-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </form>
      </div>
    </Section>
  );
}

/** Las tarjetas del cliente, de la más nueva a la más vieja. */
export function CardsSection({ brand, cards, products }: { brand: Brand; cards: Card[]; products: Product[] }) {
  const now = useNow();
  const shown = cards.slice(0, 6);
  const productName = (id: string | null) => products.find((p) => p.id === id)?.name;

  return (
    <Section
      id="tarjetas"
      title="Tarjetas"
      hint={cards.length ? `${cards.length} ${cards.length === 1 ? "tarjeta" : "tarjetas"} con su tipografía, listas para pegar.` : undefined}
      action={
        <>
          <SmallAction href={`/tarjetas?nueva=${brand.id}`}>
            <Plus /> Nueva
          </SmallAction>
          {cards.length > 0 && (
            <SmallAction href={`/tarjetas?cliente=${brand.id}`}>
              Ver en Tarjetas <ArrowUpRight />
            </SmallAction>
          )}
        </>
      }
    >
      {shown.length ? (
        <ul className="-mx-2 divide-y divide-border/70">
          {shown.map((card) => (
            <li key={card.id}>
              <Link
                href={`/tarjetas?cliente=${brand.id}`}
                className="flex items-start gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-secondary/60"
              >
                <StickyNote className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{card.title || card.content_text.split("\n")[0] || "Sin título"}</span>
                  <span className="block truncate text-xs text-muted-foreground">{card.content_text.replace(/\s+/g, " ")}</span>
                </span>
                <span className="shrink-0 text-right text-[11px] leading-tight text-muted-foreground">
                  {productName(card.product_id) && <span className="block font-medium text-foreground/70">{productName(card.product_id)}</span>}
                  {timeAgo(card.updated_at, now)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>Todavía no hay tarjetas de {brand.name}.</Empty>
      )}
      {cards.length > shown.length && (
        <p className="mt-2 text-xs text-muted-foreground">
          Y {cards.length - shown.length} más en{" "}
          <Link href={`/tarjetas?cliente=${brand.id}`} className="font-medium text-foreground underline underline-offset-2">
            Tarjetas
          </Link>
          .
        </p>
      )}
    </Section>
  );
}

/** Las redacciones de esta persona para el cliente (son de cada uno: las de los demás no se ven). */
export function RedaccionesSection({ brand, items }: { brand: Brand; items: Redaccion[] }) {
  const now = useNow();
  const shown = items.slice(0, 6);

  return (
    <Section
      id="redacciones"
      title="Redacciones"
      hint="Las tuyas: cada redacción es de quien la escribe."
      action={
        <SmallAction href={`/redaccion?cliente=${brand.id}`}>
          <Plus /> Nueva
        </SmallAction>
      }
    >
      {shown.length ? (
        <ul className="-mx-2 divide-y divide-border/70">
          {shown.map((r) => (
            <li key={r.id}>
              <Link
                href={`/redaccion?abrir=${r.id}`}
                className="flex items-start gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-secondary/60"
              >
                <PenLine className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{r.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{r.body.replace(/\s+/g, " ") || "Vacía"}</span>
                </span>
                <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(r.updatedAt, now)}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>Todavía no escribiste nada para {brand.name}.</Empty>
      )}
      {items.length > shown.length && (
        <p className="mt-2 text-xs text-muted-foreground">
          Y {items.length - shown.length} más en{" "}
          <Link href={`/redaccion?cliente=${brand.id}`} className="font-medium text-foreground underline underline-offset-2">
            Redacción
          </Link>
          .
        </p>
      )}
    </Section>
  );
}

/** Los emojis y hashtags de siempre del cliente, los que se guardan desde los paneles de Redacción. */
export function KitSection({ brand, kit }: { brand: Brand; kit: BrandKit }) {
  const empty = !kit.emojis.length && !kit.hashtags.length;
  return (
    <Section
      id="emojis-hashtags"
      title="Emojis y hashtags"
      hint="Los tuyos para este cliente: se guardan desde los paneles de Redacción. Un click copia."
      action={
        kit.hashtags.length > 1 && (
          <SmallAction onClick={() => copyWithToast(kit.hashtags.map((t) => `#${t}`).join(" "), `${kit.hashtags.length} hashtags copiados`)}>
            <Copy /> Copiar hashtags
          </SmallAction>
        )
      }
    >
      {empty ? (
        <Empty>
          Todavía no guardaste emojis ni hashtags de {brand.name}. Se guardan en{" "}
          <Link href={`/redaccion?cliente=${brand.id}`} className="font-medium text-foreground underline underline-offset-2">
            Redacción
          </Link>
          , desde los paneles de la derecha.
        </Empty>
      ) : (
        <div className="space-y-3">
          {kit.emojis.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {kit.emojis.map((e) => (
                <Hint key={e.i} label={e.n}>
                  <button
                    type="button"
                    onClick={() => copyWithToast(e.c, `${e.c} copiado`)}
                    aria-label={`Copiar ${e.n}`}
                    className="grid h-10 w-10 place-items-center rounded-xl transition-colors hover:bg-secondary"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imageUrl(e.i)} alt="" width={28} height={28} loading="lazy" className="h-7 w-7" />
                  </button>
                </Hint>
              ))}
            </div>
          )}
          {kit.hashtags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {kit.hashtags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => copyWithToast(`#${tag}`)}
                  className="h-7 rounded-full bg-secondary/80 px-2.5 text-xs font-medium text-[hsl(30_90%_36%)] transition-colors hover:bg-primary hover:text-primary-foreground"
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </Section>
  );
}
