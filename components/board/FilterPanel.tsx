"use client";

import { FilterSelect, type FilterOption } from "@/components/ui/filter-select";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { PanelTitle } from "@/components/shell/ContextBar";
import { X } from "lucide-react";

type Props = {
  brandOptions: FilterOption[];
  productOptions: FilterOption[];
  categoryOptions: FilterOption[];
  brandIds: string[];
  productIds: string[];
  categoryIds: string[];
  onBrandChange: (v: string[]) => void;
  onProductChange: (v: string[]) => void;
  onCategoryChange: (v: string[]) => void;
  onClear: () => void;
  /** Con sesión iniciada: ver solo las tarjetas que creaste vos. */
  mine?: { value: boolean; onChange: (v: boolean) => void };
};

/** Puro render dentro del popover de la barra: la lógica de opciones vive en useFilters. */
export function FilterPanel({
  brandOptions, productOptions, categoryOptions,
  brandIds, productIds, categoryIds,
  onBrandChange, onProductChange, onCategoryChange,
  onClear, mine,
}: Props) {
  const active = brandIds.length + productIds.length + categoryIds.length > 0 || !!mine?.value;

  return (
    <div>
      <PanelTitle title="Filtros" hint="Podés marcar varias opciones en cada uno." />
      {mine && (
        <label className="mb-3 flex items-center justify-between gap-3 rounded-xl bg-secondary/70 px-3 py-2.5">
          <span className="text-sm font-medium">Solo mis tarjetas</span>
          <Switch checked={mine.value} onCheckedChange={mine.onChange} />
        </label>
      )}
      <div className="flex flex-col gap-2">
        <FilterSelect
          label="Marca"
          className="w-full"
          selected={brandIds}
          onChange={onBrandChange}
          options={brandOptions}
          emptyHint="Creá una marca en Ajustes"
        />
        <FilterSelect
          label="Producto"
          className="w-full"
          selected={productIds}
          onChange={onProductChange}
          options={productOptions}
          emptyHint={brandIds.length ? "Esta marca no tiene modelos" : "Creá un modelo en Ajustes"}
        />
        <FilterSelect
          label="Categoría"
          className="w-full"
          selected={categoryIds}
          onChange={onCategoryChange}
          options={categoryOptions}
          emptyHint="Creá una categoría en Ajustes"
        />
      </div>
      {active && (
        <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={onClear}>
          <X /> Limpiar filtros
        </Button>
      )}
    </div>
  );
}
