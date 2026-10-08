import type { Metadata } from "next";
import { RedaccionShell } from "@/components/redaccion/RedaccionShell";
import { ConfirmProvider } from "@/components/ui/confirm";
import { categorySummaries } from "@/lib/emojis/catalog.server";

export const metadata: Metadata = {
  title: "Redacción",
  description: "Escribí textos con los emojis y hashtags de cada marca a un click, y copialos al toque.",
};

export default function RedaccionPage() {
  // Las categorías del panel de emojis (solo el resumen: los emojis se piden de a páginas).
  const categories = categorySummaries();
  return (
    <ConfirmProvider>
      <RedaccionShell categories={categories} />
    </ConfirmProvider>
  );
}
