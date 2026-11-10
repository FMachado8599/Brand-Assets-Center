import type { Metadata } from "next";
import { EquipoView } from "@/components/tareas/EquipoView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Organización · Board",
  description: "El organigrama del estudio: quién depende de quién, puestos, sectores, hubs y marcas de cada uno.",
};

export default function OrganizacionPage() {
  return <EquipoView />;
}
