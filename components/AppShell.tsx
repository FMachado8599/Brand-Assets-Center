"use client";

import * as React from "react";
import { supabase, hasSupabase } from "@/lib/supabase";
import type { Brand, Card as CardType, Category, FontFace, Product } from "@/lib/types";
import { injectFontFaces } from "@/lib/fonts";
import { CardTile } from "./CardTile";
import { CardDialog } from "./CardDialog";
import { SettingsDialog } from "./SettingsDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { FilterSelect } from "@/components/ui/filter-select";
import { toast, Toaster } from "@/components/ui/toaster";
import { Plus, Search, Settings, FileText, X } from "lucide-react";

const NO_PRODUCT = "__sin_producto__";
const NO_BRAND = "__sin_marca__";

export function AppShell() {
  const [brands, setBrands] = React.useState<Brand[]>([]);
  const [products, setProducts] = React.useState<Product[]>([]);
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [fonts, setFonts] = React.useState<FontFace[]>([]);
  const [cards, setCards] = React.useState<CardType[]>([]);
  const [loading, setLoading] = React.useState(true);

  const [brandFilter, setBrandFilter] = React.useState<string[]>([]);
  const [productFilter, setProductFilter] = React.useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = React.useState<string[]>([]);
  const [query, setQuery] = React.useState("");

  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<CardType | null>(null);
  const [settingsOpen, setSettingsOpen] = React.useState(false);

  const reload = React.useCallback(async () => {
    const [b, p, c, f, k] = await Promise.all([
      supabase.from("brands").select("*").order("name"),
      supabase.from("products").select("*").order("name"),
      supabase.from("categories").select("*").order("name"),
      supabase.from("fonts").select("*").order("family").order("weight"),
      supabase.from("cards").select("*").order("updated_at", { ascending: false }),
    ]);
    if (b.data) setBrands(b.data as Brand[]);
    if (p.data) setProducts(p.data as Product[]);
    if (c.data) setCategories(c.data as Category[]);
    if (f.data) {
      setFonts(f.data as FontFace[]);
      injectFontFaces(f.data as FontFace[]);
    }
    if (k.data) setCards(k.data as CardType[]);
    const err = b.error || p.error || c.error || f.error || k.error;
    if (err) toast(err.message, "error");
    setLoading(false);
  }, []);

  React.useEffect(() => {
    if (!hasSupabase) {
      setLoading(false);
      return;
    }
    reload();
  }, [reload]);

  /* El filtro de producto solo ofrece modelos de las marcas elegidas. */
  const productOptions = React.useMemo(() => {
    const visibleProducts = brandFilter.length
      ? products.filter((p) => brandFilter.includes(p.brand_id))
      : products;
    const showBrandGroup = brandFilter.length !== 1 && brands.length > 1;
    return visibleProducts.map((p) => ({
      value: p.id,
      label: p.name,
      group: showBrandGroup ? brands.find((b) => b.id === p.brand_id)?.name || "Sin marca" : undefined,
    }));
  }, [products, brands, brandFilter]);

  /* Si cambiás de marca, se sueltan los modelos que ya no corresponden. */
  React.useEffect(() => {
    if (!brandFilter.length) return;
    const valid = new Set(products.filter((p) => brandFilter.includes(p.brand_id)).map((p) => p.id));
    setProductFilter((prev) => {
      const next = prev.filter((id) => valid.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [brandFilter, products]);

  const save = async (draft: {
    id?: string;
    title: string;
    content_html: string;
    content_text: string;
    brand_id: string | null;
    product_id: string | null;
    category_id: string | null;
  }) => {
    const payload = {
      title: draft.title,
      content_html: draft.content_html,
      content_text: draft.content_text,
      brand_id: draft.brand_id,
      product_id: draft.product_id,
      category_id: draft.category_id,
    };
    const { error } = draft.id
      ? await supabase.from("cards").update(payload).eq("id", draft.id)
      : await supabase.from("cards").insert(payload);
    if (error) return toast(error.message, "error");
    await reload();
    toast(draft.id ? "Tarjeta guardada" : "Tarjeta creada");
  };

  const remove = async (id: string) => {
    if (!confirm("¿Eliminar esta tarjeta? No se puede deshacer.")) return;
    const { error } = await supabase.from("cards").delete().eq("id", id);
    if (error) return toast(error.message, "error");
    await reload();
    toast("Tarjeta eliminada");
  };

  const visible = React.useMemo(
    () =>
      cards.filter((c) => {
        if (brandFilter.length && (!c.brand_id || !brandFilter.includes(c.brand_id))) return false;
        if (productFilter.length && (!c.product_id || !productFilter.includes(c.product_id))) return false;
        if (categoryFilter.length && (!c.category_id || !categoryFilter.includes(c.category_id))) return false;
        if (query.trim()) {
          const q = query.toLowerCase();
          return c.title.toLowerCase().includes(q) || c.content_text.toLowerCase().includes(q);
        }
        return true;
      }),
    [cards, brandFilter, productFilter, categoryFilter, query]
  );

  /**
   * Dos niveles: la marca es una columna y, dentro, cada producto abre una
   * fila con sus tarjetas al lado (con wrap si no entran).
   */
  const groups = React.useMemo(() => {
    const byBrand = new Map<string, Map<string, CardType[]>>();
    for (const card of visible) {
      const bKey = card.brand_id || NO_BRAND;
      const pKey = card.product_id || NO_PRODUCT;
      if (!byBrand.has(bKey)) byBrand.set(bKey, new Map());
      const inner = byBrand.get(bKey)!;
      inner.set(pKey, [...(inner.get(pKey) || []), card]);
    }

    const nameOf = (id: string, list: { id: string; name: string }[], fallback: string) =>
      id === NO_BRAND || id === NO_PRODUCT ? fallback : list.find((x) => x.id === id)?.name || fallback;

    return Array.from(byBrand.entries())
      .map(([brandId, inner]) => ({
        brandId,
        brand: brands.find((b) => b.id === brandId),
        brandName: nameOf(brandId, brands, "Sin marca"),
        products: Array.from(inner.entries())
          .map(([productId, list]) => ({
            productId,
            productName: nameOf(productId, products, "Sin producto"),
            cards: list,
          }))
          .sort((a, b) =>
            a.productId === NO_PRODUCT
              ? 1
              : b.productId === NO_PRODUCT
              ? -1
              : a.productName.localeCompare(b.productName)
          ),
      }))
      .sort((a, b) =>
        a.brandId === NO_BRAND ? 1 : b.brandId === NO_BRAND ? -1 : a.brandName.localeCompare(b.brandName)
      );
  }, [visible, brands, products]);

  const activeFilters = brandFilter.length + productFilter.length + categoryFilter.length;
  const clearAll = () => {
    setBrandFilter([]);
    setProductFilter([]);
    setCategoryFilter([]);
    setQuery("");
  };

  if (!hasSupabase) return <MissingConfig />;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <div className="mr-auto flex items-baseline gap-2.5">
            <h1 className="text-lg font-semibold tracking-tight">Tarjetas</h1>
            <span className="eyebrow hidden sm:inline">
              {visible.length === cards.length ? `${cards.length} en total` : `${visible.length} de ${cards.length}`}
            </span>
          </div>

          <div className="relative w-full sm:w-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar texto…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <Button variant="outline" size="icon" onClick={() => setSettingsOpen(true)} aria-label="Ajustes">
            <Settings />
          </Button>
          <Button
            onClick={() => {
              setEditing(null);
              setEditorOpen(true);
            }}
          >
            <Plus /> Nueva tarjeta
          </Button>
        </div>

        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 pb-3 sm:px-6">
          <FilterSelect
            label="Marca"
            className="w-[155px]"
            selected={brandFilter}
            onChange={setBrandFilter}
            options={brands.map((b) => ({ value: b.id, label: b.name, color: b.color }))}
            emptyHint="Creá una marca en Ajustes"
          />
          <FilterSelect
            label="Producto"
            className="w-[170px]"
            selected={productFilter}
            onChange={setProductFilter}
            options={productOptions}
            emptyHint={brandFilter.length ? "Esta marca no tiene modelos" : "Creá un modelo en Ajustes"}
          />
          <FilterSelect
            label="Categoría"
            className="w-[170px]"
            selected={categoryFilter}
            onChange={setCategoryFilter}
            options={categories.map((c) => ({ value: c.id, label: c.name }))}
            emptyHint="Creá una categoría en Ajustes"
          />
          {(activeFilters > 0 || query) && (
            <Button variant="ghost" size="sm" onClick={clearAll}>
              <X /> Limpiar filtros
            </Button>
          )}
        </div>
      </header>

      <main className="proof-grid min-h-[70vh]">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
          {loading ? (
            <p className="py-20 text-center text-sm text-muted-foreground">Cargando…</p>
          ) : visible.length === 0 ? (
            <EmptyState
              hasCards={cards.length > 0}
              onCreate={() => {
                setEditing(null);
                setEditorOpen(true);
              }}
            />
          ) : (
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
                        <span
                          className={
                            "eyebrow shrink-0 " + (p.productId === NO_PRODUCT ? "opacity-60" : "text-foreground")
                          }
                        >
                          {p.productName}
                        </span>
                        <span className="h-px flex-1 bg-border" />
                        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                          {p.cards.length}
                        </span>
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
                              onEdit={() => {
                                setEditing(card);
                                setEditorOpen(true);
                              }}
                              onDelete={() => remove(card.id)}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </section>
              ))}
            </div>
          )}
        </div>
      </main>

      <CardDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        card={editing}
        brands={brands}
        products={products}
        categories={categories}
        fonts={fonts}
        onSave={save}
      />
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        brands={brands}
        products={products}
        categories={categories}
        fonts={fonts}
        reload={reload}
      />
      <Toaster />
    </div>
  );
}

