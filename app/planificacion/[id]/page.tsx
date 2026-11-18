import type { Metadata } from "next";
import { PlaniEditor } from "@/components/plani/editor/PlaniEditor";
import { categorySummaries } from "@/lib/emojis/catalog.server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Plani",
  description: "Una plani: calendario, feed y cada pieza con su copy, sus indicaciones y su material final.",
};

export default function PlaniPage({ params }: { params: { id: string } }) {
  // Las categorías del panel de emojis (solo el resumen: los emojis se piden de a páginas).
  return <PlaniEditor id={params.id} categories={categorySummaries()} />;
}
