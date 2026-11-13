import { Suspense } from "react";
import type { Metadata } from "next";
import { EmojiShell } from "@/components/emojis/EmojiShell";
import { categorySummaries } from "@/lib/emojis/catalog.server";

export const metadata: Metadata = {
  title: "Emojis",
  description: "Emojis de Apple en PNG: buscá en español o inglés y copiá con un click.",
};

export default function EmojisPage() {
  // Solo el resumen de categorías viaja con la página: los emojis se piden de a páginas.
  const categories = categorySummaries();
  return (
    // La vista depende de la URL (?c=categoría): useSearchParams pide un Suspense alrededor.
    <Suspense fallback={null}>
      <EmojiShell categories={categories} />
    </Suspense>
  );
}
