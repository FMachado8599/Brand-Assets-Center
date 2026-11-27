import type { Metadata } from "next";
import { CampanasView } from "@/components/influencers/CampanasView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Campañas de influencers" };

export default function InfluencersCampanasPage() {
  return <CampanasView />;
}
