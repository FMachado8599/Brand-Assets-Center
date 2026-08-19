"use client";

import { FilterSelect, type FilterOption } from "@/components/ui/filter-select";
import { Button } from "@/components/ui/button";
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
  showClear: boolean;
  onClear: () => void;
};

/** Puro render: toda la lógica de qué opciones mostrar vive en useFilters. */
export function FilterBar({
  brandOptions, productOptions, categoryOptions,
  brandIds, productIds, categoryIds,
  onBrandChange, onProductChange, onCategoryChange,
  showClear, onClear,
}: Props) {
  return (
    <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 pb-3 sm:px-6">
      <FilterSelect
        label="Marca"
        className="w-[155px]"
        selected={brandIds}
        onChange={onBrandChange}
        options={brandOptions}
        emptyHint="Creá una marca en Ajustes"
      />
      <FilterSelect
        label="Producto"
        className="w-[170px]"
        selected={productIds}
        onChange={onProductChange}
        options={productOptions}
        emptyHint={brandIds.length ? "Esta marca no tiene modelos" : "Creá un modelo en Ajustes"}
      />
      <FilterSelect
        label="Categoría"
        className="w-[170px]"
        selected={categoryIds}
        onChange={onCategoryChange}
        options={categoryOptions}
        emptyHint="Creá una categoría en Ajustes"
      />
      {showClear && (
        <Button variant="ghost" size="sm" onClick={onClear}>
          <X /> Limpiar filtros
        </Button>
      )}
    </div>
  );
}
