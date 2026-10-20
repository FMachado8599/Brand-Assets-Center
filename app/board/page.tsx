import type { Metadata } from "next";
import { BoardShell } from "@/components/tareas/BoardShell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Board",
  description: "Las tareas de Basecamp de todo el estudio, en un solo lugar.",
};

export default function BoardPage() {
  return <BoardShell />;
}
