import type { Metadata } from "next";
import { ClientesView } from "@/components/influencers/ClientesView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Influencers por cliente" };

export default function InfluencersClientesPage() {
  return <ClientesView />;
}
