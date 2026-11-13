import type { Metadata } from "next";
import { IconsShell } from "@/components/library/iconos/IconsShell";
import { hasMagnificKey } from "@/lib/magnific/api";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Íconos",
  description: "Íconos de Magnific para copiar en SVG o PNG.",
};

export default function IconosPage() {
  return <IconsShell configured={hasMagnificKey()} />;
}
