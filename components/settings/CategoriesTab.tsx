"use client";

import { useState } from "react";
import { categoriesRepo } from "@/lib/repos";
import { useData } from "@/components/data/DataProvider";
import { toast } from "@/components/ui/toaster";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2 } from "lucide-react";

export function CategoriesTab() {
  const { categories, reload } = useData();
  const [name, setName] = useState("");

  const add = async () => {
    if (!name.trim()) return;
    const { error } = await categoriesRepo.create(name);
    if (error) return toast(error.message, "error");
    setName("");
    await reload();
    toast("Categoría creada");
  };

  const remove = async (id: string) => {
    const { error } = await categoriesRepo.remove(id);
    if (error) return toast(error.message, "error");
    await reload();
    toast("Categoría eliminada");
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Label htmlFor="categoria">Nombre de la categoría</Label>
          <Input
            id="categoria"
            className="mt-1.5"
            value={name}
            placeholder="Ej: Autonomía"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
        </div>
        <Button onClick={add}>
          <Plus /> Agregar
        </Button>
      </div>

      <ul className="divide-y rounded-lg border">
        {categories.map((c) => (
          <li key={c.id} className="flex items-center gap-3 px-3 py-2.5">
            <span className="flex-1 text-sm">{c.name}</span>
            <Button variant="ghost" size="iconSm" onClick={() => remove(c.id)} aria-label={`Eliminar ${c.name}`}>
              <Trash2 className="text-destructive" />
            </Button>
          </li>
        ))}
        {!categories.length && (
          <li className="px-3 py-6 text-center text-sm text-muted-foreground">Todavía no hay categorías.</li>
        )}
      </ul>
    </div>
  );
}
