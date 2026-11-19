import type { Metadata } from "next";
import { RetoqueShell } from "@/components/retoque/RetoqueShell";
import { hasMagnificKey } from "@/lib/magnific/api";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Retoque",
  description: "Quitale el fondo a una imagen con Magnific.",
};

export default function RetoquePage() {
  return <RetoqueShell configured={hasMagnificKey()} />;
}
