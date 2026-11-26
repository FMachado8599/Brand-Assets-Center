import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DownloadMetrics } from "@/components/downloads/metrics/DownloadMetrics";
import { downloadsAdmin } from "@/lib/downloads/admin.server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Métricas de Descargas",
  description: "Quién baja qué en Descargas, desde dónde y cuánto.",
};

export default async function MetricasPage() {
  const admin = await downloadsAdmin();
  // Para el resto, la página no existe.
  if (admin === "no") notFound();
  if (admin === "sin-migracion") {
    return (
      <main className="mx-auto max-w-xl px-4 pb-16 pt-[6.5rem] text-center sm:px-6">
        <h1 className="font-display text-4xl leading-none">Métricas</h1>
        <p className="mt-4 text-sm text-muted-foreground">
          Falta crear el registro de descargas en la base: en Supabase → SQL Editor, corré{" "}
          <code>supabase/migracion-descargas-registro.sql</code> y volvé a abrir esta página.
        </p>
        <Link href="/descargas" className="mt-6 inline-block text-sm font-medium underline underline-offset-4">
          Volver a Descargas
        </Link>
      </main>
    );
  }
  return <DownloadMetrics />;
}
