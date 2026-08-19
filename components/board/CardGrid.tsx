"use client";

import { CardTile } from "./CardTile";
import { useData } from "@/components/data/DataProvider";
import { NO_PRODUCT, type BrandGroup } from "@/lib/cards/grouping";
import type { Card } from "@/lib/types";

type Props = {
  groups: BrandGroup[];
  onEdit: (card: Card) => void;
  onDelete: (id: string) => void;
};

/** Marca en columna; adentro, cada producto abre una fila con wrap. */
export function CardGrid({ groups, onEdit, onDelete }: Props) {
  const { brands, products, categories, fonts } = useData();

  return (
    <div className="flex flex-col gap-9">
      {groups.map((g) => (
        <section key={g.brandId} className="flex flex-col gap-5">
          {groups.length > 1 && (
            <div className="flex items-center gap-2">
              {g.brand && <span className="h-2.5 w-2.5 rounded-full" style={{ background: g.brand.color }} />}
              <h2 className="text-base font-semibold tracking-tight">{g.brandName}</h2>
            </div>
          )}

          {g.products.map((p) => (
            <div key={p.productId} className="flex flex-col gap-3">
              {/* Divisor: nombre del producto a la izquierda, línea hasta el borde */}
              <div className="flex items-center gap-3">
                <span className={"eyebrow shrink-0 " + (p.productId === NO_PRODUCT ? "opacity-60" : "text-foreground")}>
                  {p.productName}
                </span>
                <span className="h-px flex-1 bg-border" />
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{p.cards.length}</span>
              </div>

              <div className="flex flex-wrap gap-4">
                {p.cards.map((card) => (
                  <div key={card.id} className="w-full sm:w-[330px]">
                    <CardTile
                      card={card}
                      fonts={fonts}
                      brand={brands.find((b) => b.id === card.brand_id)}
                      category={categories.find((c) => c.id === card.category_id)}
                      product={products.find((x) => x.id === card.product_id)}
                      onEdit={() => onEdit(card)}
                      onDelete={() => onDelete(card.id)}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
