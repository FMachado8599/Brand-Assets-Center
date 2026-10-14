// Servicio de YouTube para Herramientas (módulo Descargas).
//
// YouTube no deja bajar videos en buena calidad desde servidores en la nube como Vercel: este servicio corre
// en una PC (la de la oficina, o el servidor de la empresa), baja con yt-dlp + ffmpeg y entrega el archivo.
// La app le pide los datos de un video con una clave compartida, y el navegador baja el archivo con un
// permiso firmado que le da la app (vence a las pocas horas y sirve solo para ese video).
//
// Para que la app y los navegadores lo alcancen, abre solo un túnel gratis de Cloudflare (sin cuenta). Esa
// dirección cambia en cada arranque, así que la anota en el Blob store de Vercel, de donde la lee la app.
//
// Uso: node server.mjs   (o iniciar.cmd). La configuración está en .env, al lado de este archivo.

import http from "node:http";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENV_FILE = path.join(HERE, ".env");
firstRun();
loadEnv(ENV_FILE);

const PORT = Number(process.env.PORT || 8787);
const SECRET = process.env.YOUTUBE_WORKER_SECRET ?? "";
const BIN = path.join(HERE, "bin");
const YTDLP = process.env.YTDLP || local("yt-dlp.exe") || "yt-dlp";
const FFMPEG_DIR = process.env.FFMPEG_DIR || (local("ffmpeg.exe") ? BIN : "");
const EXTRA_ARGS = (process.env.YTDLP_ARGS ?? "").split(/\s+/).filter(Boolean);
const TMP = process.env.TMP_DIR || path.join(os.tmpdir(), "herramientas-youtube");
const ORIGINS = (process.env.ALLOWED_ORIGINS || "*").split(",").map((o) => o.trim()).filter(Boolean);
const MAX_PARALLEL = Number(process.env.MAX_PARALLEL || 2);
/** Túnel de Cloudflare: "off" si el servicio ya tiene una dirección pública propia (ej: el servidor de la empresa). */
const CLOUDFLARED = process.env.TUNNEL === "off" ? null : process.env.CLOUDFLARED || local("cloudflared.exe") || null;
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN?.trim() || "";
/** Dónde se anota la dirección pública (la lee lib/downloads/youtube.server.ts). */
const BLOB_PATH = "descargas/servicio-youtube.json";
/** Lo bajado queda una hora: si otra persona pide el mismo video, sale al instante. */
const KEEP_MS = 60 * 60 * 1000;
const INFO_TTL = 30 * 60 * 1000;

const QUALITIES = [1080, 720, 480, 360, 240, 144];
const MODES = new Set(["video", "mute", "audio"]);

if (SECRET.length < 32) {
  console.error(`Falta YOUTUBE_WORKER_SECRET (32 caracteres o más) en ${ENV_FILE}.`);
  process.exit(1);
}

fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });

/* ───────────── yt-dlp ───────────── */

const BASE_ARGS = [
  "--no-playlist",
  "--no-warnings",
  // YouTube pide resolver un desafío en JavaScript: se usa el mismo Node que corre este servicio.
  "--js-runtimes",
  `node:${process.execPath}`,
  ...(FFMPEG_DIR ? ["--ffmpeg-location", FFMPEG_DIR] : []),
  ...EXTRA_ARGS,
];

