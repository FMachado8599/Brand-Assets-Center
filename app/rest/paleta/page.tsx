import type { Metadata } from "next";
import { PaletaPagina } from "@/components/rest/paleta/PaletaPagina";

export const metadata: Metadata = {
  title: "Paleta · Rest",
  description: "¿De quién es esta paleta? Adiviná la marca del estudio por sus colores. Con ranking del estudio.",
};

export default function PaletaPage() {
  return <PaletaPagina />;
}
