import type { Metadata } from "next";
import { PlaniShell } from "@/components/plani/PlaniShell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Planificación",
  description: "Las planis del mes de cada cliente: copys, diseño, aprobaciones y lo que se programa.",
};

export default function PlanificacionPage() {
  return <PlaniShell />;
}
