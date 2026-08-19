"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { hasSupabase } from "@/lib/supabase";
import { brandsRepo, cardsRepo, categoriesRepo, fontsRepo, productsRepo } from "@/lib/repos";
import { injectFontFaces } from "@/lib/fonts/fonts";
import { toast } from "@/components/ui/toaster";
import type { Brand, Card, Category, FontFace, Product } from "@/lib/types";

type DataState = {
  brands: Brand[];
  products: Product[];
  categories: Category[];
  fonts: FontFace[];
  cards: Card[];
  loading: boolean;
  reload: () => Promise<void>;
  /** Modelos de una marca, ya filtrados. */
  productsOf: (brandId: string | null) => Product[];
};

const DataContext = createContext<DataState | null>(null);

/**
 * Una sola fuente de verdad para las cinco listas. Se recargan enteras
 * después de cada escritura: son pocos registros y evita mantener un
 * espejo del estado sincronizado a mano.
 */
export function DataProvider({ children }: { children: ReactNode }) {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [fonts, setFonts] = useState<FontFace[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const [b, p, c, f, k] = await Promise.all([
      brandsRepo.list(),
      productsRepo.list(),
      categoriesRepo.list(),
      fontsRepo.list(),
      cardsRepo.list(),
    ]);

    if (b.data) setBrands(b.data as Brand[]);
    if (p.data) setProducts(p.data as Product[]);
    if (c.data) setCategories(c.data as Category[]);
    if (k.data) setCards(k.data as Card[]);
    if (f.data) {
      setFonts(f.data as FontFace[]);
      injectFontFaces(f.data as FontFace[]);
    }

    const err = b.error || p.error || c.error || f.error || k.error;
    if (err) toast(err.message, "error");
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!hasSupabase) {
      setLoading(false);
      return;
    }
    reload();
  }, [reload]);

  const productsOf = useCallback(
    (brandId: string | null) => (brandId ? products.filter((p) => p.brand_id === brandId) : []),
    [products]
  );

  const value = useMemo(
    () => ({ brands, products, categories, fonts, cards, loading, reload, productsOf }),
    [brands, products, categories, fonts, cards, loading, reload, productsOf]
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData tiene que usarse adentro de <DataProvider>");
  return ctx;
}
