import type { Metadata } from "next";
import { PlaniCliente } from "@/components/plani/PlaniCliente";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Presentación",
  // Un link privado: que no lo indexe ningún buscador.
  robots: { index: false, follow: false },
};

export default function PlaniClientePage({ params }: { params: { token: string } }) {
  return <PlaniCliente token={params.token} />;
}
