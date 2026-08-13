"use client";

import * as React from "react";
import type { Brand, Card, Category, FontFace, Product } from "@/lib/types";
import { Editor } from "./Editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const NONE = "__none__";

type Draft = {
  id?: string;
  title: string;
  content_html: string;
  content_text: string;
  brand_id: string | null;
  product_id: string | null;
  category_id: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  card: Card | null;
  brands: Brand[];
  products: Product[];
  categories: Category[];
  fonts: FontFace[];
  onSave: (draft: Draft) => Promise<void>;
};

export function CardDialog({ open, onOpenChange, card, brands, products, categories, fonts, onSave }: Props) {
  const [draft, setDraft] = React.useState<Draft>({
    title: "",
    content_html: "",
    content_text: "",
    brand_id: null,
    product_id: null,
    category_id: null,
  });
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setDraft(
      card
        ? {
            id: card.id,
            title: card.title,
            content_html: card.content_html,
            content_text: card.content_text,
            brand_id: card.brand_id,
            product_id: card.product_id,
            category_id: card.category_id,
          }
        : { title: "", content_html: "", content_text: "", brand_id: null, product_id: null, category_id: null }
    );
  }, [open, card]);

  /* Solo se ofrecen los modelos de la marca elegida. */
  const brandProducts = products.filter((p) => p.brand_id === draft.brand_id);

  /* Cambiar de marca suelta el modelo si ya no pertenece. */
  const setBrand = (brandId: string | null) => {
    const stillValid = products.find((p) => p.id === draft.product_id)?.brand_id === brandId;
    setDraft({ ...draft, brand_id: brandId, product_id: stillValid ? draft.product_id : null });
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSave(draft);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{card ? "Editar tarjeta" : "Nueva tarjeta"}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 overflow-y-auto pr-1">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-3">
              <Label htmlFor="titulo">Título</Label>
              <Input
                id="titulo"
                className="mt-1.5"
                placeholder="Cómo se llama esta tarjeta"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </div>

            <div>
              <Label>Marca</Label>
              <Select value={draft.brand_id || NONE} onValueChange={(v) => setBrand(v === NONE ? null : v)}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Elegir marca" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sin marca</SelectItem>
                  {brands.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Producto</Label>
              <Select
                value={draft.product_id || NONE}
                onValueChange={(v) => setDraft({ ...draft, product_id: v === NONE ? null : v })}
                disabled={!draft.brand_id || !brandProducts.length}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue
                    placeholder={
                      !draft.brand_id
                        ? "Elegí una marca"
                        : !brandProducts.length
                        ? "Esta marca no tiene modelos"
                        : "Elegir producto"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sin producto</SelectItem>
                  {brandProducts.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Categoría</Label>
              <Select
                value={draft.category_id || NONE}
                onValueChange={(v) => setDraft({ ...draft, category_id: v === NONE ? null : v })}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Elegir categoría" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sin categoría</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Texto</Label>
            <div className="mt-1.5">
              <Editor
                fonts={fonts}
                value={draft.content_html}
                onChange={(html, text) => setDraft((d) => ({ ...d, content_html: html, content_text: text }))}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Seleccioná una parte del texto para cambiarle la tipografía. Sin nada seleccionado, el cambio se aplica a
              toda la tarjeta.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Guardando…" : "Guardar tarjeta"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
