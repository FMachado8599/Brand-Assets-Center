import { esc, link, type SlackBlock, type SlackMensaje } from "@/lib/integraciones/slack";

/**
 * Los mensajes que manda el bot, armados con Block Kit. `text` es lo que se ve en la notificación del
 * celular (y lo que lee un lector de pantalla); los bloques, lo que se ve en Slack.
 * `origen` es la dirección de la app (para los links a Herramientas).
 */

const seccion = (texto: string): SlackBlock => ({ type: "section", text: { type: "mrkdwn", text: texto.slice(0, 2900) } });
const contexto = (texto: string): SlackBlock => ({ type: "context", elements: [{ type: "mrkdwn", text: texto.slice(0, 2900) }] });
const boton = (texto: string, url: string, primario = false): Record<string, unknown> => ({
  type: "button",
  text: { type: "plain_text", text: texto.slice(0, 75), emoji: true },
  url,
  ...(primario ? { style: "primary" } : {}),
});
const botones = (lista: Record<string, unknown>[]): SlackBlock => ({ type: "actions", elements: lista.slice(0, 5) });

/** Una persona: la mención de Slack si se conoce (se toca y abre su perfil y el privado), si no su nombre. */
export const quien = (p: { nombre: string; slack_id?: string | null }) => (p.slack_id ? `<@${p.slack_id}>` : `*${esc(p.nombre)}*`);

/** "Ana", "Ana y Juan", "Ana, Juan y Pedro". */
export function lista(items: string[]) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

const cita = (texto: string | null | undefined) =>
  texto?.trim()
    ? esc(texto.trim().slice(0, 600))
        .split("\n")
        .map((l) => `> ${l}`)
        .join("\n")
    : "";

/** "2026-11-28" → "vie 28 nov". */
export function fechaCorta(iso: string, zona: string) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12))
    .toLocaleDateString("es-UY", { weekday: "short", day: "numeric", month: "short", timeZone: zona })
    .replace(/[.,]/g, "");
}

/* ───────────── Cumpleaños ───────────── */

export type Cumpleanero = { persona_id: string; nombre: string; slack_id: string | null };
export type Fuera = { persona_id: string; nombre: string; slack_id: string | null; hasta: string };

/** El aviso del día en el canal del estudio: quién cumple y quién está fuera de oficina. */
export function avisoEstudio(cumples: Cumpleanero[], fuera: Fuera[], hoy: string, zona: string): SlackMensaje {
  const blocks: SlackBlock[] = [];
  const nombres = cumples.map((c) => c.nombre);
  if (cumples.length) {
    const verbo = cumples.length === 1 ? "cumple" : "cumplen";
    blocks.push(seccion(`🎂 *Hoy ${verbo} ${lista(cumples.map(quien))}* ¡Feliz cumple! 🎉`));
  }
  if (fuera.length) {
    const linea = fuera.map((f) => `${esc(f.nombre)} (${f.hasta === hoy ? "hoy" : `hasta el ${fechaCorta(f.hasta, zona)}`})`).join(" · ");
    blocks.push(contexto(`🌴 Fuera de oficina: ${linea}`));
  }
  const text = cumples.length
    ? `🎂 Hoy ${cumples.length === 1 ? "cumple" : "cumplen"} ${lista(nombres)}`
    : `🌴 Fuera de oficina: ${fuera.map((f) => f.nombre).join(", ")}`;
  return { text, blocks };
}

/** El privado a un compañero: hoy cumple alguien con quien trabaja. */
export function avisoCumpleCompanero(c: Cumpleanero, origen: string): SlackMensaje {
  const nombre = c.nombre.split(" ")[0] || c.nombre;
  return {
    text: `🎂 Hoy cumple ${c.nombre}`,
    blocks: [
      seccion(`🎂 *Hoy cumple ${quien(c)}*${c.slack_id ? " (tocá su nombre para escribirle por privado)" : ""}. ¿Le mandás un saludo?`),
      botones([boton(`Saludar a ${nombre}`, `${origen}/saludar?a=${c.persona_id}`, true)]),
      contexto("Te llega porque trabajan juntos. Lo podés apagar en tu perfil de Herramientas → Avisos por Slack."),
    ],
  };
}

/** El privado a quien cumple. */
export function avisoCumplePropio(c: Cumpleanero): SlackMensaje {
  const nombre = c.nombre.split(" ")[0] || c.nombre;
  return {
    text: `🎉 ¡Feliz cumple, ${nombre}!`,
    blocks: [seccion(`🎉 *¡Feliz cumple, ${esc(nombre)}!* Que tengas un gran día. Un abrazo de todo el estudio 🎂`)],
  };
}

/* ───────────── Resumen de la mañana ───────────── */

export type TareaResumen = { id: number; titulo: string; marca: string | null; proyecto: string | null; fecha: string; app_url: string | null };

export function resumen(nombre: string, tareas: TareaResumen[], hoy: string, manana: string, origen: string, zona: string): SlackMensaje {
  const grupos: [string, TareaResumen[]][] = [
    ["🔴 *Vencido*", tareas.filter((t) => t.fecha < hoy)],
    ["🟡 *Vence hoy*", tareas.filter((t) => t.fecha === hoy)],
    ["⚪ *Vence mañana*", tareas.filter((t) => t.fecha === manana)],
  ];
  const linea = (t: TareaResumen) => {
    const titulo = link(`${origen}/board?tarea=${t.id}`, t.titulo || "Sin título");
    const marca = t.marca || t.proyecto;
    return `• ${titulo}${marca ? ` · ${esc(marca)}` : ""}${t.fecha < hoy ? ` · era para el ${fechaCorta(t.fecha, zona)}` : ""}`;
  };
  const primer = nombre.split(" ")[0] || nombre;
  const blocks: SlackBlock[] = [seccion(`☀️ *Buen día, ${esc(primer)}.* Esto es lo tuyo:`)];
  for (const [titulo, ts] of grupos) if (ts.length) blocks.push(seccion(`${titulo}\n${ts.map(linea).join("\n")}`));
  blocks.push(botones([boton("Abrir Mi tablero", `${origen}/board`)]));
  blocks.push(contexto("Lo pediste en tu perfil de Herramientas → Avisos por Slack."));
  const n = tareas.length;
  return { text: `☀️ Lo tuyo para hoy: ${n} ${n === 1 ? "tarea" : "tareas"}`, blocks };
}

