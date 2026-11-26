import type { Metadata } from "next";
import { Suspense } from "react";
import { Saludar } from "@/components/saludar/Saludar";

export const metadata: Metadata = {
  title: "Saludar",
  description: "Mandale un saludo por Slack a un compañero que cumple años.",
};

/** /saludar?a=<persona>: el link del aviso de cumpleaños de Slack. */
export default function SaludarPage() {
  return (
    <Suspense fallback={null}>
      <Saludar />
    </Suspense>
  );
}
