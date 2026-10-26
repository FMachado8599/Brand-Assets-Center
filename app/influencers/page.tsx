import type { Metadata } from "next";
import { InfluencersView } from "@/components/influencers/InfluencersView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Influencers",
  description: "Quiénes trabajaron con cada cliente y cómo rindieron, con las campañas de Influencity.",
};

export default function InfluencersPage() {
  return <InfluencersView />;
}
