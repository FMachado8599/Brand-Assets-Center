import type { ReactNode } from "react";
import { DataProvider } from "@/components/data/DataProvider";
import { ConfirmProvider } from "@/components/ui/confirm";

// La lista y las fichas comparten los datos: pasar de una a otra no vuelve a leer todo.
export default function ClientesLayout({ children }: { children: ReactNode }) {
  return (
    <DataProvider>
      <ConfirmProvider>{children}</ConfirmProvider>
    </DataProvider>
  );
}
