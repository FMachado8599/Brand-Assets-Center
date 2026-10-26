import type { Metadata } from "next";
import { TableroView } from "@/components/tareas/TableroView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tablero · Board",
  description: "Las tareas de cada tablero por etapa o por persona: arrastrá para moverlas, priorizarlas o pasarlas.",
};

export default function TableroPage() {
  return <TableroView />;
}
