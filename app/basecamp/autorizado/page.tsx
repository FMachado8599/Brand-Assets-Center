import type { Metadata } from "next";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { BasecampMark } from "@/components/tareas/comun";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Conectar Basecamp",
  description: "La conexión de Basecamp del estudio, autorizada con el link de un admin de Herramientas.",
};

type Props = { searchParams: { basecamp?: string; motivo?: string; persona?: string; admin?: string } };

/**
 * Donde termina quien autorizó la conexión con el link que generó un admin de la app. Pública: esa
 * persona no tiene por qué tener cuenta en Herramientas.
 */
export default function BasecampAutorizadoPage({ searchParams }: Props) {
  const ok = searchParams.basecamp === "conectado";
  const noAdmin = ok && searchParams.admin === "no";
  const Icono = !ok ? XCircle : noAdmin ? AlertTriangle : CheckCircle2;

  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center px-4 py-24">
      <section className="w-full rounded-3xl border bg-card p-6 text-center shadow-sm sm:p-8">
        <div className="relative mx-auto h-14 w-14">
          <BasecampMark className="h-14 w-14" />
          <Icono
            className={`absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-card ${!ok ? "text-destructive" : noAdmin ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}
          />
        </div>
        <h1 className="mt-4 font-display text-3xl leading-tight">
          {!ok ? "No se pudo conectar" : searchParams.persona ? `Listo, ${searchParams.persona.split(" ")[0]}` : "Listo"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {!ok
            ? (searchParams.motivo ?? "Basecamp no autorizó la conexión.")
            : "Basecamp quedó conectado a Herramientas con tu cuenta. Desde ahora la app trae las tareas y los avisos sola: no tenés que hacer nada más."}
        </p>
        {noAdmin && (
          <p className="mt-4 rounded-xl bg-primary/20 p-3 text-left text-sm">
            Tu cuenta no es admin de Basecamp: la app solo va a ver los proyectos donde estás vos. Si tiene que ver todo, avisale a quien
            te mandó el link para que genere otro para un admin.
          </p>
        )}
        <p className="mt-6 text-xs text-muted-foreground">{ok ? "Ya podés cerrar esta pestaña." : "Pedile a quien te mandó el link que genere uno nuevo."}</p>
      </section>
    </main>
  );
}
