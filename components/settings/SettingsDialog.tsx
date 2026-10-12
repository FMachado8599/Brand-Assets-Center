"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { ProductsTab } from "./ProductsTab";
import { CategoriesTab } from "./CategoriesTab";
import { FontsTab } from "./FontsTab";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TABS = [
  { value: "productos", label: "Productos", Panel: ProductsTab },
  { value: "categorias", label: "Categorías", Panel: CategoriesTab },
  { value: "tipografias", label: "Tipografías", Panel: FontsTab },
];

export function SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [tab, setTab] = useState(TABS[0].value);
  const Active = TABS.find((t) => t.value === tab)?.Panel ?? ProductsTab;

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

        <Link
          href="/clientes"
          onClick={() => onOpenChange(false)}
          className="-mb-1 flex items-center gap-1 border-t pt-3 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Los clientes (con su logo, sus colores y sus tipografías) ahora tienen su propia sección: Clientes
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </DialogContent>
    </Dialog>
  );
}
