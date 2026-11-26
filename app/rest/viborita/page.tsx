import type { Metadata } from "next";
import { ViboritaPagina } from "@/components/rest/viborita/ViboritaPagina";

export const metadata: Metadata = {
  title: "Viborita · Rest",
  description: "La viborita: comé frutas, crecé y no te choques. Con ranking del estudio.",
};

export default function ViboritaPage() {
  return <ViboritaPagina />;
}
