import type { Metadata } from "next";
import { Presentacion } from "@/components/plani/Presentacion";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Presentación",
  description: "La plani presentada: portada, calendario, feed y cada pieza con su mockup.",
};

export default function PresentacionPage({ params }: { params: { id: string } }) {
  return <Presentacion id={params.id} />;
}
