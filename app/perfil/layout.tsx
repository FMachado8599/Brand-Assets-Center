import type { ReactNode } from "react";
import { PerfilHost } from "@/components/perfil/PerfilDialog";
import { ConfirmProvider } from "@/components/ui/confirm";

/** Desde tu perfil se abre el de tus compañeros (y tus marcas, que piden confirmar al pasarse una). */
export default function PerfilLayout({ children }: { children: ReactNode }) {
  return (
    <ConfirmProvider>
      {children}
      <PerfilHost />
    </ConfirmProvider>
  );
}
