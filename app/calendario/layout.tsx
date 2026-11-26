import type { ReactNode } from "react";
import { PerfilHost } from "@/components/perfil/PerfilDialog";
import { ConfirmProvider } from "@/components/ui/confirm";

/** Desde el Calendario se abre el perfil de un compañero (un cumpleaños, alguien fuera de oficina). */
export default function CalendarioLayout({ children }: { children: ReactNode }) {
  return (
    <ConfirmProvider>
      {children}
      <PerfilHost />
    </ConfirmProvider>
  );
}
