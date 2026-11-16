import type { Metadata } from "next";
import { BasecampView } from "@/components/tareas/BasecampView";
import { SoloAdmins } from "@/components/tareas/comun";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Basecamp · Board",
  description: "La cuenta de Basecamp del estudio, la sincronización y lo que hay de cada proyecto.",
};

/** Solo admins: la conexión del estudio con Basecamp y la sincronización. */
export default function BasecampPage() {
  return (
    <SoloAdmins titulo="Basecamp">
      <BasecampView />
    </SoloAdmins>
  );
}
