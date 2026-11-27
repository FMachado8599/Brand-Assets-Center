import type { Metadata } from "next";
import { PerfilView } from "@/components/influencers/PerfilView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Influencer" };

export default function InfluencerPage({ params }: { params: { id: string } }) {
  return <PerfilView id={params.id} />;
}
