import type { Metadata } from "next";
import { BasecampView } from "@/components/tareas/BasecampView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Basecamp · Board",
  description: "La cuenta de Basecamp del estudio, la sincronización y lo que hay de cada proyecto.",
};

export default function BasecampPage() {
  return <BasecampView />;
}
