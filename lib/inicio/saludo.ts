/**
 * El saludo del Inicio: cambia con la hora y el día de la semana (y en tu cumple). Se arma en el
 * navegador, con su hora: el servidor no la sabe. Para un mismo momento elige siempre la misma
 * frase (no cambia al volver a pintar), y cada día puede tocar otra.
 */

export type Saludo = {
  /** "Buen día, Facu." */
  titulo: string;
  /** La segunda parte, más tenue: "¿Qué hacemos hoy?". */
  bajada: string;
  /** Viernes después de las 17: el Inicio se pone amarillo. */
  viernes: boolean;
};

/** Un número estable para el día: con eso cada día toca una frase distinta, pero la misma todo el día. */
function semilla(d: Date) {
  return d.getFullYear() * 400 + d.getMonth() * 32 + d.getDate();
}

const elegir = <T,>(lista: T[], d: Date, extra = 0) => lista[(semilla(d) + extra) % lista.length];

/** ¿Es "modo viernes"? Viernes desde las 17. `?probar=viernes` en la dirección lo fuerza (para verlo). */
export function esModoViernes(d = new Date()) {
  if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("probar") === "viernes") return true;
  return d.getDay() === 5 && d.getHours() >= 17;
}

export function saludoDe(nombre: string | null | undefined, d = new Date(), { cumple = false } = {}): Saludo {
  const n = nombre ? `, ${nombre}` : "";
  const h = d.getHours();
  const dia = d.getDay(); // 0 domingo … 6 sábado
  const viernes = esModoViernes(d);

  if (cumple) {
    return {
      titulo: `¡Feliz cumple${n}!`,
      bajada: elegir(["Hoy el estudio es tuyo. 🎂", "Que hoy nadie te pase una tarea urgente.", "Torta primero, pendientes después."], d),
      viernes,
    };
  }

  if (viernes) {
    return {
      titulo: elegir([`Último empujón del viernes${n}.`, `Viernes, ${nombre ?? "che"}. Casi.`, `Modo viernes${n}.`], d),
      bajada: elegir(["Cerrá lo que puedas y el resto, el lunes.", "Que no te agarre el lunes con esto abierto.", "Lo urgente, ahora. Lo otro tiene fin de semana."], d),
      viernes,
    };
  }

  if (h < 5) {
    return { titulo: `Es tardísimo${n}.`, bajada: elegir(["Mañana sigue.", "Guardá y a dormir.", "El brief no se va a escapar."], d), viernes };
  }

  if (dia === 6 || dia === 0) {
    return {
      titulo: dia === 6 ? `¿Sábado y trabajando${n}?` : `Domingo de herramientas${n}.`,
      bajada: elegir(["Que sea rapidito.", "Lo justo y a disfrutar.", "Nadie te va a pedir nada hoy."], d),
      viernes,
    };
  }

  if (h < 12) {
    if (dia === 1) return { titulo: `Lunes${n}. Café primero.`, bajada: elegir(["Después vemos qué hay.", "La semana arranca de a poco.", "¿Qué tenemos esta semana?"], d), viernes };
    return {
      titulo: `Buen día${n}.`,
      bajada: elegir(["¿Qué hacemos hoy?", "¿Por dónde arrancamos?", "Mate en mano, a lo que hay.", "Hoy sale todo."], d),
      viernes,
    };
  }
  if (h < 14) {
    return { titulo: elegir([`Buen provecho${n}.`, `¿Ya almorzaste${n}?`], d), bajada: elegir(["Después del almuerzo, lo que quedó.", "Primero comer, después el feed."], d), viernes };
  }
  if (h < 19) {
    return {
      titulo: `Buenas tardes${n}.`,
      bajada: elegir(["¿Qué falta para hoy?", "La tarde rinde.", "Una más y cerramos.", "¿Seguimos?"], d, h),
      viernes,
    };
  }
  if (h < 21) {
    return { titulo: `Buenas noches${n}.`, bajada: elegir(["Lo último y cortamos.", "¿Algo que no pueda esperar a mañana?"], d), viernes };
  }
  return { titulo: `¿Todavía acá${n}?`, bajada: "Andá a casa. Mañana sigue.", viernes };
}

/** "jueves 26 de noviembre". */
export function fechaLarga(d = new Date()) {
  return new Intl.DateTimeFormat("es-UY", { weekday: "long", day: "numeric", month: "long" }).format(d);
}

/** "MM-DD" de una fecha, como se guarda el cumple. */
export const mesDia = (d = new Date()) => `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
