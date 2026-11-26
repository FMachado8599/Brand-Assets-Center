import { FORMATOS, medidaDe, MESES, nombreFormato } from "./config";
import { copyTexto } from "./copy";
import { etiquetaArchivo, etiquetaCorta } from "./fechas";
import type { Formato, Pieza, Plani } from "./types";

/**
 * Las mesas de trabajo de Illustrator para diseñar la plani: un script (.jsx) que, al correrlo en
 * Illustrator (Archivo → Secuencias de comandos → Otra secuencia de comandos…), crea el documento
 * con una mesa por pieza (y por slide en los carruseles), a la medida justa, con su nombre
 * ("01-10 Jue · Feed 4:5 · Gran Final") y las indicaciones de redacción abajo, en una capa que
 * no se imprime. "Exportar para pantallas" usa esos nombres para los archivos.
 *
 * Las mesas se agrupan en filas por formato (feed, carruseles, historias, portadas de reel), en
 * orden de fecha. Illustrator no deja pasar de ~16.000 pt de lienzo: si no entra todo, el script
 * abre más de un documento.
 */

type Mesa = { nombre: string; w: number; h: number; x: number; y: number; nota: string };
type Doc = { titulo: string; mesas: Mesa[] };

const GAP_X = 120;
const GAP_Y = 520;
const MAX = 15_600;

const GRUPOS: { formatos: Formato[]; titulo: string }[] = [
  { formatos: ["post"], titulo: "Feed" },
  { formatos: ["carrusel"], titulo: "Carruseles" },
  { formatos: ["historia"], titulo: "Historias" },
  { formatos: ["reel"], titulo: "Reels" },
];

function notaDe(p: Pieza, slide?: number) {
  const partes: string[] = [];
  if (p.titulo) partes.push(p.titulo);
  if (slide !== undefined) {
    const s = p.slides[slide]?.instruccion;
    if (s) partes.push(`Slide ${slide + 1}: ${s}`);
    if (slide === 0 && p.instrucciones) partes.push(p.instrucciones);
  } else if (p.instrucciones) partes.push(p.instrucciones);
  if (p.formato === "reel") partes.push("(Portada del reel. El video se edita aparte.)");
  if (p.adapta_de) partes.push("(Adaptación a historia de un post del mismo día.)");
  const copy = copyTexto(p);
  if (copy && slide === undefined) partes.push(`Copy: ${copy}`);
  return partes.join("\n\n").slice(0, 1200);
}

export function armarMesas(piezas: Pieza[]): Doc[] {
  const ordenadas = [...piezas].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.orden - b.orden);
  const docs: Doc[] = [];
  let doc: Doc = { titulo: "", mesas: [] };
  let y = 0;

  const nuevoDoc = () => {
    if (doc.mesas.length) docs.push(doc);
    doc = { titulo: "", mesas: [] };
    y = 0;
  };

  for (const grupo of GRUPOS) {
    const delGrupo = ordenadas.filter((p) => grupo.formatos.includes(p.formato));
    if (!delGrupo.length) continue;

    // Cada pieza aporta sus mesas (un carrusel, una por slide) y quedan juntas en la misma fila.
    const bloques = delGrupo.map((p) => {
      const m = medidaDe(p);
      // "4:5" → "4x5": "Exportar para pantallas" usa el nombre de la mesa como nombre de archivo y Windows no acepta ":".
      const base = `${etiquetaArchivo(p.fecha)} ${etiquetaCorta(p.fecha).split(" ")[0]} · ${nombreFormato(p.formato, p.proporcion).replace(":", "x")}`;
      const titulo = p.titulo ? ` · ${p.titulo.slice(0, 40)}` : "";
      if (p.formato === "carrusel") {
        const n = Math.max(p.slides.length, 1);
        return Array.from({ length: n }, (_, i) => ({ nombre: `${base}${titulo} · ${i + 1} de ${n}`, w: m.w, h: m.h, nota: notaDe(p, i) }));
      }
      return [{ nombre: `${base}${titulo}`, w: m.w, h: m.h, nota: notaDe(p) }];
    });

    let x = 0;
    let alto = 0;
    for (const bloque of bloques) {
      const ancho = bloque.reduce((s, m) => s + m.w + GAP_X, -GAP_X);
      if (x > 0 && x + ancho > MAX) {
        y += alto + GAP_Y;
        x = 0;
        alto = 0;
      }
      const h = Math.max(...bloque.map((m) => m.h));
      if (y + h > MAX) {
        nuevoDoc();
        x = 0;
        alto = 0;
      }
      for (const m of bloque) {
        doc.mesas.push({ ...m, x, y });
        x += m.w + GAP_X;
      }
      alto = Math.max(alto, h);
    }
    // Cada formato arranca en una fila nueva.
    y += alto + GAP_Y;
  }
  nuevoDoc();
  return docs;
}

