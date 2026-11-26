import type { Metadata } from "next";
import { SoloAdmins } from "@/components/tareas/comun";
import { EquipoView } from "@/components/tareas/EquipoView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Organización · Ajustes",
  description: "El organigrama del estudio: quién depende de quién, puestos, sectores, hubs y marcas de cada uno.",
};

/** Solo admins: el organigrama, los puestos, los hubs y quién es designado de qué marca. */
export default function OrganizacionPage() {
  return (
    <SoloAdmins titulo="Organización">
      <EquipoView />
    </SoloAdmins>
  );
}
