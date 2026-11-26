import { TOOLS, type AppModule } from "@/lib/modules";

/**
 * El orden de las herramientas del Inicio: las que más usás primero (por tus visitas de los últimos
 * dos meses). Si todavía no hay visitas, las de tu puesto; y si acomodaste el Inicio a mano, ese orden.
 */

/** Las visitas por herramienta, como las cuenta inicio_herramientas() ("board", "library"…). */
export type UsoModulo = { modulo: string; visitas: number; ultima: string | null };

/** El tramo de la dirección de cada herramienta del Inicio ("/library" → "library"). */
export const moduloDe = (href: string) => href.split("/")[1] ?? "";

/** Lo que más usa cada sector, por si todavía no hay visitas (los ids de la tabla sectores). */
const DE_SECTOR: Record<string, string[]> = {
  redaccion: ["/redaccion", "/tarjetas", "/library", "/board"],
  diseno_digital: ["/retoque", "/gif", "/conversor", "/library", "/ads"],
  arte: ["/retoque", "/library", "/conversor", "/clientes"],
  cm: ["/ads", "/descargas", "/redaccion", "/library"],
  cuentas: ["/board", "/presentaciones", "/clientes"],
  creatividad: ["/redaccion", "/library", "/descargas", "/ads"],
  produccion: ["/descargas", "/conversor", "/retoque"],
  medios: ["/presentaciones", "/ads", "/board"],
};

export type Orden = {
  /** Las herramientas, en el orden en que se muestran (sin las escondidas). */
  lista: AppModule[];
  /** Las escondidas, para volver a mostrarlas. */
  escondidas: AppModule[];
  /** De dónde sale el orden. */
  origen: "uso" | "puesto" | "manual" | "fijo";
};

export function ordenarHerramientas({
  uso,
  sectores,
  manual,
  ocultas,
}: {
  uso: UsoModulo[] | null;
  sectores: string[];
  manual: string[] | null;
  ocultas: string[];
}): Orden {
  const escondidas = TOOLS.filter((t) => ocultas.includes(t.href));
  const visibles = TOOLS.filter((t) => !ocultas.includes(t.href));
  const fijo = (t: AppModule) => TOOLS.indexOf(t);

  if (manual?.length) {
    const pos = (t: AppModule) => (manual.includes(t.href) ? manual.indexOf(t.href) : manual.length + fijo(t));
    return { lista: [...visibles].sort((a, b) => pos(a) - pos(b)), escondidas, origen: "manual" };
  }

  const porModulo = new Map((uso ?? []).map((u) => [u.modulo, u.visitas]));
  const visitas = (t: AppModule) => porModulo.get(moduloDe(t.href)) ?? 0;
  const delPuesto = sectores.flatMap((s) => DE_SECTOR[s] ?? []);
  const puesto = (t: AppModule) => (delPuesto.includes(t.href) ? delPuesto.length - delPuesto.indexOf(t.href) : 0);
  const conUso = visibles.some((t) => visitas(t) > 0);

  const lista = [...visibles].sort((a, b) => visitas(b) - visitas(a) || puesto(b) - puesto(a) || fijo(a) - fijo(b));
  return { lista, escondidas, origen: conUso ? "uso" : delPuesto.length ? "puesto" : "fijo" };
}

/** "Tu favorita esta semana" y similares: la cantidad de visitas en palabras. */
export function textoVisitas(n: number) {
  if (n <= 0) return null;
  return n === 1 ? "1 visita" : `${n.toLocaleString("es-UY")} visitas`;
}
