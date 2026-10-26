import type { Metadata } from "next";
import { EquipoView } from "@/components/tareas/EquipoView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Equipo · Board",
  description: "Quién es quién en el estudio: puestos, sectores, hubs y marcas de cada uno.",
};

export default function EquipoPage() {
  return <EquipoView />;
}
