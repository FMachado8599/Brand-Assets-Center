"use client";

import { useState } from "react";
import { hasSupabase } from "@/lib/supabase";
import { useData } from "@/components/data/DataProvider";
import { useFilters } from "@/hooks/useFilters";
import { useCardActions } from "@/hooks/useCardActions";
import { groupCards } from "@/lib/cards/grouping";
import { CardGrid } from "../board/CardGrid";
import { FilterPanel } from "./FilterPanel";
import { CardDialog } from "../editor/CardDialog";
import { EmptyState } from "./EmptyState";
import { MissingConfig } from "./MissingConfig";
import { SettingsDialog } from "../settings/SettingsDialog";
import { BarAction, BarButton, BarDivider, BarPopover, BarSearch, ContextBar } from "@/components/shell/ContextBar";
import { useAccount } from "@/components/shell/AccountProvider";
import { Plus, Settings, SlidersHorizontal, X } from "lucide-react";

export function AppShell() {
  const { cards, brands, products, categories, loading } = useData();
  const userId = useAccount()?.user?.id ?? null;
  const filters = useFilters(cards, brands, products, userId);
  const actions = useCardActions();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const groups = groupCards(filters.visible, brands, products);
  const filterCount =
    filters.brandIds.length + filters.productIds.length + filters.categoryIds.length + (filters.onlyMine ? 1 : 0);

  if (!hasSupabase) return <MissingConfig />;

  return (
    <>
      <ContextBar>
        <BarSearch
          value={filters.query}
          onChange={filters.setQuery}
          placeholder={cards.length ? `Buscar en ${cards.length} tarjetas…` : "Buscar texto…"}
        />
        <BarDivider />
        <BarPopover label="Filtros" icon={SlidersHorizontal} badge={filterCount || undefined} highlight={filterCount > 0}>
          <FilterPanel
            brandOptions={brands.map((b) => ({ value: b.id, label: b.name, color: b.color }))}
            productOptions={filters.productOptions}
            categoryOptions={categories.map((c) => ({ value: c.id, label: c.name }))}
            brandIds={filters.brandIds}
            productIds={filters.productIds}
            categoryIds={filters.categoryIds}
            onBrandChange={filters.setBrandIds}
            onProductChange={filters.setProductIds}
            onCategoryChange={filters.setCategoryIds}
            onClear={() => {
              filters.setOnlyMine(false);
              filters.setBrandIds([]);
              filters.setProductIds([]);
              filters.setCategoryIds([]);
            }}
            mine={userId ? { value: filters.onlyMine, onChange: filters.setOnlyMine } : undefined}
          />
        </BarPopover>
        <BarButton label="Ajustes" icon={Settings} onClick={() => setSettingsOpen(true)} />
        <BarDivider />
        <BarAction label="Nueva tarjeta" icon={Plus} onClick={actions.openNew} />
      </ContextBar>

      <main className="mx-auto max-w-7xl px-4 pb-16 pt-[5.5rem] sm:px-6">
        <h1 className="sr-only">Tarjetas</h1>

        {filters.activeCount > 0 && !loading && (
          <div className="mb-5 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="tabular-nums">
              {filters.visible.length} de {cards.length} tarjetas
            </span>
            <button
              type="button"
              onClick={filters.clear}
              className="flex items-center gap-1 rounded-full px-2 py-0.5 font-medium text-foreground/80 transition-colors hover:bg-black/5"
            >
              <X className="h-3 w-3" /> Limpiar
            </button>
          </div>
        )}

        {loading ? (
          <p className="py-20 text-center text-sm text-muted-foreground">Cargando…</p>
        ) : filters.visible.length === 0 ? (
          <EmptyState filtered={cards.length > 0} onCreate={actions.openNew} />
        ) : (
          <CardGrid groups={groups} onEdit={actions.openEdit} onDelete={actions.remove} />
        )}
      </main>

      <CardDialog open={actions.editorOpen} onOpenChange={actions.setEditorOpen} card={actions.editing} />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}
