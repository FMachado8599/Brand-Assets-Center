import type { Metadata } from "next";
import { DinoPagina } from "@/components/rest/dino/DinoPagina";

export const metadata: Metadata = {
  title: "Dino · Rest",
  description: "El juego del dino: saltá los cactus y agachate ante los pájaros, con ranking del estudio.",
};

export default function DinoPage() {
  return <DinoPagina />;
}
