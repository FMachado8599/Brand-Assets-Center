import type { Metadata } from "next";
import { SlackView } from "@/components/tareas/SlackView";
import { SoloAdmins } from "@/components/tareas/comun";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Slack · Board",
  description: "El bot de Slack del estudio: los avisos de cada mañana, la gente vinculada y el canal de cada marca.",
};

/** Solo admins: la conexión con Slack, el canal del estudio y los canales de las marcas. */
export default function SlackPage() {
  return (
    <SoloAdmins titulo="Slack">
      <SlackView />
    </SoloAdmins>
  );
}
