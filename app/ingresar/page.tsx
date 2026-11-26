import { Suspense } from "react";
import type { Metadata } from "next";
import { Ingresar } from "@/components/auth/Ingresar";

export const metadata: Metadata = {
  title: "Entrar",
  description: "Entrá a Herramientas con tu mail y contraseña, o con Google.",
};

export default function IngresarPage() {
  return (
    <Suspense>
      <Ingresar />
    </Suspense>
  );
}
