import type { Metadata } from "next";
import { MisTareas } from "@/components/tareas/MisTareas";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Board",
  description: "Las tareas de Basecamp de todo el estudio, en un solo lugar.",
};

export default function BoardPage() {
  return <MisTareas />;
}
