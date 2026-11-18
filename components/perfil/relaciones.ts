import type { EquipoData, Hub, Persona, Puesto, Sector } from "@/lib/board/equipo";
import type { Brand } from "@/lib/types";

/**
 * Lo que el Board sabe de una persona, listo para mostrar en su perfil: qué hace (puestos, sectores),
 * dónde está (hub, jefes, gente a cargo), de qué marcas es designada y con quién trabaja.
 */

export type MarcaDesignada = { brandId: string; brand: Brand | null; nombre: string; sectores: string[] };

/** Alguien con quien trabaja, y por qué: "Redacción en Changan y BBVA", "Hub Gala". */
export type Companero = { persona: Persona; motivos: string[]; marcas: number };

export type Relaciones = {
  puestos: Puesto[];
  sectores: Sector[];
  hub: Hub | null;
  lideresHub: Persona[];
  /** Los hubs o equipos de cliente que dirige. */
  dirige: Hub[];
  jefes: Persona[];
  aCargo: Persona[];
  marcas: MarcaDesignada[];
  companeros: Companero[];
};

const lista = (nombres: string[]) =>
  nombres.length <= 1 ? (nombres[0] ?? "") : `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;

export function relacionesDe(p: Persona, data: EquipoData, brands: Brand[]): Relaciones {
  const porId = new Map(data.personas.map((x) => [x.id, x]));
  const sectorPorId = new Map(data.sectores.map((s) => [s.id, s]));
  const brandPorId = new Map(brands.map((b) => [b.id, b]));
  const nombreMarca = (id: string) => brandPorId.get(id)?.name ?? "Una marca";
  const nombreSector = (id: string) => sectorPorId.get(id)?.nombre ?? id;
  const activos = (ids: string[]) => ids.map((id) => porId.get(id)).filter((x): x is Persona => Boolean(x));

  const puestos = p.puestos.map((id) => data.puestos.find((x) => x.id === id)).filter((x): x is Puesto => Boolean(x));
  const sectores = [...new Set(puestos.flatMap((x) => x.sectores))]
    .map((id) => sectorPorId.get(id))
    .filter((s): s is Sector => Boolean(s))
    .sort((a, b) => a.orden - b.orden);
  const hub = data.hubs.find((h) => h.id === p.hub_id) ?? null;

  // Sus marcas: una por marca, con los sectores en los que es designada.
  const mias = data.designaciones.filter((d) => d.persona_id === p.id);
  const marcasMap = new Map<string, string[]>();
  for (const d of mias) marcasMap.set(d.brand_id, [...(marcasMap.get(d.brand_id) ?? []), nombreSector(d.sector_id)]);
  const marcas = [...marcasMap.entries()]
    .map(([brandId, sectoresMarca]) => ({ brandId, brand: brandPorId.get(brandId) ?? null, nombre: nombreMarca(brandId), sectores: sectoresMarca }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  // Compañeros: los designados de sus mismas marcas (en otros sectores o en el mismo) y los de su hub.
  const deMarca = new Map<string, Map<string, Set<string>>>(); // persona → sector → marcas
  for (const d of data.designaciones) {
    if (d.persona_id === p.id || !marcasMap.has(d.brand_id)) continue;
    const otro = porId.get(d.persona_id);
    if (!otro?.activo) continue;
    const sectoresDe = deMarca.get(otro.id) ?? new Map<string, Set<string>>();
    const marcasSector = sectoresDe.get(d.sector_id) ?? new Set<string>();
    marcasSector.add(d.brand_id);
    sectoresDe.set(d.sector_id, marcasSector);
    deMarca.set(otro.id, sectoresDe);
  }
  const companeros = new Map<string, Companero>();
  for (const [id, sectoresDe] of deMarca) {
    const persona = porId.get(id)!;
    const todas = new Set<string>();
    const motivos = [...sectoresDe.entries()]
      .sort(([a], [b]) => (sectorPorId.get(a)?.orden ?? 0) - (sectorPorId.get(b)?.orden ?? 0))
      .map(([sector, ms]) => {
        ms.forEach((m) => todas.add(m));
        return `${nombreSector(sector)} en ${lista([...ms].map(nombreMarca).sort((a, b) => a.localeCompare(b, "es")))}`;
      });
    companeros.set(id, { persona, motivos, marcas: todas.size });
  }
  if (hub) {
    for (const x of data.personas) {
      if (x.id === p.id || !x.activo || x.hub_id !== hub.id) continue;
      const c = companeros.get(x.id) ?? { persona: x, motivos: [], marcas: 0 };
      c.motivos.push(hub.tipo === "cliente" ? hub.nombre : `Hub ${hub.nombre}`);
      companeros.set(x.id, c);
    }
  }

  return {
    puestos,
    sectores,
    hub,
    lideresHub: hub ? activos(hub.lideres).filter((x) => x.id !== p.id) : [],
    dirige: data.hubs.filter((h) => h.lideres.includes(p.id)),
    jefes: activos(p.jefes),
    aCargo: data.personas.filter((x) => x.activo && x.jefes.includes(p.id)).sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    marcas,
    companeros: [...companeros.values()].sort((a, b) => b.marcas - a.marcas || a.persona.nombre.localeCompare(b.persona.nombre, "es")),
  };
}

/** Lo que dos personas tienen en común, desde los ojos de `yo`: "Trabajan juntos en Changan", "Le reportás". */
export function enComun(yo: Persona, otro: Persona, data: EquipoData, brands: Brand[]): string[] {
  if (yo.id === otro.id) return [];
  const nombreMarca = (id: string) => brands.find((b) => b.id === id)?.name ?? "una marca";
  const mias = new Set(data.designaciones.filter((d) => d.persona_id === yo.id).map((d) => d.brand_id));
  const juntas = [...new Set(data.designaciones.filter((d) => d.persona_id === otro.id && mias.has(d.brand_id)).map((d) => d.brand_id))]
    .map(nombreMarca)
    .sort((a, b) => a.localeCompare(b, "es"));
  const out: string[] = [];
  if (yo.jefes.includes(otro.id)) out.push("Le reportás");
  if (otro.jefes.includes(yo.id)) out.push("Te reporta");
  if (juntas.length) out.push(`Comparten ${juntas.length === 1 ? "la marca" : "las marcas"} ${lista(juntas)}`);
  if (yo.hub_id && yo.hub_id === otro.hub_id) {
    const hub = data.hubs.find((h) => h.id === yo.hub_id);
    if (hub) out.push(hub.tipo === "cliente" ? `Los dos en ${hub.nombre}` : `Los dos en el hub ${hub.nombre}`);
  }
  return out;
}
