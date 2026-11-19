import { Suspense } from "react";
import type { Metadata } from "next";
import { CrearContrasena } from "@/components/auth/CrearContrasena";

export const metadata: Metadata = {
  title: "Tu contraseña",
  description: "Creá o cambiá tu contraseña de Herramientas con el link que te mandaron.",
  // El link lleva un token de un solo uso: que no lo indexe nadie ni se mande como referer.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function ContrasenaPage() {
  return (
    <Suspense>
      <CrearContrasena />
    </Suspense>
  );
}
