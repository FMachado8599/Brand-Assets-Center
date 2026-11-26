import type { SupabaseClient } from "@supabase/supabase-js";
import { Drive } from "./google";
import { guardarDatos } from "./store";

/**
 * El Google Calendar del estudio: el de la misma cuenta de Google que el Drive (camtbwa@gmail.com),
 * con el permiso de Calendar (CALENDAR_SCOPE). Por defecto el calendario principal de esa cuenta; un
 * admin puede elegir otro de los suyos desde el Calendario de la app.
 *
 * Lee las reuniones y los feriados para mostrarlos en el Calendario, y crea reuniones con invitados
 * (les llega la invitación a su mail, sea Gmail u Outlook) y, si se pide, con link de Meet.
 */

const API = "https://www.googleapis.com/calendar/v3";

/** Los feriados de Uruguay (calendario público de Google). Se puede cambiar con GOOGLE_FERIADOS_CALENDARIO. */
const FERIADOS = process.env.GOOGLE_FERIADOS_CALENDARIO || "es.uy#holiday@group.v.calendar.google.com";

export const ZONA_CALENDARIO = process.env.APP_TIMEZONE || "America/Montevideo";

/** Un evento tal como lo muestra la app. inicio/fin: AAAA-MM-DD (todo el día) o fecha y hora con zona. */
export type EventoEstudio = {
  id: string;
  titulo: string;
  inicio: string;
  fin: string;
  todoElDia: boolean;
  link: string | null;
  meet: string | null;
  ubicacion: string | null;
  descripcion: string | null;
  invitados: { email: string; nombre: string | null; respuesta: string | null }[];
  /** Quién lo agendó desde la app (si se agendó desde acá). */
  creadoPor: string | null;
  brandId: string | null;
};

export type Feriado = { fecha: string; nombre: string };

type GEvento = {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  hangoutLink?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  attendees?: { email: string; displayName?: string; responseStatus?: string; resource?: boolean }[];
  extendedProperties?: { private?: Record<string, string> };
  conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
};

/** Lo que se puede guardar o mostrar de un evento de Google (sin HTML en la descripción). */
function aEvento(e: GEvento): EventoEstudio {
  const todoElDia = Boolean(e.start?.date);
  const meet = e.hangoutLink ?? e.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video")?.uri ?? null;
  return {
    id: e.id,
    titulo: e.summary?.trim() || "(Sin título)",
    inicio: e.start?.date ?? e.start?.dateTime ?? "",
    fin: e.end?.date ?? e.end?.dateTime ?? "",
    todoElDia,
    link: e.htmlLink ?? null,
    meet,
    ubicacion: e.location ?? null,
    descripcion: e.description ? e.description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 600) : null,
    invitados: (e.attendees ?? [])
      .filter((a) => !a.resource)
      .slice(0, 50)
      .map((a) => ({ email: a.email, nombre: a.displayName ?? null, respuesta: a.responseStatus ?? null })),
    creadoPor: e.extendedProperties?.private?.creado_por ?? null,
    brandId: e.extendedProperties?.private?.brand_id ?? null,
  };
}

export type NuevoEvento = {
  titulo: string;
  fecha: string;
  /** "HH:MM"; sin hora es de todo el día. */
  hora?: string | null;
  /** Minutos (con hora). */
  duracion?: number;
  descripcion?: string | null;
  ubicacion?: string | null;
  invitados: string[];
  meet: boolean;
  brandId?: string | null;
};

/** "2026-11-28T10:30" + 90 min → "2026-11-28T12:00:00": la hora de pared, sin pasar por otra zona. */
function sumarMinutos(fecha: string, hora: string, minutos: number) {
  const [y, m, d] = fecha.split("-").map(Number);
  const [h, mi] = hora.split(":").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d, h, mi + minutos));
  return t.toISOString().slice(0, 19);
}

const diaSiguiente = (fecha: string) => {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
};

export class CalendarioEstudio {
  private constructor(
    private db: SupabaseClient,
    private drive: Drive
  ) {}

  /** null si Google no está conectado. `permiso` dice si la conexión tiene el permiso de Calendar. */
  static async desde(db: SupabaseClient) {
    const drive = await Drive.desde(db);
    if (!drive) return null;
    return new CalendarioEstudio(db, drive);
  }

  get permiso() {
    return this.drive.datos.calendario === true;
  }

  get cuenta() {
    return this.drive.email;
  }

  get id() {
    const id = this.drive.datos.calendario_id;
    return typeof id === "string" && id ? id : "primary";
  }

  get nombre() {
    const n = this.drive.datos.calendario_nombre;
    return typeof n === "string" && n ? n : this.drive.email;
  }

