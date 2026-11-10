import type { Metadata } from "next";
import { EquipoFilas } from "@/components/tareas/EquipoFilas";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Equipo · Board",
  description: "Una fila por persona con sus tareas, de la más prioritaria a la menos.",
};

export default function EquipoPage() {
  return <EquipoFilas />;
}
