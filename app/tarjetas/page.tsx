import type { Metadata } from "next";
import { AppShell } from "@/components/board/AppShell";
import { DataProvider } from "@/components/data/DataProvider";
import { ConfirmProvider } from "@/components/ui/confirm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tarjetas",
  description: "Textos guardados con su tipografía, listos para copiar y pegar.",
};

export default function Page() {
  return (
    <DataProvider>
      <ConfirmProvider>
        <AppShell />
      </ConfirmProvider>
    </DataProvider>
  );
}
