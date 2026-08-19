"use client";

import { useEffect, useMemo, useState } from "react";
import type { Brand, Card, Product } from "@/lib/types";

/**
 * Estado de los tres filtros y sus opciones derivadas.
 *
 * La regla que justifica el hook: el filtro de producto depende del de marca.
 * Al cambiar de marca hay que recortar las opciones y soltar los modelos que
 * ya no corresponden. Tenerlo acá deja a FilterBar como puro render.
 */
export function useFilters(cards: Card[], brands: Brand[], products: Product[]) {
  const [brandIds, setBrandIds] = useState<string[]>([]);
  const [productIds, setProductIds] = useState<string[]>([]);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");

  const productOptions = useMemo(() => {
    const list = brandIds.length ? products.filter((p) => brandIds.includes(p.brand_id)) : products;
    const showBrandGroup = brandIds.length !== 1 && brands.length > 1;
    return list.map((p) => ({
      value: p.id,
      label: p.name,
      group: showBrandGroup ? brands.find((b) => b.id === p.brand_id)?.name || "Sin marca" : undefined,
    }));
  }, [products, brands, brandIds]);

  useEffect(() => {
    if (!brandIds.length) return;
    const valid = new Set(products.filter((p) => brandIds.includes(p.brand_id)).map((p) => p.id));
    setProductIds((prev) => {
      const next = prev.filter((id) => valid.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [brandIds, products]);

  const visible = useMemo(
    () =>
      cards.filter((c) => {
        if (brandIds.length && (!c.brand_id || !brandIds.includes(c.brand_id))) return false;
        if (productIds.length && (!c.product_id || !productIds.includes(c.product_id))) return false;
        if (categoryIds.length && (!c.category_id || !categoryIds.includes(c.category_id))) return false;
        if (query.trim()) {
          const q = query.toLowerCase();
          return c.title.toLowerCase().includes(q) || c.content_text.toLowerCase().includes(q);
        }
        return true;
      }),
    [cards, brandIds, productIds, categoryIds, query]
  );

  const activeCount = brandIds.length + productIds.length + categoryIds.length + (query.trim() ? 1 : 0);

  const clear = () => {
    setBrandIds([]);
    setProductIds([]);
    setCategoryIds([]);
    setQuery("");
  };

  return {
    brandIds, setBrandIds,
    productIds, setProductIds,
    categoryIds, setCategoryIds,
    query, setQuery,
    productOptions, visible, activeCount, clear,
  };
}
