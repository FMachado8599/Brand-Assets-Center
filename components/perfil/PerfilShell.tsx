"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DatabaseZap, Eye, SquareKanban } from "lucide-react";
import { Section } from "@/components/clients/profile/Section";
import { BarButton, BarDivider, ContextBar } from "@/components/shell/ContextBar";
import { useAccount } from "@/components/shell/AccountProvider";
import { MarcasDialog } from "@/components/tareas/equipo/MarcasDialog";
import { useClients } from "@/hooks/useClients";
import { cambiarEquipo, useEquipo } from "@/hooks/useEquipo";
import { useMiPerfil } from "@/hooks/useMiPerfil";
import { equipoRepo } from "@/lib/board/equipo";
import { cumpleDe } from "@/lib/cumple";
import { fotoElegida, fueraDeOficina, nombreDe } from "@/lib/perfil";
import { abrirPerfil } from "./abrir";
import { AcentoEditor, EstadoEditor, FotoEditor, NombreEditor, PortadaEditor, RedesEditor } from "./Editores";
import { ContrasenaEditor } from "./Contrasena";
import { FechasEditor } from "./Fechas";
import { SlackPrefs } from "./SlackPrefs";
import { Companeros, EnElEstudio } from "./EnElEstudio";
import { EstadoLinea, FotoPerfil, Portada, PuestoPills, RedesLinks } from "./piezas";
import { relacionesDe } from "./relaciones";

/**
 * /perfil: el perfil propio. Lo personal (foto, nombre, estado, color) se edita acá y se guarda solo;
 * lo del Board (puesto, hub, jefes, marcas) se muestra tal cual lo cargó un admin, y las marcas propias
 * (principales y secundarias, entre las de Basecamp) se eligen desde acá. Abajo, la gente con la que trabajás: tocás a alguien y ves su perfil.
 */
