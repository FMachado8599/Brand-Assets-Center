import type { Metadata } from "next";
import { CalendarioView } from "@/components/calendario/CalendarioView";

export const metadata: Metadata = {
  title: "Calendario",
  description: "Las entregas, las reuniones del calendario del estudio, los cumpleaños y los feriados, mes a mes.",
};

export default function CalendarioPage() {
  return <CalendarioView />;
}
