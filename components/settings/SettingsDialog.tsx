"use client";

import { useState } from "react";
import { BrandsTab } from "./BrandsTab";
import { ProductsTab } from "./ProductsTab";
import { CategoriesTab } from "./CategoriesTab";
import { FontsTab } from "./FontsTab";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TABS = [
  { value: "marcas", label: "Marcas", Panel: BrandsTab },
  { value: "productos", label: "Productos", Panel: ProductsTab },
  { value: "categorias", label: "Categorías", Panel: CategoriesTab },
  { value: "tipografias", label: "Tipografías", Panel: FontsTab },
];

export function SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [tab, setTab] = useState(TABS[0].value);
  const Active = TABS.find((t) => t.value === tab)?.Panel ?? BrandsTab;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Ajustes</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="max-h-[58vh] overflow-y-auto pr-1">
          <Active />
        </div>
      </DialogContent>
    </Dialog>
  );
}
