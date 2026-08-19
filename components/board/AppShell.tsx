"use client";

import { useState } from "react";
import { hasSupabase } from "@/lib/supabase";
import { useData } from "@/components/data/DataProvider";
import { useFilters } from "@/hooks/useFilters";
import { useCardActions } from "@/hooks/useCardActions";
import { groupCards } from "@/lib/cards/grouping";
import { CardGrid } from "../board/CardGrid";
import { FilterBar } from "./FilterBar";
import { CardDialog } from "../editor/CardDialog";
import { EmptyState } from "./EmptyState";
import { MissingConfig } from "./MissingConfig";
import { SettingsDialog } from "../settings/SettingsDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toaster } from "@/components/ui/toaster";
import { Plus, Search, Settings } from "lucide-react";

export function AppShell() {
  const { cards, brands, products, categories, loading } = useData();
  const filters = useFilters(cards, brands, products);
  const actions = useCardActions();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const groups = groupCards(filters.visible, brands, products);

  if (!hasSupabase) return <MissingConfig />;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <div className="mr-auto flex items-baseline gap-2.5">
            <h1 className="text-lg font-semibold tracking-tight">Tarjetas</h1>
            <span className="eyebrow hidden sm:inline">
              {filters.visible.length === cards.length
                ? `${cards.length} en total`
                : `${filters.visible.length} de ${cards.length}`}
            </span>
          </div>

          <div className="relative w-full sm:w-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar texto…"
              value={filters.query}
              onChange={(e) => filters.setQuery(e.target.value)}
            />
          </div>

          <Button variant="outline" size="icon" onClick={() => setSettingsOpen(true)} aria-label="Ajustes">
            <Settings />
          </Button>
          <Button onClick={actions.openNew}>
            <Plus /> Nueva tarjeta
          </Button>
        </div>

        <FilterBar
          brandOptions={brands.map((b) => ({ value: b.id, label: b.name, color: b.color }))}
          productOptions={filters.productOptions}
          categoryOptions={categories.map((c) => ({ value: c.id, label: c.name }))}
          brandIds={filters.brandIds}
          productIds={filters.productIds}
          categoryIds={filters.categoryIds}
          onBrandChange={filters.setBrandIds}
          onProductChange={filters.setProductIds}
          onCategoryChange={filters.setCategoryIds}
          showClear={filters.activeCount > 0}
          onClear={filters.clear}
        />
      </header>

      <main className="proof-grid min-h-[70vh]">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
          {loading ? (
            <p className="py-20 text-center text-sm text-muted-foreground">Cargando…</p>
          ) : filters.visible.length === 0 ? (
            <EmptyState filtered={cards.length > 0} onCreate={actions.openNew} />
          ) : (
            <CardGrid groups={groups} onEdit={actions.openEdit} onDelete={actions.remove} />
          )}
        </div>
      </main>

      <CardDialog open={actions.editorOpen} onOpenChange={actions.setEditorOpen} card={actions.editing} />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <Toaster />
    </div>
  );
}