function run(args, onLine) {
  return new Promise((resolve) => {
    const child = spawn(YTDLP, [...BASE_ARGS, ...args], {
      windowsHide: true,
      env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" },
    });
    let stdout = "";
    let stderr = "";
    let pending = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (!onLine) return;
      pending += chunk;
      const lines = pending.split(/\r?\n/);
      pending = lines.pop();
      lines.forEach(onLine);
    });
    child.stderr.on("data", (chunk) => (stderr = (stderr + chunk).slice(-8000)));
    child.on("error", (err) => resolve({ code: -1, stdout, stderr: `${stderr}\nERROR: ${err.message}` }));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

/** Lo que dijo yt-dlp, en algo que se entienda en la app. */
function friendly(stderr) {
  const line = stderr.split(/\r?\n/).reverse().find((l) => l.startsWith("ERROR:")) ?? stderr.trim().split(/\r?\n/).pop() ?? "";
  if (/confirm you.?re not a bot|Sign in to confirm/i.test(line)) return "YouTube pidió confirmar que no es un bot. Probá de nuevo en un rato.";
  if (/private video/i.test(line)) return "Es un video privado.";
  if (/confirm your age|age-restricted|inappropriate/i.test(line)) return "YouTube pide confirmar la edad para este video: no se puede bajar sin una cuenta.";
  if (/members-only|join this channel/i.test(line)) return "Es un video solo para miembros del canal.";
  if (/live event|is live|premieres? in|will begin/i.test(line)) return "Es un vivo o un estreno que todavía no terminó.";
  if (/unavailable|not available|removed|does not exist/i.test(line)) return "Ese video no está disponible.";
  if (/ENOENT|not recognized|spawn/i.test(line)) return "No encuentro yt-dlp en la PC del servicio.";
  return `yt-dlp no pudo con este video: ${line.replace(/^ERROR:\s*(\[[^\]]+\]\s*)?/, "").slice(0, 200)}`;
}

/* ───────────── Datos de un video ───────────── */

const infoCache = new Map();

async function getInfo(id) {
  const cached = infoCache.get(id);
  if (cached && Date.now() - cached.at < INFO_TTL) return cached.data;

  const { code, stdout, stderr } = await run(["-J", watchUrl(id)]);
  if (code !== 0) throw Object.assign(new Error(friendly(stderr)), { status: 422 });
  const j = JSON.parse(stdout);

  const formats = j.formats ?? [];
  const res = (f) => Math.min(f.width || f.height || 0, f.height || f.width || 0);
  const size = (f) => f?.filesize || f?.filesize_approx || undefined;
  const videos = formats.filter((f) => f.vcodec && f.vcodec !== "none" && res(f) > 0);
  const audio = formats
    .filter((f) => f.vcodec === "none" && f.acodec && f.acodec !== "none")
    .sort((a, b) => (b.ext === "m4a") - (a.ext === "m4a") || (b.abr ?? 0) - (a.abr ?? 0))[0];
  // Las mismas preferencias que al bajar (H.264 primero): así la calidad y el peso son los del archivo que sale.
  const pick = (q) =>
    videos
      .filter((f) => res(f) <= q)
      .sort((a, b) => /^avc1/.test(b.vcodec) - /^avc1/.test(a.vcodec) || res(b) - res(a) || (size(b) ?? 0) - (size(a) ?? 0))[0];

  // q es el tope que se pide al bajar; res, lo que de verdad sale (un video de 720p no ofrece "1080p").
  const qualities = [];
  for (const q of QUALITIES) {
    const f = pick(q);
    if (!f || qualities.some((x) => x.res === res(f))) continue;
    const video = size(f);
    qualities.push({ q, res: res(f), mute: video, video: video && size(audio) ? video + size(audio) : undefined });
  }

  const data = {
    id,
    title: j.title,
    channel: j.channel || j.uploader,
    duration: j.duration ? Math.round(j.duration) : undefined,
    live: !!j.is_live,
    qualities,
    audio: size(audio),
  };
  infoCache.set(id, { data, at: Date.now() });
  return data;
}

/* ───────────── Descargas ───────────── */

const jobs = new Map();
const queue = [];
let running = 0;

function startJob(id, mode, q) {
  const key = `${id}-${mode}${mode === "audio" ? "" : `-${q}`}`;
  const existing = jobs.get(key);
  if (existing && existing.status !== "error" && (existing.status !== "done" || fs.existsSync(existing.file))) {
    existing.touched = Date.now();
    return existing;
  }
  const job = { key, id, mode, q, status: "queued", phase: null, percent: 0, file: null, size: 0, ext: null, error: null, touched: Date.now() };
  jobs.set(key, job);
  queue.push(job);
  pump();
  return job;
}

function pump() {
  while (running < MAX_PARALLEL && queue.length) {
    const job = queue.shift();
    running++;
    download(job).finally(() => {
      running--;
      pump();
    });
  }
}

async function download(job) {
  const dir = path.join(TMP, job.key);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  job.status = "downloading";
  const started = Date.now();

  const format = {
    // Con audio: H.264 + AAC en MP4, lo que abre cualquier editor. Si no hay H.264 en esa calidad, lo mejor que haya.
    video: ["-f", "bv*+ba/b", "-S", `vcodec:h264,res:${job.q},acodec:aac`, "--merge-output-format", "mp4"],
    mute: ["-f", "bv*", "-S", `vcodec:h264,res:${job.q}`, "--remux-video", "mp4"],
    audio: ["-f", "ba[ext=m4a]/ba", "-x", "--audio-format", "m4a"],
  }[job.mode];

  const { code, stderr } = await run(
    [
      ...format,
      "--newline",
      "--progress-template",
      "download:PROGRESO %(progress.downloaded_bytes)s %(progress.total_bytes)s %(progress.total_bytes_estimate)s %(info.vcodec)s",
      "-o",
      path.join(dir, "media.%(ext)s"),
      watchUrl(job.id),
    ],
    (line) => {
      const m = line.match(/^PROGRESO (\S+) (\S+) (\S+) (\S+)/);
      if (m) {
        const total = Number(m[2]) || Number(m[3]) || 0;
        job.phase = m[4] === "none" ? "audio" : "video";
        job.percent = total ? Math.min(100, Math.round((Number(m[1]) / total) * 100)) : 0;
      } else if (/^\[(Merger|VideoRemuxer|ExtractAudio|FixupM4a)\]/.test(line)) {
        job.status = "processing";
      }
    }
  );

  let file = fs.readdirSync(dir).find((f) => f.startsWith("media.") && !/\.(part|ytdl|temp)$/.test(f));
  if (code !== 0 || !file) {
    job.status = "error";
    job.error = code === 0 ? "yt-dlp terminó sin dejar el archivo." : friendly(stderr);
    log(`✗ ${job.key}: ${job.error}`);
    return;
  }
  // El video solo llega como MP4 "DASH" (fragmentado), que algunos editores no abren: se rearma como un MP4
  // común, copiando la imagen tal cual (no se vuelve a comprimir).
  if (job.mode === "mute") {
    job.status = "processing";
    const out = path.join(dir, "final.mp4");
    const ok = await ffmpeg(["-i", path.join(dir, file), "-map", "0:v:0", "-c", "copy", "-movflags", "+faststart", out]);
    if (ok) {
      fs.rmSync(path.join(dir, file), { force: true });
      file = "final.mp4";
    }
  }
  job.file = path.join(dir, file);
  job.ext = path.extname(file).slice(1);
  job.size = fs.statSync(job.file).size;
  job.status = "done";
  job.percent = 100;
  job.touched = Date.now();
  log(`✓ ${job.key} (${(job.size / 1e6).toFixed(1)} MB en ${Math.round((Date.now() - started) / 1000)} s)`);
}

function ffmpeg(args) {
  return new Promise((resolve) => {
    const bin = FFMPEG_DIR ? path.join(FFMPEG_DIR, process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg") : "ffmpeg";
    const child = spawn(bin, ["-hide_banner", "-loglevel", "error", "-y", ...args], { windowsHide: true });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

function publicJob(job) {
  const { key, status, phase, percent, size, ext, error } = job;
  return { id: key, status, phase, percent, size, ext, error };
}

// Limpieza: lo que nadie pidió en la última hora se borra.
setInterval(() => {
  for (const [key, job] of jobs) {
    if (["queued", "downloading", "processing"].includes(job.status)) continue;
    if (Date.now() - job.touched < KEEP_MS) continue;
    fs.rmSync(path.join(TMP, key), { recursive: true, force: true });
    jobs.delete(key);
  }
}, 5 * 60 * 1000).unref();

/* ───────────── Permisos ───────────── */

/** "<video>.<vence>.<firma>": lo firma la app (lib/downloads/youtube.server.ts) con la misma clave. */
function checkToken(token, id) {
  const [v, exp, sig] = String(token ?? "").split(".");
  if (!v || !exp || !sig || v !== id || Number(exp) * 1000 < Date.now()) return false;
  const expected = crypto.createHmac("sha256", SECRET).update(`${v}.${exp}`).digest("base64url");
  return safeEqual(sig, expected);
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/* ───────────── HTTP ───────────── */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  cors(req, res);
  if (req.method === "OPTIONS") return end(res, 204);

  try {
    if (req.method === "GET" && url.pathname === "/health") return json(res, 200, { ok: true, jobs: jobs.size, public: publicUrl });

    // Datos del video: solo la app (servidor a servidor, con la clave).
    if (req.method === "GET" && url.pathname === "/info") {
      if (!safeEqual(req.headers.authorization ?? "", `Bearer ${SECRET}`)) return json(res, 401, { error: "Sin permiso" });
      const id = videoId(url.searchParams.get("v"));
      if (!id) return json(res, 400, { error: "Falta el video" });
      return json(res, 200, await getInfo(id));
    }

    if (req.method === "POST" && url.pathname === "/jobs") {
      const body = await readJson(req);
      const id = videoId(String(body?.t ?? "").split(".")[0]);
      if (!id || !checkToken(body.t, id)) return json(res, 403, { error: "El permiso venció: volvé a pegar el link." });
      const mode = MODES.has(body.mode) ? body.mode : "video";
      const q = QUALITIES.includes(Number(body.q)) ? Number(body.q) : 1080;
      const job = startJob(id, mode, q);
      if (job.status === "queued") log(`→ ${job.key}`);
      return json(res, 200, publicJob(job));
    }

    const m = url.pathname.match(/^\/jobs\/([\w-]+)(\/file)?$/);
    if (req.method === "GET" && m) {
      const job = jobs.get(m[1]);
      if (!job || !checkToken(url.searchParams.get("t"), job.id)) return json(res, 404, { error: "No encuentro esa descarga: volvé a intentar." });
      job.touched = Date.now();
      if (!m[2]) return json(res, 200, publicJob(job));
      if (job.status !== "done" || !fs.existsSync(job.file)) return json(res, 409, { error: "El archivo todavía no está listo." });
      return sendFile(req, res, job, url.searchParams.get("name"));
    }

    json(res, 404, { error: "No existe" });
  } catch (err) {
    json(res, err.status ?? 500, { error: err.status ? err.message : "Algo falló en el servicio de YouTube." });
    if (!err.status) console.error(err);
  }
});

function sendFile(req, res, job, name) {
  const type = job.ext === "m4a" ? "audio/mp4" : job.ext === "webm" ? "video/webm" : "video/mp4";
  const fileName = `${safeFileName(name || job.id).replace(/\.[a-z0-9]{1,5}$/i, "")}.${job.ext}`;
  const headers = {
    "Content-Type": type,
    "Content-Disposition": attachment(fileName),
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
  };
  const range = req.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : job.size - Number(range[2]);
    let endByte = range[1] && range[2] ? Number(range[2]) : job.size - 1;
    start = Math.max(0, start);
    endByte = Math.min(endByte, job.size - 1);
    if (start > endByte) return end(res, 416, { "Content-Range": `bytes */${job.size}` });
    res.writeHead(206, { ...headers, "Content-Length": endByte - start + 1, "Content-Range": `bytes ${start}-${endByte}/${job.size}` });
    return fs.createReadStream(job.file, { start, end: endByte }).pipe(res);
  }
  res.writeHead(200, { ...headers, "Content-Length": job.size });
  fs.createReadStream(job.file).pipe(res);
}

function cors(req, res) {
  const origin = req.headers.origin;
  const allowed = ORIGINS.includes("*") ? "*" : origin && ORIGINS.includes(origin) ? origin : null;
  if (allowed) res.setHeader("Access-Control-Allow-Origin", allowed);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Range");
  res.setHeader("Access-Control-Expose-Headers", "Content-Length, Content-Disposition, Content-Range");
  // Chrome pide este permiso cuando una página pública llama a una dirección de la red local.
  if (req.headers["access-control-request-private-network"]) res.setHeader("Access-Control-Allow-Private-Network", "true");
}

function json(res, status, body) {
  end(res, status, { "Content-Type": "application/json; charset=utf-8" }, JSON.stringify(body));
}

function end(res, status, headers = {}, body) {
  if (res.headersSent) return res.end();
  res.writeHead(status, headers);
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (c) => {
      raw += c;
      if (raw.length > 4096) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(null);
      }
    });
    req.on("error", () => resolve(null));
  });
}

