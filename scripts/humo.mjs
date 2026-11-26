// Prueba de humo: levanta el build de producción, abre todas las páginas y pide con GET todas las
// rutas de la API, para ver que ninguna se rompa en el servidor (un 500). Corre en el GitHub Action
// después de `next build`, sin variables de entorno: sin Supabase no hay login, así que todo se
// puede abrir; las páginas que usan la base muestran "Falta configurar" y las APIs que la
// necesitan contestan 503 con faltaSupabase() (lib/supabase-server.ts).
//
// Las rutas salen del build (app-paths-manifest.json), así que una página o API nueva entra sola.
// Las que tienen parámetros ([id]) no se prueban. Solo cuenta como error un 5xx que no sea 503:
// un 404 (páginas que sin permiso no existen, ej: /descargas/metricas), un 400 (falta un dato) o
// un 405 (la API no tiene GET) están bien.
//
// Uso: node scripts/humo.mjs   (respeta NEXT_DIST_DIR si el build se hizo en otra carpeta)

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = process.env.NEXT_DIST_DIR || ".next";
const port = Number(process.env.HUMO_PORT || 3191);
const base = `http://localhost:${port}`;

const manifest = JSON.parse(readFileSync(join(root, distDir, "server", "app-paths-manifest.json"), "utf8"));
/** Las rutas de un tipo ("page" o "route"), sin las que llevan parámetros: "/(grupo)/x/page" → "/x". */
const rutas = (tipo) =>
  [
    ...new Set(
      Object.keys(manifest)
        .filter((k) => k.endsWith(`/${tipo}`) && !k.includes("["))
        .map((k) => k.slice(0, -(tipo.length + 1)).replace(/\/\([^)]*\)/g, "") || "/")
        .filter((p) => p !== "/_not-found")
    ),
  ].sort();
const pages = rutas("page");
const apis = rutas("route").filter((p) => p.startsWith("/api/"));

const server = spawn(process.execPath, [join(root, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(port)], {
  cwd: root,
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function listo() {
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(base, { redirect: "manual" });
      return true;
    } catch {
      await espera(1000);
    }
  }
  return false;
}

let fallas = 0;
try {
  if (!pages.length) throw new Error(`No hay páginas en ${distDir}: ¿se corrió next build?`);
  if (!(await listo())) throw new Error("El servidor no arrancó en 60 s");
  for (const ruta of [...pages, ...apis]) {
    let status;
    try {
      const r = await fetch(base + ruta, { redirect: "manual" });
      status = r.status;
      await r.text();
    } catch (e) {
      status = `sin respuesta (${e.message})`;
    }
    const mal = typeof status !== "number" || (status >= 500 && status !== 503);
    if (mal) fallas++;
    console.log(`${mal ? "✗" : "✓"} ${status} ${ruta}`);
  }
} catch (e) {
  console.error(e.message);
  fallas++;
} finally {
  server.kill();
}

if (fallas) {
  console.error(`\n${fallas} ruta(s) con error. Lo que dijo el servidor:\n${serverLog.slice(-4000)}`);
  process.exit(1);
}
console.log(`\n${pages.length} páginas y ${apis.length} APIs sin errores.`);
