import type { Metadata } from "next";
import { FusionPagina } from "@/components/rest/fusion/FusionPagina";

export const metadata: Metadata = {
  title: "Fusión · Rest",
  description: "Juntá fichas iguales hasta llegar a 2048. Con ranking del estudio.",
};

export default function FusionPage() {
  return <FusionPagina />;
}