/* ───────────── Utilidades ───────────── */

function videoId(v) {
  return typeof v === "string" && /^[\w-]{11}$/.test(v) ? v : null;
}

function watchUrl(id) {
  return `https://www.youtube.com/watch?v=${id}`;
}

function local(name) {
  const file = path.join(BIN, name);
  return fs.existsSync(file) ? file : null;
}

function safeFileName(name) {
  return (
    String(name)
      .normalize("NFKC")
      .replace(/[\p{Extended_Pictographic}‍️]/gu, "")
      .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120)
      .trim() || "video"
  );
}

function attachment(name) {
  const ascii = name.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  const utf8 = encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}

function log(message) {
  console.log(`${new Date().toLocaleTimeString("es-AR", { hourCycle: "h23" })}  ${message}`);
}

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
  }
}

/** La primera vez se crea el .env con una clave nueva: la misma va en Vercel. */
function firstRun() {
  if (fs.existsSync(ENV_FILE)) return;
  const secret = crypto.randomBytes(32).toString("base64url");
  fs.writeFileSync(
    ENV_FILE,
    `# Configuración del servicio de YouTube (ver README.md)\nPORT=8787\nYOUTUBE_WORKER_SECRET=${secret}\n# Token del Blob store de Vercel, donde se anota la dirección del túnel (Vercel → Storage → el store → .env.local).\nBLOB_READ_WRITE_TOKEN=\n# Orígenes que pueden bajar archivos (coma entre cada uno). * = cualquiera con un permiso firmado.\nALLOWED_ORIGINS=*\n`
  );
  console.log(`Creé ${ENV_FILE} con una clave nueva. Copiala en Vercel como YOUTUBE_WORKER_SECRET.`);
}

