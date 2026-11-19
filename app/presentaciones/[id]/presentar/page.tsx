import type { Metadata } from "next";
import { Presentacion } from "@/components/plani/Presentacion";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Presentar",
  description: "La presentación como la ve el cliente: portada, calendario, feed y cada pieza con su mockup.",
};

export default function PresentarPage({ params }: { params: { id: string } }) {
  return <Presentacion id={params.id} />;
}
