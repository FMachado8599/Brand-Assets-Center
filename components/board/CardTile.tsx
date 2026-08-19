"use client";

import { useEffect, useState } from "react";
import type { Brand, Card as CardType, Category, FontFace, Product } from "@/lib/types";
import { parseBlocks, toRichHtml, toRtf, toSvg, toPlainText, facesUsed } from "@/lib/cards/export";
import { copyRich, copyPlain, downloadRtf, downloadSvg } from "@/lib/cards/clipboard";
import { toast } from "@/components/ui/toaster";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Copy, Check, MoreHorizontal, Pencil, Trash2, FileDown, Type, Shapes } from "lucide-react";

type Props = {
  card: CardType;
  brand?: Brand;
  category?: Category;
  product?: Product;
  fonts: FontFace[];
  onEdit: () => void;
  onDelete: () => void;
};

export function CardTile({ card, brand, category, product, fonts, onEdit, onDelete }: Props) {
  const [copied, setCopied] = useState(false);
  const [faces, setFaces] = useState<string[]>([]);

  useEffect(() => {
    setFaces(facesUsed(parseBlocks(card.content_html, fonts)));
  }, [card.content_html, fonts]);

  const build = () => parseBlocks(card.content_html, fonts);

  const handleCopy = async () => {
    const blocks = build();
    const ok = await copyRich(toRichHtml(blocks), toPlainText(blocks));
    if (!ok) {
      toast("No se pudo copiar. Probá con Descargar .rtf", "error");
      return;
    }
    setCopied(true);
    toast("Copiado con formato");
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <Card className="group flex flex-col overflow-hidden transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-2 border-b px-4 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{card.title || "Sin título"}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {brand && (
              <Badge style={{ borderColor: brand.color, color: brand.color }} className="bg-transparent">
                {brand.name}
              </Badge>
            )}
            {product && <Badge className="border-transparent bg-foreground/5">{product.name}</Badge>}
            {category && <Badge className="border-transparent bg-secondary text-secondary-foreground">{category.name}</Badge>}
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="iconSm" aria-label="Más opciones">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil /> Editar
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={async () => {
                const blocks = build();
                await copyPlain(toPlainText(blocks));
                toast("Copiado como texto simple");
              }}
            >
              <Type /> Copiar sin formato
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                downloadSvg(toSvg(build()), card.title);
                toast(".svg descargado · abrilo con Illustrator");
              }}
            >
              <Shapes /> Descargar .svg para Illustrator
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                downloadRtf(toRtf(build()), card.title);
                toast(".rtf descargado · Archivo → Colocar");
              }}
            >
              <FileDown /> Descargar .rtf para InDesign
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onSelect={onDelete}>
              <Trash2 /> Eliminar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* El texto se muestra con su tipografía real: la tarjeta es su propia muestra */}
      <div
        className="rich min-h-[92px] flex-1 px-4 py-3.5 text-[15px]"
        dangerouslySetInnerHTML={{ __html: card.content_html }}
      />

      <div className="flex items-center justify-between gap-2 border-t bg-secondary/30 px-4 py-2">
        <p className="eyebrow truncate" title={faces.join(" · ")}>
          {faces.length ? faces.join(" · ") : "Sin tipografía asignada"}
        </p>
        <Button size="sm" variant={copied ? "secondary" : "default"} onClick={handleCopy} className="shrink-0">
          {copied ? <Check /> : <Copy />}
          {copied ? "Listo" : "Copiar"}
        </Button>
      </div>
    </Card>
  );
}
