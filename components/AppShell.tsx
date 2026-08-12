"use client";

import * as React from "react";
import { supabase, hasSupabase } from "@/lib/supabase";
import type { Brand, Card as CardType, Category, FontFace } from "@/lib/types";
import { injectFontFaces } from "@/lib/fonts";
import { CardTile } from "./CardTile";
import { CardDialog } from "./CardDialog";
import { SettingsDialog } from "./SettingsDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast, Toaster } from "@/components/ui/toaster";
import { Plus, Search, Settings, FileText } from "lucide-react";

const ALL = "__all__";

export function AppShell() {
  const [brands, setBrands] = React.useState<Brand[]>([]);
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [fonts, setFonts] = React.useState<FontFace[]>([]);
  const [cards, setCards] = React.useState<CardType[]>([]);
  const [loading, setLoading] = React.useState(true);

  const [brandFilter, setBrandFilter] = React.useState(ALL);
  const [categoryFilter, setCategoryFilter] = React.useState(ALL);
  const [query, setQuery] = React.useState("");

  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<CardType | null>(null);
  const [settingsOpen, setSettingsOpen] = React.useState(false);

  const reload = React.useCallback(async () => {
    const [b, c, f, k] = await Promise.all([
      supabase.from("brands").select("*").order("name"),
      supabase.from("categories").select("*").order("name"),
      supabase.from("fonts").select("*").order("family").order("weight"),
      supabase.from("cards").select("*").order("updated_at", { ascending: false }),
    ]);
    if (b.data) setBrands(b.data as Brand[]);
    if (c.data) setCategories(c.data as Category[]);
    if (f.data) {
      setFonts(f.data as FontFace[]);
      injectFontFaces(f.data as FontFace[]);
    }
    if (k.data) setCards(k.data as CardType[]);
    const err = b.error || c.error || f.error || k.error;
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

  const save = async (draft: {
    id?: string;
    title: string;
    content_html: string;
    content_text: string;
    brand_id: string | null;
    category_id: string | null;
  }) => {
    const payload = {
      title: draft.title,
      content_html: draft.content_html,
      content_text: draft.content_text,
      brand_id: draft.brand_id,
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

  const visible = cards.filter((c) => {
    if (brandFilter !== ALL && c.brand_id !== brandFilter) return false;
    if (categoryFilter !== ALL && c.category_id !== categoryFilter) return false;
    if (query.trim()) {
      const q = query.toLowerCase();
      return c.title.toLowerCase().includes(q) || c.content_text.toLowerCase().includes(q);
    }
    return true;
  });

  const countFor = (brandId: string) =>
    brandId === ALL ? cards.length : cards.filter((c) => c.brand_id === brandId).length;

  if (!hasSupabase) return <MissingConfig />;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <div className="mr-auto flex items-baseline gap-2.5">
            <h1 className="text-lg font-semibold tracking-tight">Tarjetas</h1>
            <span className="eyebrow hidden sm:inline">{cards.length} en total</span>
          </div>

          <div className="relative w-full sm:w-64">
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

        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 pb-3 sm:px-6">
          <Tabs value={brandFilter} onValueChange={setBrandFilter}>
            <TabsList className="max-w-full">
              <TabsTrigger value={ALL}>Todas · {countFor(ALL)}</TabsTrigger>
              {brands.map((b) => (
                <TabsTrigger key={b.id} value={b.id}>
                  <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: b.color }} />
                  {b.name} · {countFor(b.id)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {categories.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <FilterChip active={categoryFilter === ALL} onClick={() => setCategoryFilter(ALL)}>
                Todas las categorías
              </FilterChip>
              {categories.map((c) => (
                <FilterChip key={c.id} active={categoryFilter === c.id} onClick={() => setCategoryFilter(c.id)}>
                  {c.name}
                </FilterChip>
              ))}
            </div>
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
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((card) => (
                <CardTile
                  key={card.id}
                  card={card}
                  fonts={fonts}
                  brand={brands.find((b) => b.id === card.brand_id)}
                  category={categories.find((c) => c.id === card.category_id)}
                  onEdit={() => {
                    setEditing(card);
                    setEditorOpen(true);
                  }}
                  onDelete={() => remove(card.id)}
                />
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
        categories={categories}
        fonts={fonts}
        onSave={save}
      />
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        brands={brands}
        categories={categories}
        fonts={fonts}
        reload={reload}
      />
      <Toaster />
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "rounded-full border px-3 py-1 text-[13px] transition-colors " +
        (active ? "border-foreground bg-foreground text-background" : "bg-card hover:bg-accent")
      }
    >
      {children}
    </button>
  );
}

function EmptyState({ hasCards, onCreate }: { hasCards: boolean; onCreate: () => void }) {
  return (
    <div className="mx-auto max-w-md rounded-xl border bg-card px-6 py-14 text-center">
      <FileText className="mx-auto h-7 w-7 text-muted-foreground" />
      <p className="mt-3 font-medium">{hasCards ? "Ningún resultado con estos filtros" : "Todavía no hay tarjetas"}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {hasCards
          ? "Cambiá la marca, la categoría o la búsqueda."
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
