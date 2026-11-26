import type { Metadata } from "next";
import { RestHub } from "@/components/rest/RestHub";

export const metadata: Metadata = {
  title: "Rest",
  description: "Un recreo: juegos cortos con ranking semanal del estudio.",
};

export default function RestPage() {
  return <RestHub />;
}