/** ExtendScript lee mejor ASCII: las tildes y emojis viajan como \uXXXX. */
function str(s: string) {
  return JSON.stringify(s).replace(/[\u007f-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

export function scriptIllustrator(plani: Plani, cliente: string, piezas: Pieza[]) {
  const docs = armarMesas(piezas);
  const titulo = `${cliente} · ${MESES[plani.mes - 1]} ${plani.anio}`;
  const data = docs
    .map(
      (d, i) =>
        `  { titulo: ${str(docs.length > 1 ? `${titulo} (${i + 1} de ${docs.length})` : titulo)}, mesas: [\n${d.mesas
          .map((m) => `    { n: ${str(m.nombre)}, w: ${m.w}, h: ${m.h}, x: ${m.x}, y: ${m.y}, t: ${str(m.nota)} }`)
          .join(",\n")}\n  ] }`
    )
    .join(",\n");

  const cuenta = (f: Formato) => piezas.filter((p) => p.formato === f).length;
  const slides = piezas.filter((p) => p.formato === "carrusel").reduce((n, p) => n + Math.max(p.slides.length, 1), 0);
  const resumen = (["post", "carrusel", "historia", "reel"] as Formato[])
    .filter((f) => cuenta(f))
    .map((f) => {
      const n = cuenta(f);
      const nombre = (n === 1 ? FORMATOS[f].label : FORMATOS[f].plural).toLowerCase();
      return f === "carrusel" ? `${n} ${nombre} (${slides} slides)` : `${n} ${nombre}`;
    })
    .join(", ");

  return `// Mesas de trabajo: ${titulo}
// Generado por Herramientas (Planificación): ${resumen}.
// En Illustrator: Archivo > Secuencias de comandos > Otra secuencia de comandos... y elegir este archivo.
#target illustrator
(function () {
  var DOCS = [
${data}
  ];
  if (!DOCS.length) { alert("La plani no tiene piezas."); return; }
  for (var d = 0; d < DOCS.length; d++) {
    var info = DOCS[d];
    var first = info.mesas[0];
    var doc = app.documents.add(DocumentColorSpace.RGB, first.w, first.h);
    try { doc.rulerUnits = RulerUnits.Pixels; } catch (e) {}
    var notas = doc.layers.add();
    notas.name = "Indicaciones (no se imprime)";
    notas.printable = false;
    for (var i = 0; i < info.mesas.length; i++) {
      var m = info.mesas[i];
      // Illustrator mide hacia arriba: el borde de arriba es y, el de abajo y - alto.
      var rect = [m.x, -m.y, m.x + m.w, -(m.y + m.h)];
      var ab = i === 0 ? doc.artboards[0] : doc.artboards.add(rect);
      ab.artboardRect = rect;
      ab.name = m.n;
      if (m.t) {
        var caja = notas.pathItems.rectangle(-(m.y + m.h + 40), m.x, m.w, 420);
        var tf = notas.textFrames.areaText(caja);
        tf.contents = m.t;
        try { tf.textRange.characterAttributes.size = 26; } catch (e2) {}
      }
    }
    notas.locked = true;
    try { doc.layers[doc.layers.length - 1].name = "Diseño"; } catch (e3) {}
    doc.activeLayer = doc.layers[doc.layers.length - 1];
    try { app.executeMenuCommand("fitall"); } catch (e4) {}
  }
  alert("Listo: " + DOCS.length + (DOCS.length === 1 ? " documento" : " documentos") + ".\\nLas indicaciones están en una capa bloqueada que no se imprime.");
})();
`;
}

export function nombreScript(plani: Plani, cliente: string) {
  return `${cliente} - ${MESES[plani.mes - 1]} ${plani.anio} - mesas de trabajo.jsx`.replace(/[<>:"/\\|?*]+/g, "-");
}