  private async json<T>(url: string, init?: RequestInit): Promise<T> {
    const r = await this.drive.fetch(url, init);
    if (r.status === 204) return undefined as T;
    const body = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = body?.error?.message ?? `error ${r.status}`;
      if (r.status === 403 && /insufficient|scope/i.test(msg)) {
        throw new Error("La conexión de Google no tiene el permiso de Calendar: volvé a conectar Google (lo hace un admin) y tildá Google Calendar.");
      }
      if (r.status === 403 && /has not been used|disabled/i.test(msg)) {
        throw new Error("Falta activar la Google Calendar API en el proyecto de Google Cloud de la app.");
      }
      throw new Error(`Google Calendar respondió ${r.status}: ${msg}`);
    }
    return body as T;
  }

  /**
   * Los eventos entre dos días (inclusive), con los repetidos ya expandidos. Los bordes van en hora de
   * Montevideo (UTC−3 todo el año: Uruguay no tiene horario de verano), con unas horas de margen.
   */
  async eventos(desde: string, hasta: string, calendario = this.id): Promise<GEvento[]> {
    const out: GEvento[] = [];
    let page: string | undefined;
    for (let i = 0; i < 5; i++) {
      const params = new URLSearchParams({
        singleEvents: "true",
        orderBy: "startTime",
        timeMin: `${desde}T00:00:00-03:00`,
        timeMax: `${diaSiguiente(hasta)}T03:00:00-03:00`,
        timeZone: ZONA_CALENDARIO,
        maxResults: "250",
      });
      if (page) params.set("pageToken", page);
      const r = await this.json<{ items?: GEvento[]; nextPageToken?: string }>(`${API}/calendars/${encodeURIComponent(calendario)}/events?${params}`);
      out.push(...(r.items ?? []).filter((e) => e.status !== "cancelled"));
      page = r.nextPageToken;
      if (!page) break;
    }
    return out;
  }

  async reuniones(desde: string, hasta: string) {
    return (await this.eventos(desde, hasta)).map(aEvento);
  }

  /** Los feriados del rango. Si no se pueden leer, ninguno (no frena lo demás). */
  async feriados(desde: string, hasta: string): Promise<Feriado[]> {
    try {
      return (await this.eventos(desde, hasta, FERIADOS))
        .filter((e) => e.start?.date)
        .map((e) => ({ fecha: e.start!.date!, nombre: e.summary ?? "Feriado" }));
    } catch {
      return [];
    }
  }

  /** Agenda una reunión. A los invitados les llega la invitación por mail (sendUpdates=all). */
  async crear(e: NuevoEvento, creadoPor: string) {
    const todoElDia = !e.hora;
    const cuerpo: Record<string, unknown> = {
      summary: e.titulo,
      description: e.descripcion || undefined,
      location: e.ubicacion || undefined,
      start: todoElDia ? { date: e.fecha } : { dateTime: `${e.fecha}T${e.hora}:00`, timeZone: ZONA_CALENDARIO },
      end: todoElDia
        ? { date: diaSiguiente(e.fecha) }
        : { dateTime: sumarMinutos(e.fecha, e.hora!, e.duracion ?? 60), timeZone: ZONA_CALENDARIO },
      attendees: e.invitados.map((email) => ({ email })),
      extendedProperties: { private: { herramientas: "1", creado_por: creadoPor, ...(e.brandId ? { brand_id: e.brandId } : {}) } },
      reminders: { useDefault: true },
    };
    if (e.meet) {
      cuerpo.conferenceData = {
        createRequest: { requestId: `herramientas-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, conferenceSolutionKey: { type: "hangoutsMeet" } },
      };
    }
    const r = await this.json<GEvento>(
      `${API}/calendars/${encodeURIComponent(this.id)}/events?sendUpdates=all${e.meet ? "&conferenceDataVersion=1" : ""}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) }
    );
    return aEvento(r);
  }

  async evento(id: string) {
    return aEvento(await this.json<GEvento>(`${API}/calendars/${encodeURIComponent(this.id)}/events/${encodeURIComponent(id)}`));
  }

  /** Lo cancela y les avisa a los invitados. */
  async borrar(id: string) {
    await this.json(`${API}/calendars/${encodeURIComponent(this.id)}/events/${encodeURIComponent(id)}?sendUpdates=all`, { method: "DELETE" });
  }

  /** Los calendarios de la cuenta en los que se puede escribir (para elegir cuál usa el estudio). */
  async calendarios() {
    const r = await this.json<{ items?: { id: string; summary?: string; summaryOverride?: string; primary?: boolean; accessRole?: string }[] }>(
      `${API}/users/me/calendarList?minAccessRole=writer&maxResults=250`
    );
    return (r.items ?? []).map((c) => ({ id: c.primary ? "primary" : c.id, nombre: c.summaryOverride || c.summary || c.id, principal: Boolean(c.primary) }));
  }

  async elegir(id: string, nombre: string) {
    await guardarDatos(this.db, "google", { ...this.drive.datos, calendario_id: id, calendario_nombre: nombre });
  }
}