/* ───────────── Arranque ───────────── */

server.listen(PORT, () => {
  log(`Servicio de YouTube en http://localhost:${PORT}  (yt-dlp: ${YTDLP})`);
  if (process.env.YTDLP_AUTO_UPDATE !== "0") updateYtdlp();
  if (CLOUDFLARED) startTunnel();
  else if (process.env.PUBLIC_URL) announce(process.env.PUBLIC_URL.replace(/\/+$/, ""));
  else log("Sin túnel ni PUBLIC_URL: solo se puede usar desde esta PC (YOUTUBE_WORKER_URL=http://localhost:" + PORT + ").");
});

// Al cerrar el servicio se cierra también el túnel.
process.on("exit", () => tunnel?.kill());
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, () => process.exit(0));

/* ───────────── Túnel y dirección pública ───────────── */

let tunnel = null;
let publicUrl = null;
let failedChecks = 0;

/** Túnel de Cloudflare sin cuenta: da una dirección https://<palabras>.trycloudflare.com nueva cada vez. */
function startTunnel() {
  publicUrl = null;
  const child = spawn(CLOUDFLARED, ["tunnel", "--url", `http://localhost:${PORT}`, "--no-autoupdate"], { windowsHide: true });
  tunnel = child;
  let buffer = "";
  const onData = (chunk) => {
    if (publicUrl) return;
    buffer = (buffer + chunk).slice(-4000);
    const url = buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0];
    if (url) {
      publicUrl = url;
      waitAndAnnounce(url, child);
    }
  };
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", onData);
  child.stderr.on("data", onData);
  child.on("error", (err) => log(`No pude abrir el túnel de Cloudflare (${err.message}).`));
  child.on("close", (code) => {
    if (tunnel !== child) return;
    tunnel = null;
    publicUrl = null;
    log(`El túnel se cerró (código ${code}): lo vuelvo a abrir en 10 segundos.`);
    setTimeout(startTunnel, 10_000);
  });
}