function EmptyState({ hasCards, onCreate }: { hasCards: boolean; onCreate: () => void }) {
  return (
    <div className="mx-auto max-w-md rounded-xl border bg-card px-6 py-14 text-center">
      <FileText className="mx-auto h-7 w-7 text-muted-foreground" />
      <p className="mt-3 font-medium">{hasCards ? "Ningún resultado con estos filtros" : "Todavía no hay tarjetas"}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {hasCards
          ? "Probá quitando algún filtro o cambiando la búsqueda."
          : "Creá la primera y va a aparecer acá, lista para copiar."}
      </p>
      {!hasCards && (
        <Button className="mt-5" onClick={onCreate}>
          <Plus /> Nueva tarjeta
        </Button>
      )}
    </div>
  );
}

function MissingConfig() {
  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-3 px-6">
      <Badge className="w-fit border-destructive text-destructive">Falta configurar</Badge>
      <h1 className="text-xl font-semibold">Conectá Supabase para empezar</h1>
      <p className="text-sm text-muted-foreground">
        Agregá <code className="rounded bg-secondary px-1">NEXT_PUBLIC_SUPABASE_URL</code> y{" "}
        <code className="rounded bg-secondary px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> en las variables de entorno y
        volvé a desplegar. Los pasos completos están en el README.
      </p>
    </div>
  );
}
