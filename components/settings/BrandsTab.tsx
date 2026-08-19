"use client";

import { useState } from "react";
import { brandsRepo } from "@/lib/repos";
import { useData } from "@/components/data/DataProvider";
import { useConfirm } from "@/components/ui/confirm";
import { toast } from "@/components/ui/toaster";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2 } from "lucide-react";

const COLORS = ["#B61760", "#1D4ED8", "#047857", "#B45309", "#6D28D9", "#52525B"];

export function BrandsTab() {
  const { brands, reload } = useData();
  const confirm = useConfirm();
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);

  const add = async () => {
    if (!name.trim()) return;
    const { error } = await brandsRepo.create(name, color);
    if (error) return toast(error.message, "error");
    setName("");
    await reload();
    toast("Marca creada");
  };

  const remove = async (id: string) => {
    const sure = await confirm({
      title: "¿Eliminar la marca?",
      description: "Sus productos también se eliminan; las tarjetas quedan sin marca.",
      confirmLabel: "Eliminar",
      destructive: true,
    });
    if (!sure) return;
    const { error } = await brandsRepo.remove(id);
    if (error) return toast(error.message, "error");
    await reload();
    toast("Marca eliminada");
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[180px] flex-1">
          <Label htmlFor="marca">Nombre de la marca</Label>
          <Input
            id="marca"
            className="mt-1.5"
            value={name}
            placeholder="Ej: Changan"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
        </div>
        <div className="flex gap-1.5 pb-2.5">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              aria-label={`Color ${c}`}
              className="h-6 w-6 rounded-full border-2 transition"
              style={{ background: c, borderColor: color === c ? "#000" : "transparent" }}
            />
          ))}
        </div>
        <Button onClick={add}>
          <Plus /> Agregar
        </Button>
      </div>

      <ul className="divide-y rounded-lg border">
        {brands.map((b) => (
          <li key={b.id} className="flex items-center gap-3 px-3 py-2.5">
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: b.color }} />
            <span className="flex-1 text-sm">{b.name}</span>
            <Button variant="ghost" size="iconSm" onClick={() => remove(b.id)} aria-label={`Eliminar ${b.name}`}>
              <Trash2 className="text-destructive" />
            </Button>
          </li>
        ))}
        {!brands.length && <li className="px-3 py-6 text-center text-sm text-muted-foreground">Todavía no hay marcas.</li>}
      </ul>
    </div>
  );
}
