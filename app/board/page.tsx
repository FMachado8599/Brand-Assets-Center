import type { Metadata } from "next";
import { MiTablero } from "@/components/tareas/MiTablero";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Board",
  description: "Tus tareas de Basecamp en un tablero por etapa, ordenadas por prioridad.",
};

export default function BoardPage() {
  return <MiTablero />;
}
