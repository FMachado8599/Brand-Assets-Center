// Prueba de humo: levanta el build de producción y abre todas las páginas, para ver que ninguna
// se rompa en el servidor (un 500). Corre en el GitHub Action después de `next build`, sin
// variables de entorno: sin Supabase no hay login, así que todas las páginas se pueden abrir y
// las que usan la base muestran "Falta configurar".
//
// Las páginas salen del build (app-paths-manifest.json), así que una página nueva entra sola.
// Las rutas con parámetros ([id]) no se prueban. Un 404 no cuenta como error: hay páginas que
// sin permiso no existen (ej: /descargas/metricas).
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
const pages = [
  ...new Set(
    Object.keys(manifest)
      .filter((k) => k.endsWith("/page") && !k.includes("["))
      // "/(grupo)/x/page" → "/x"
      .map((k) => k.replace(/\/page$/, "").replace(/\/\([^)]*\)/g, "") || "/")
      .filter((p) => p !== "/_not-found")
  ),
].sort();

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
  for (const page of pages) {
    let status;
    try {
      const r = await fetch(base + page, { redirect: "manual" });
      status = r.status;
      await r.text();
    } catch (e) {
      status = `sin respuesta (${e.message})`;
    }
    const mal = typeof status !== "number" || status >= 500;
    if (mal) fallas++;
    console.log(`${mal ? "✗" : "✓"} ${status} ${page}`);
  }
} catch (e) {
  console.error(e.message);
  fallas++;
} finally {
  server.kill();
}

if (fallas) {
  console.error(`\n${fallas} página(s) con error. Lo que dijo el servidor:\n${serverLog.slice(-4000)}`);
  process.exit(1);
}
console.log(`\n${pages.length} páginas abren bien.`);
