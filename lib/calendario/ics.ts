/**
 * Arma un calendario .ics (RFC 5545) para suscribirse desde Google Calendar, Outlook o el calendario
 * del celular. Solo eventos de todo el día: las entregas de tareas y los cumpleaños.
 */

export type EventoIcs = {
  uid: string;
  /** AAAA-MM-DD. */
  fecha: string;
  titulo: string;
  descripcion?: string | null;
  url?: string | null;
  /** Se repite todos los años (cumpleaños). */
  anual?: boolean;
  /** El 29 de febrero: "el último día de febrero" (28 los años que no tienen 29). */
  finDeFebrero?: boolean;
};

/** Texto de un campo: se escapan \, ; , y los saltos de línea. */
const texto = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Cada línea, de hasta 75 bytes; las que siguen empiezan con un espacio (sin cortar un carácter por la mitad). */
function plegar(linea: string) {
  const out: string[] = [];
  let actual = "";
  let bytes = 0;
  for (const ch of linea) {
    const b = Buffer.byteLength(ch, "utf8");
    const limite = out.length ? 74 : 75;
    if (bytes + b > limite) {
      out.push(actual);
      actual = "";
      bytes = 0;
    }
    actual += ch;
    bytes += b;
  }
  out.push(actual);
  return out.join("\r\n ");
}

const dia = (iso: string) => iso.replace(/-/g, "");
const siguiente = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
};

export function armarIcs(opciones: { nombre: string; descripcion: string; zona: string; eventos: EventoIcs[] }) {
  const ahora = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lineas = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Herramientas//Calendario del estudio//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${texto(opciones.nombre)}`,
    `X-WR-CALDESC:${texto(opciones.descripcion)}`,
    `X-WR-TIMEZONE:${opciones.zona}`,
    // Cada cuánto pedirlo de nuevo (Outlook y Apple lo respetan; Google lo actualiza cuando quiere).
    "REFRESH-INTERVAL;VALUE=DURATION:PT2H",
    "X-PUBLISHED-TTL:PT2H",
  ];
  for (const e of opciones.eventos) {
    lineas.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${ahora}`,
      `DTSTART;VALUE=DATE:${dia(e.fecha)}`,
      `DTEND;VALUE=DATE:${dia(siguiente(e.fecha))}`,
      `SUMMARY:${texto(e.titulo)}`,
      // De todo el día y sin ocupar: no bloquea la agenda de nadie.
      "TRANSP:TRANSPARENT"
    );
    if (e.anual) lineas.push(e.finDeFebrero ? "RRULE:FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1" : "RRULE:FREQ=YEARLY");
    if (e.descripcion) lineas.push(`DESCRIPTION:${texto(e.descripcion)}`);
    if (e.url) lineas.push(`URL:${e.url}`);
    lineas.push("END:VEVENT");
  }
  lineas.push("END:VCALENDAR");
  return lineas.map(plegar).join("\r\n") + "\r\n";
}
