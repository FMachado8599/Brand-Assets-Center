import type { Metadata } from "next";
import { Wrapped } from "@/components/inicio/Wrapped";

export const metadata: Metadata = {
  title: "Wrapped",
  description: "Tu año en Herramientas, en historias.",
};

export default function WrappedPage() {
  return <Wrapped />;
}