export function PerfilShell() {
  const router = useRouter();
  const account = useAccount();
  const { perfil, loaded, sinMigracion, error, guardar } = useMiPerfil();
  const equipo = useEquipo();
  const { clients } = useClients();
  const [marcas, setMarcas] = useState(false);

  useEffect(() => {
    document.title = "Tu perfil · Herramientas";
  }, []);

  const user = account?.user ?? null;
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const google = (typeof meta.avatar_url === "string" && meta.avatar_url) || (typeof meta.picture === "string" && meta.picture) || perfil?.avatar_url || null;
  const nombreGoogle = perfil?.full_name || (typeof meta.full_name === "string" ? meta.full_name : null) || (typeof meta.name === "string" ? meta.name : null);

  const data = equipo.data;
  const yo = data?.personas.find((p) => p.id === data.yo?.equipo_id) ?? null;
  // El Board todavía puede no estar (falta su migración): entonces el perfil es solo lo personal.
  const conBoard = !equipo.sinMigracion && !equipo.error;
  const rel = yo && data ? relacionesDe(yo, data, clients) : null;

  const bar = (
    <ContextBar>
      <span className="px-2 text-sm font-semibold tracking-tight text-cream">Tu perfil</span>
      {yo && (
        <>
          <BarDivider />
          <BarButton label="Ver cómo te ven tus compañeros" icon={Eye} onClick={() => abrirPerfil(yo.id)} />
        </>
      )}
      {conBoard && (
        <BarButton label="Ir a Status" icon={SquareKanban} onClick={() => router.push("/board")} />
      )}
    </ContextBar>
  );

  if (!account?.ready || (user && !loaded)) {
    return (
      <>
        {bar}
        <main className="mx-auto max-w-5xl px-4 pb-20 pt-[5.5rem] sm:px-6">
          <div className="skeleton h-56 rounded-[1.75rem]" />
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="skeleton h-72 rounded-[1.75rem]" />
            <div className="skeleton h-72 rounded-[1.75rem]" />
          </div>
        </main>
      </>
    );
  }

  if (!user || !perfil) {
    return (
      <>
        {bar}
        <main className="mx-auto flex max-w-md flex-col items-center px-4 pb-16 pt-40 text-center">
          <p className="eyebrow">Tu perfil</p>
          <h1 className="mt-3 font-display text-4xl">{user ? "No encontramos tu perfil" : "Iniciá sesión"}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {user
              ? (error ?? "Tu cuenta todavía no tiene perfil: falta correr supabase/migracion-usuarios.sql en Supabase.")
              : "Entrá con tu cuenta para ver y editar tu perfil."}
          </p>
        </main>
      </>
    );
  }

  const nombre = nombreDe(perfil, nombreGoogle);
  const foto = fotoElegida(perfil, yo?.avatar_bc) ?? google;
  const acento = perfil.acento;
  const fuera = fueraDeOficina(perfil);
  const bloqueado = sinMigracion;
  const puestos = rel?.puestos.map((p) => p.nombre) ?? [];

  return (
    <>
      {bar}
      <main className="mx-auto max-w-5xl px-4 pb-20 pt-[5.5rem] sm:px-6">
        {sinMigracion && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl bg-primary/25 px-4 py-3 text-sm">
            <DatabaseZap className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Para guardar tu foto, tu estado y tu color falta un paso en la base: correr{" "}
              <code className="rounded bg-foreground/10 px-1 text-[13px]">supabase/migracion-perfil.sql</code> en Supabase → SQL Editor.
            </p>
          </div>
        )}

        {/* Arriba: cómo te ven */}
        <header className="overflow-hidden rounded-[1.75rem] border border-foreground/[0.06] bg-card shadow-[0_1px_2px_hsl(40_30%_20%/0.04),0_18px_40px_-28px_hsl(40_45%_20%/0.3)]">
          <Portada perfil={perfil} />
          {/* En el celular la portada es finita: la foto va debajo, sin taparle el logo. */}
          <div className="flex flex-col gap-4 px-5 pb-6 pt-4 sm:flex-row sm:items-end sm:gap-6 sm:px-8 sm:pt-0">
            <FotoPerfil nombre={nombre} url={foto} acento={acento} fuera={Boolean(fuera)} size={116} className="sm:-mt-14" />
            <div className="min-w-0 flex-1 sm:pt-5">
              <p className="eyebrow">
                Tu perfil <span className="text-primary">\</span>
              </p>
              <h1 className="mt-1 truncate font-display text-[2.6rem] leading-none sm:text-5xl">{nombre}</h1>
              <PuestoPills puestos={puestos} acento={acento} className="mt-2.5" />
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="truncate text-sm text-muted-foreground">{user.email}</span>
                <RedesLinks redes={perfil.redes} size="sm" />
              </div>
              <EstadoLinea perfil={perfil} className="mt-3" vacio="Sin estado: contale al estudio en qué andás." />
            </div>
            {yo && (
              <button
                type="button"
                onClick={() => abrirPerfil(yo.id)}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 self-start rounded-full border bg-card px-3.5 text-[13px] font-medium shadow-sm transition-colors hover:border-foreground/30 sm:self-end"
              >
                <Eye className="h-4 w-4" /> Cómo te ven
              </button>
            )}
          </div>
        </header>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <Section title="Estado" hint="Lo ve todo el estudio: en tu perfil, en Status y en el organigrama.">
            <EstadoEditor key={perfil.id} perfil={perfil} guardar={guardar} disabled={bloqueado} />
          </Section>

          <div className="grid min-w-0 grid-cols-1 content-start gap-4">
            <Section title="Foto">
              <FotoEditor perfil={perfil} nombre={nombre} google={google} basecamp={yo?.avatar_bc ?? null} guardar={guardar} disabled={bloqueado} />
            </Section>
            <Section title="Nombre y color">
              <div className="space-y-5">
                <NombreEditor key={perfil.id} perfil={perfil} guardar={guardar} disabled={bloqueado} />
                <div className="space-y-2">
                  <p className="eyebrow">Tu color</p>
                  <AcentoEditor perfil={perfil} guardar={guardar} disabled={bloqueado} />
                  <p className="text-xs text-muted-foreground">El aro de tu foto y tu puesto cuando alguien te abre.</p>
                </div>
                <div className="space-y-2">
                  <p className="eyebrow">Portada</p>
                  <PortadaEditor perfil={perfil} guardar={guardar} disabled={bloqueado} />
                </div>
              </div>
            </Section>
            <Section title="Fechas para festejar" hint="Las ve el estudio: en tu perfil, en el Inicio y en el Calendario, para saludarte.">
              <FechasEditor
                perfil={perfil}
                guardar={guardar}
                disabled={bloqueado}
                cumple={
                  !equipo.loaded
                    ? undefined
                    : yo
                      ? {
                          valor: cumpleDe(yo),
                          guardar: (c) =>
                            cambiarEquipo(() => equipoRepo.miCumple(c?.dia ?? null, c?.mes ?? null), c ? "Cumpleaños guardado 🎂" : "Cumpleaños borrado"),
                        }
                      : null
                }
              />
            </Section>
            <Section title="Tus redes" hint="Si te animás: el link o tu usuario. Las ve el estudio en tu perfil.">
              <RedesEditor perfil={perfil} guardar={guardar} disabled={bloqueado} />
            </Section>
            {yo && (
              <Section title="Avisos por Slack" hint="Lo que te llega por privado. Lo que sea de una marca va a su canal.">
                <SlackPrefs equipoId={yo.id} />
              </Section>
            )}
            <Section title="Contraseña">
              <ContrasenaEditor />
            </Section>
          </div>
        </div>

        {conBoard && (
          <div className="mt-4 grid grid-cols-1 gap-4">
            <Section
              title="En el estudio"
              hint={yo ? "De Status. Puesto, hub y jefes los carga un admin en Organización. Tus marcas salen de Basecamp: vos elegís cuáles son principales y cuáles secundarias." : undefined}
            >
              {!equipo.loaded ? (
                <div className="skeleton h-40 rounded-2xl" />
              ) : rel ? (
                <EnElEstudio
                  rel={rel}
                  propio
                  onPersona={abrirPerfil}
                  accionMarcas={
                    <button
                      type="button"
                      onClick={() => setMarcas(true)}
                      className="h-8 rounded-full border bg-card px-3 text-[13px] font-medium shadow-sm transition-colors hover:border-foreground/30"
                    >
                      Principales y secundarias
                    </button>
                  }
                />
              ) : (
                <p className="rounded-2xl border border-dashed border-foreground/15 px-4 py-5 text-center text-sm text-muted-foreground">
                  Todavía no estás en el equipo de Status. Un admin te suma desde{" "}
                  <Link href="/board/organizacion" className="font-medium text-foreground underline-offset-2 hover:underline">
                    Organización
                  </Link>{" "}
                  (o con &quot;Traer gente nueva de Basecamp&quot;).
                </p>
              )}
            </Section>

            {rel && (
              <Section title="Con quién trabajás" hint="Los que trabajan tus mismas marcas y la gente de tu hub. Tocá a alguien para ver su perfil.">
                <Companeros
                  companeros={rel.companeros}
                  onPersona={abrirPerfil}
                  vacio={
                    rel.marcas.length || rel.secundarias.length || rel.hub
                      ? "Todavía no hay nadie más en tus marcas ni en tu hub."
                      : "Marcá tus marcas principales y secundarias y vas a ver acá a la gente con la que las trabajás."
                  }
                />
              </Section>
            )}
          </div>
        )}
      </main>

      {marcas && yo && data && (
        <MarcasDialog persona={yo} data={data} marcas={clients} editable admin={equipo.admin} propia onClose={() => setMarcas(false)} />
      )}
    </>
  );
}
