import type { Metadata } from "next";
import { AccesosView } from "@/components/tareas/AccesosView";
import { SoloAdmins } from "@/components/tareas/comun";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Accesos · Board",
  description: "Quién puede entrar a Herramientas: dominios, mails sueltos y links para crear la contraseña.",
};

/** Solo admins: dominios y mails permitidos, y los links para crear la contraseña. */
export default function AccesosPage() {
  return (
    <SoloAdmins titulo="Accesos">
      <AccesosView />
    </SoloAdmins>
  );
}
