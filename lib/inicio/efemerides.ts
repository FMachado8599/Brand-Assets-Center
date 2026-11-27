/**
 * "Un día como hoy": cosas de la publicidad, el diseño y las redes que pasaron en esta fecha. Si hoy
 * no pasó nada, la más cercana de los próximos días ("Se viene"). Son datos públicos y conocidos; si
 * alguno está mal, se corrige acá.
 */

export type Efemeride = {
  /** "MM-DD". */
  dia: string;
  anio: number;
  texto: string;
};

export const EFEMERIDES: Efemeride[] = [
  { dia: "01-09", anio: 2007, texto: "Steve Jobs presentó el primer iPhone." },
  { dia: "01-10", anio: 1931, texto: "Nació Massimo Vignelli, el del mapa del subte de Nueva York." },
  { dia: "01-22", anio: 1984, texto: "Apple estrenó «1984», el comercial de Ridley Scott, en el Super Bowl." },
  { dia: "01-24", anio: 1984, texto: "Salió a la venta la primera Macintosh." },
  { dia: "02-04", anio: 2004, texto: "Arrancó Facebook, todavía como «TheFacebook»." },
  { dia: "02-19", anio: 1990, texto: "Salió Photoshop 1.0." },
  { dia: "03-21", anio: 2006, texto: "Jack Dorsey mandó el primer tuit." },
  { dia: "04-23", anio: 2005, texto: "Se subió el primer video a YouTube: «Me at the zoo»." },
  { dia: "04-25", anio: 1996, texto: "Murió Saul Bass, el de los títulos de Hitchcock y los logos de AT&T y Kleenex." },
  { dia: "05-03", anio: 1978, texto: "Se mandó el primer mail masivo publicitario: el primer spam." },
  { dia: "05-08", anio: 1886, texto: "Se sirvió la primera Coca-Cola, en una farmacia de Atlanta." },
  { dia: "05-08", anio: 1920, texto: "Nació Saul Bass." },
  { dia: "05-27", anio: 2014, texto: "Murió Massimo Vignelli." },
  { dia: "06-07", anio: 1971, texto: "Murió Leo Burnett, el del Marlboro Man y el Tigre Tony." },
  { dia: "06-23", anio: 1911, texto: "Nació David Ogilvy, el padre de la publicidad moderna." },
  { dia: "06-26", anio: 1929, texto: "Nació Milton Glaser, el de «I ♥ NY»." },
  { dia: "06-26", anio: 1931, texto: "Nació George Lois, el de las tapas de Esquire." },
  { dia: "07-01", anio: 1941, texto: "Salió al aire el primer comercial de televisión: un reloj Bulova, antes de un partido de béisbol." },
  { dia: "07-01", anio: 1988, texto: "Nike estrenó «Just Do It»." },
  { dia: "07-09", anio: 1962, texto: "Andy Warhol expuso por primera vez sus latas de sopa Campbell's." },
  { dia: "07-21", anio: 1999, texto: "Murió David Ogilvy." },
  { dia: "08-06", anio: 1928, texto: "Nació Andy Warhol." },
  { dia: "08-13", anio: 1911, texto: "Nació Bill Bernbach, el de «Think Small» para Volkswagen." },
  { dia: "08-15", anio: 1914, texto: "Nació Paul Rand, el de los logos de IBM, ABC y UPS." },
  { dia: "09-04", anio: 1998, texto: "Se fundó Google." },
  { dia: "10-02", anio: 1982, texto: "Murió Bill Bernbach." },
  { dia: "10-03", anio: 1932, texto: "The Times salió por primera vez en Times New Roman." },
  { dia: "10-06", anio: 2010, texto: "Llegó Instagram al App Store." },
  { dia: "10-07", anio: 2008, texto: "Se lanzó Spotify." },
  { dia: "10-21", anio: 1891, texto: "Nació Leo Burnett." },
  { dia: "10-27", anio: 1994, texto: "Apareció el primer banner de internet, de AT&T: «Have you ever clicked your mouse right here? You will.»" },
  { dia: "11-18", anio: 1928, texto: "Se estrenó «Steamboat Willie», el debut de Mickey Mouse." },
  { dia: "11-18", anio: 2022, texto: "Murió George Lois." },
  { dia: "11-26", anio: 1996, texto: "Murió Paul Rand, el de los logos de IBM, ABC y UPS." },
];

export type EfemerideHoy = { e: Efemeride; cuando: "hoy" | "pronto"; dias: number };

const mmdd = (d: Date) => `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Las de hoy; si no hay, la primera de los próximos 30 días. Con varias el mismo día, una por día del año. */
export function efemerideDe(hoy = new Date()): EfemerideHoy | null {
  for (let n = 0; n <= 30; n++) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + n);
    const del = EFEMERIDES.filter((e) => e.dia === mmdd(d));
    if (del.length) return { e: del[d.getDate() % del.length], cuando: n === 0 ? "hoy" : "pronto", dias: n };
  }
  return null;
}

/** "Un día como hoy, en 1996," / "En 3 días, en 1994,". */
export function encabezadoEfemeride(x: EfemerideHoy) {
  if (x.cuando === "hoy") return `Un día como hoy, en ${x.e.anio}`;
  if (x.dias === 1) return `Mañana, pero en ${x.e.anio}`;
  return `En ${x.dias} días, pero en ${x.e.anio}`;
}
