import type { Metadata } from "next";
import { ClientProfile } from "@/components/clients/ClientProfile";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cliente",
  description: "Logo, colores, tipografías, productos, tarjetas y redacciones de un cliente.",
};

export default function ClientePage({ params }: { params: { id: string } }) {
  return <ClientProfile id={params.id} />;
}
