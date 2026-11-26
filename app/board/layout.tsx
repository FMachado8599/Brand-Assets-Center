import type { ReactNode } from "react";
import { PerfilHost } from "@/components/perfil/PerfilDialog";
import { ConfirmProvider } from "@/components/ui/confirm";

/** El perfil de un compañero se abre desde cualquier parte del Board (ver components/perfil/abrir.ts). */
export default function BoardLayout({ children }: { children: ReactNode }) {
  return (
    <ConfirmProvider>
      {children}
      <PerfilHost />
    </ConfirmProvider>
  );
}
