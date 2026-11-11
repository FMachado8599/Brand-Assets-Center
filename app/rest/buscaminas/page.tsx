import type { Metadata } from "next";
import { BuscaminasPagina } from "@/components/rest/buscaminas/BuscaminasPagina";

export const metadata: Metadata = {
  title: "Buscaminas · Rest",
  description: "El buscaminas de siempre, en tres dificultades y con ranking del estudio.",
};

export default function BuscaminasPage() {
  return <BuscaminasPagina />;
}
