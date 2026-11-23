import type { Metadata } from "next";
import { CorreoShell } from "@/components/correo/CorreoShell";
import { ConfirmProvider } from "@/components/ui/confirm";

export const metadata: Metadata = {
  title: "Correo",
  description: "Tu casilla @camaratbwa.com: leé, respondé y mandá mails sin salir de la app.",
};

export default function CorreoPage() {
  return (
    <ConfirmProvider>
      <CorreoShell />
    </ConfirmProvider>
  );
}
