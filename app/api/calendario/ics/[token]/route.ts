import { NextResponse, type NextRequest } from "next/server";
import { armarIcs, type EventoIcs } from "@/lib/calendario/ics";
import { cumpleEn, MESES } from "@/lib/cumple";
import { appOrigin } from "@/lib/integraciones/store";
import { createSupabaseAnon, hasSupabaseEnv } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const ZONA = process.env.APP_TIMEZONE || "America/Montevideo";

type Datos = {
  nombre: string | null;
  tareas: { id: number; titulo: string; marca: string | null; proyecto: string | null; tablero: string | null; fecha: string; app_url: string | null }[];
  cumples: { persona_id: string; nombre: string; dia: number; mes: number; companero: boolean; yo: boolean }[];
};

/**
 * El calendario personal de cada uno, para suscribirse desde Google Calendar u Outlook ("Desde URL"):
 * sus entregas y los cumpleaños del estudio. Sin sesión: la llave es el token del link, que la base
 * valida (agenda_ics, supabase/migracion-calendario.sql). Un link que no sirve da 404.
 */
export async function GET(request: NextRequest, { params }: { params: { token: string } }) {
  if (!hasSupabaseEnv) return new NextResponse("Falta configurar Supabase", { status: 503 });
  const token = params.token.replace(/\.ics$/i, "");
  if (!/^[0-9a-f]{64}$/.test(token)) return new NextResponse("No encontrado", { status: 404 });

  const { data, error } = await createSupabaseAnon().rpc("agenda_ics", { p_token: token });
  if (error) return new NextResponse("No se pudo armar el calendario", { status: 503 });
  if (!data) return new NextResponse("No encontrado", { status: 404 });
  const d = data as Datos;
  const origen = appOrigin(request.url);
  const anio = new Date().getFullYear();

  const eventos: EventoIcs[] = [
    ...d.tareas.map((t) => ({
      uid: `tarea-${t.id}@herramientas`,
      fecha: t.fecha,
      titulo: `📌 ${t.titulo || "Tarea"}${t.marca || t.proyecto ? ` · ${t.marca || t.proyecto}` : ""}`,
      descripcion: ["Entrega de una tarea tuya.", t.tablero ? `Tablero: ${t.tablero}` : null, t.app_url ? `Basecamp: ${t.app_url}` : null]
        .filter(Boolean)
        .join("\n"),
      url: `${origen}/board?tarea=${t.id}`,
    })),
    ...d.cumples.map((c) => ({
      uid: `cumple-${c.persona_id}@herramientas`,
      // Desde un año bisiesto, así el 29 de febrero es una fecha válida.
      fecha: cumpleEn({ dia: c.dia, mes: c.mes }, 2024),
      titulo: c.yo ? "🎂 Tu cumpleaños" : `🎂 Cumple de ${c.nombre}`,
      descripcion: `${c.dia} de ${MESES[c.mes - 1]}${c.companero ? " · trabajan juntos" : ""}`,
      url: c.yo ? `${origen}/perfil` : `${origen}/saludar?a=${c.persona_id}`,
      anual: true,
      finDeFebrero: c.mes === 2 && c.dia === 29,
    })),
  ];

  const ics = armarIcs({
    nombre: "Herramientas · Estudio",
    descripcion: `Las entregas${d.nombre ? ` de ${d.nombre}` : ""} y los cumpleaños del estudio (${anio}).`,
    zona: ZONA,
    eventos,
  });
  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="herramientas.ics"',
      "Cache-Control": "private, max-age=900",
    },
  });
}
