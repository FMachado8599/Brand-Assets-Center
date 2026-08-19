"use client";

import { useEffect, useState } from "react";
import { isDuplicateError, productsRepo } from "@/lib/repos";
import { useData } from "@/components/data/DataProvider";
import { toast } from "@/components/ui/toaster";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";

export function ProductsTab() {
  const { brands, products, reload } = useData();
  const [name, setName] = useState("");
  const [brandId, setBrandId] = useState("");

  useEffect(() => {
    if (!brandId && brands.length) setBrandId(brands[0].id);
  }, [brands, brandId]);

  const add = async () => {
    if (!name.trim() || !brandId) return;
    const { error } = await productsRepo.create(name, brandId);
    if (error) {
      return toast(
        isDuplicateError(error.message) ? "Esa marca ya tiene un modelo con ese nombre" : error.message,
        "error"
      );
    }
    setName("");
    await reload();
    toast("Producto creado");
  };

  const remove = async (id: string) => {
    const { error } = await productsRepo.remove(id);
    if (error) return toast(error.message, "error");
    await reload();
    toast("Producto eliminado");
  };

  if (!brands.length) {
    return (
      <p className="rounded-lg border px-3 py-6 text-center text-sm text-muted-foreground">
        Primero creá una marca. Cada producto pertenece a una.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-[150px]">
          <Label>Marca</Label>
          <Select value={brandId} onValueChange={setBrandId}>
            <SelectTrigger className="mt-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {brands.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[160px] flex-1">
          <Label htmlFor="producto">Nombre del producto</Label>
          <Input
            id="producto"
            className="mt-1.5"
            value={name}
            placeholder="Ej: Lumin"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
        </div>
        <Button onClick={add}>
          <Plus /> Agregar
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        {brands.map((b) => {
          const list = products.filter((p) => p.brand_id === b.id);
          return (
            <div key={b.id} className="rounded-lg border">
              <div className="flex items-center gap-2 border-b bg-secondary/40 px-3 py-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: b.color }} />
                <p className="flex-1 text-sm font-semibold">{b.name}</p>
                <span className="text-xs text-muted-foreground">{list.length}</span>
              </div>
              {list.length ? (
                <ul className="divide-y">
                  {list.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 px-3 py-2">
                      <span className="flex-1 text-sm">{p.name}</span>
                      <Button variant="ghost" size="iconSm" onClick={() => remove(p.id)} aria-label={`Eliminar ${p.name}`}>
                        <Trash2 className="text-destructive" />
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-3 py-4 text-center text-xs text-muted-foreground">Sin modelos todavía.</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