/* ───────────── Notificaciones (menciones y asignaciones) ───────────── */

export type ItemNotificacion = {
  id: number;
  tipo: "notificacion";
  slack_id: string;
  motivo: string;
  titulo: string | null;
  texto: string | null;
  autor: string | null;
  app_url: string | null;
  enlace: string | null;
  tarea_id: number | null;
  marca: string | null;
};

export function notificacion(n: ItemNotificacion, origen: string): SlackMensaje {
  const autor = n.autor ? `*${esc(n.autor)}*` : "Alguien";
  const titulo = n.titulo ? `*${esc(n.titulo)}*` : "una tarea";
  const encabezado =
    n.motivo === "mencion" ? `💬 ${autor} te nombró en ${titulo}` : `📌 ${autor} te pasó ${titulo}`;
  const marca = n.marca ? ` · ${esc(n.marca)}` : "";
  const enApp = n.enlace?.startsWith("/") ? `${origen}${n.enlace}` : n.tarea_id ? `${origen}/board?tarea=${n.tarea_id}` : null;
  const acciones = [
    ...(enApp ? [boton("Abrir en Herramientas", enApp, true)] : []),
    ...(n.app_url?.startsWith("https://") ? [boton("Ver en Basecamp", n.app_url)] : []),
  ];
  const blocks: SlackBlock[] = [seccion(`${encabezado}${marca}${n.texto ? `\n${cita(n.texto)}` : ""}`)];
  if (acciones.length) blocks.push(botones(acciones));
  return { text: `${n.motivo === "mencion" ? "💬" : "📌"} ${n.autor ?? "Alguien"}: ${n.titulo ?? "una tarea"}`.slice(0, 300), blocks };
}

/* ───────────── Lo que hace el cliente ───────────── */

export type ItemCliente = {
  id: number;
  tipo: "cliente";
  canal_id: string;
  marca: string;
  evento: "comentario" | "aprobada" | "cambios";
  autor: string | null;
  texto: string | null;
  presentacion_id: string;
  pieza_id: string | null;
  fecha: string | null;
  titulo: string;
};

/**
 * Lo del cliente en una misma presentación, junto: cada comentario por separado y las aprobaciones
 * o pedidos de cambios contados ("aprobó 12 piezas").
 */
export function avisosCliente(items: ItemCliente[], origen: string): SlackMensaje {
  const p = items[0];
  const url = `${origen}/presentaciones/${p.presentacion_id}`;
  const titulo = `*${link(url, p.titulo)}*`;
  const partes: string[] = [];
  const aprobadas = new Set(items.filter((i) => i.evento === "aprobada").map((i) => i.pieza_id));
  const cambios = new Set(items.filter((i) => i.evento === "cambios").map((i) => i.pieza_id));
  const piezas = (n: number) => `${n} ${n === 1 ? "pieza" : "piezas"}`;
  if (aprobadas.size) partes.push(`✅ El cliente aprobó ${piezas(aprobadas.size)} de ${titulo}`);
  if (cambios.size) partes.push(`✏️ El cliente pidió cambios en ${piezas(cambios.size)} de ${titulo}`);
  for (const c of items.filter((i) => i.evento === "comentario").slice(0, 8)) {
    partes.push(`💬 *${esc(c.autor ?? "El cliente")}* (cliente) comentó en ${titulo}\n${cita(c.texto)}`);
  }
  const comentarios = items.filter((i) => i.evento === "comentario").length;
  if (comentarios > 8) partes.push(`…y ${comentarios - 8} comentarios más.`);
  return {
    text: `${p.marca}: novedades del cliente en ${p.titulo}`,
    blocks: [...partes.map(seccion), botones([boton("Ver la presentación", url, true)])],
  };
}

/* ───────────── Avisar al equipo de una marca ───────────── */

export function avisoEquipo(autor: { nombre: string; slack_id: string | null }, marca: string, texto: string, origen: string, brandId: string): SlackMensaje {
  return {
    text: `${autor.nombre} (${marca}): ${texto}`.slice(0, 300),
    blocks: [
      seccion(`📣 ${quien(autor)} le escribe al equipo de *${esc(marca)}*:\n${cita(texto)}`),
      contexto(`Desde Herramientas · ${link(`${origen}/clientes/${brandId}`, `Ver ${marca}`)}`),
    ],
  };
}

/** El primer mensaje del canal nuevo de una marca. */
export function bienvenidaCanal(marca: string, origen: string, brandId: string): SlackMensaje {
  return {
    text: `Canal de ${marca}`,
    blocks: [
      seccion(`👋 Este es el canal de *${esc(marca)}*. Acá llegan los avisos de la marca: lo que comenta o aprueba el cliente en las presentaciones y lo que le escriba el estudio al equipo desde Herramientas.`),
      contexto(link(`${origen}/clientes/${brandId}`, `Ver ${marca} en Herramientas`)),
    ],
  };
}
