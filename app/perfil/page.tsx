import type { Metadata } from "next";
import { PerfilShell } from "@/components/perfil/PerfilShell";

export const metadata: Metadata = {
  title: "Tu perfil",
  description: "Tu foto, tu nombre, tu estado y lo tuyo en el estudio: puesto, hub, marcas y con quién trabajás.",
};

export default function PerfilPage() {
  return <PerfilShell />;
}
