import type { Metadata } from "next";
import { ConexionView } from "@/components/influencers/ConexionView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Influencity" };

export default function InfluencityPage() {
  return <ConexionView />;
}
