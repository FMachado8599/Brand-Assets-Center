import type { Metadata } from "next";
import { PlaniShell } from "@/components/plani/PlaniShell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Presentaciones",
  description: "El material de cada tarea, listo para el cliente: planificaciones, ads, programática y más.",
};

export default function PresentacionesPage() {
  return <PlaniShell />;
}
