import { textToHtml } from "@/lib/redaccion/export";
import { charCount } from "@/lib/redaccion/text";
import { plataformaInfo } from "./config";
import type { Pieza, Plataforma } from "./types";

/** El copy de la pieza, tal cual se publica (igual en todas las redes). */
export function copyTexto(p: Pick<Pieza, "copys" | "plataformas">) {
  const c = p.copys ?? {};
  if (typeof c.todas === "string") return c.todas;
  // Planis de antes: un copy por red. Vale el de la primera red que tenga.
  for (const red of [...(p.plataformas ?? []), "instagram" as Plataforma]) if (c[red]) return c[red]!;
  return Object.entries(c).find(([k, v]) => k !== "html" && v)?.[1] ?? "";
}

/** El copy con formato, para el editor. */
export function copyHtml(p: Pick<Pieza, "copys" | "plataformas">) {
  return p.copys?.html ?? textToHtml(copyTexto(p));
}

/** El límite que manda: el de la red más exigente de las elegidas (X: 280). */
export function limiteCopy(plataformas: Plataforma[]) {
  const redes = plataformas.length ? plataformas : (["instagram"] as Plataforma[]);
  return redes.map(plataformaInfo).reduce((min, r) => (r.limite < min.limite ? r : min));
}

export const largoCopy = (texto: string) => charCount(texto);