/** Cloudflare tarda unos segundos en publicar la dirección: se espera a que responda antes de anotarla. */
async function waitAndAnnounce(url, child) {
  for (let i = 0; i < 30 && tunnel === child; i++) {
    if (await reachable(url)) return announce(url);
    await sleep(2000);
  }
  if (tunnel === child) {
    log("El túnel no respondió: lo reinicio.");
    child.kill();
  }
}

async function reachable(url) {
  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(8000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function announce(url) {
  log(`Dirección pública: ${url}`);
  if (!BLOB_TOKEN) {
    log("Falta BLOB_READ_WRITE_TOKEN en .env: la app no se va a enterar de esta dirección (ver README).");
    return;
  }
  for (let attempt = 0; ; attempt++) {
    const error = await writeBlob(url);
    if (!error) return log("Dirección anotada en Vercel: la app ya la usa.");
    log(`No pude anotar la dirección en Vercel (${error}).`);
    await sleep(Math.min(5 * 60_000, 15_000 * 2 ** attempt));
    // Si mientras tanto el túnel cambió de dirección, ya la anota el intento nuevo.
    if (CLOUDFLARED && url !== publicUrl) return;
  }
}

/**
 * Anota la dirección en el Blob store de Vercel: el mismo pedido que hace put() de @vercel/blob (API v12).
 * Prueba como privado y como público, según cómo se haya creado el store.
 */
let blobAccess = null;
async function writeBlob(url) {
  const body = JSON.stringify({ url, actualizado: new Date().toISOString() });
  let lastError = "";
  for (const access of blobAccess ? [blobAccess] : ["private", "public"]) {
    try {
      const res = await fetch(`https://vercel.com/api/blob/?${new URLSearchParams({ pathname: BLOB_PATH })}`, {
        method: "PUT",
        headers: {
          authorization: `Bearer ${BLOB_TOKEN}`,
          // El token es "vercel_blob_rw_<store>_<secreto>": la API pide el store aparte.
          "x-vercel-blob-store-id": BLOB_TOKEN.split("_")[3] ?? "",
          "x-api-version": "12",
          "x-vercel-blob-access": access,
          "x-add-random-suffix": "0",
          "x-allow-overwrite": "1",
          "x-content-type": "application/json",
          "x-cache-control-max-age": "60",
        },
        body,
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) {
        blobAccess = access;
        return null;
      }
      lastError = `${res.status} ${(await res.text()).slice(0, 160)}`;
    } catch (err) {
      lastError = err.message;
    }
  }
  return lastError;
}

// Si el túnel deja de responder (pasa después de cortes de internet), se reinicia y se anota la dirección nueva.
setInterval(async () => {
  if (!tunnel || !publicUrl) return;
  failedChecks = (await reachable(publicUrl)) ? 0 : failedChecks + 1;
  if (failedChecks >= 3) {
    failedChecks = 0;
    log("El túnel no responde hace rato: lo reinicio.");
    tunnel.kill();
  }
}, 5 * 60 * 1000).unref();

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** YouTube cambia seguido y yt-dlp se actualiza casi todas las semanas: se pone al día al arrancar y cada día. */
function updateYtdlp() {
  const tick = () => {
    const child = spawn(YTDLP, ["-U"], { windowsHide: true });
    let out = "";
    child.stdout?.on("data", (c) => (out += c));
    child.on("error", () => {});
    child.on("close", () => {
      const line = out.trim().split(/\r?\n/).pop();
      if (line) log(`yt-dlp: ${line}`);
    });
  };
  tick();
  setInterval(tick, 24 * 60 * 60 * 1000).unref();
}
