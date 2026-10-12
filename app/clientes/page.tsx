import type { Metadata } from "next";
import { ClientsShell } from "@/components/clients/ClientsShell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Clientes",
  description: "Cada cliente con su logo, sus colores, sus tipografías y todo lo que tiene a su nombre.",
};

export default function ClientesPage() {
  return <ClientsShell />;
}
