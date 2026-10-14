# Servicio de YouTube (Herramientas → Descargas)

YouTube no deja bajar videos en buena calidad desde servidores en la nube como Vercel. Este servicio corre en una PC con conexión de oficina (o en el servidor de la empresa), baja con **yt-dlp** + **ffmpeg** y entrega el archivo al navegador.

- Es un solo archivo de Node (`server.mjs`), sin dependencias.
- La app le pide los datos de cada video con una clave compartida (`YOUTUBE_WORKER_SECRET`).
- El navegador le pide el archivo con un permiso firmado por la app, que sirve para un solo video y vence a las 6 horas. Sin clave o sin permiso no responde nada.
- Lo bajado queda una hora en la carpeta temporal: si otra persona pide el mismo video, sale al instante.
- yt-dlp se actualiza solo al arrancar y una vez por día (YouTube cambia seguido).
- Se publica solo con un túnel gratis de Cloudflare, sin cuenta. La dirección cambia en cada arranque: el servicio la anota en el Blob store de Vercel y la app la lee de ahí. Si el túnel se cae, lo reabre y anota la nueva.

## Instalar en una PC nueva

1. **Node 20 o más nuevo** ([nodejs.org](https://nodejs.org)). yt-dlp también lo usa para resolver el desafío de YouTube.
2. Copiar esta carpeta (`worker/youtube`) a la PC.
3. Poner los programas en `bin/`:
   - `yt-dlp.exe`, de [github.com/yt-dlp/yt-dlp/releases](https://github.com/yt-dlp/yt-dlp/releases/latest) (el ejecutable oficial ya trae lo que necesita para YouTube);
   - `ffmpeg.exe` y `ffprobe.exe`, de [gyan.dev/ffmpeg/builds](https://www.gyan.dev/ffmpeg/builds/) (el "release essentials", carpeta `bin` del zip);
   - `cloudflared.exe`, de [github.com/cloudflare/cloudflared/releases](https://github.com/cloudflare/cloudflared/releases/latest) (`cloudflared-windows-amd64.exe`, renombrado).
   
   Si ya están instalados en el sistema (en el PATH), no hace falta copiar yt-dlp ni ffmpeg. En Linux o Mac van los del sistema (y `CLOUDFLARED=/ruta/a/cloudflared`).
4. Abrirlo una vez: doble click en `iniciar.cmd` (o `node server.mjs`). Crea `.env` con una clave nueva (`YOUTUBE_WORKER_SECRET`).
5. En Vercel:
   - **Storage → Create → Blob** y conectarlo al proyecto (si ya existe, usar ese). Vercel agrega solo `BLOB_READ_WRITE_TOKEN`.
   - **Settings → Environment Variables**: `YOUTUBE_WORKER_SECRET` con la misma clave del `.env` de acá. Después, *Redeploy*.
6. Copiar el token del Blob store (en el store, pestaña *.env.local*) en `BLOB_READ_WRITE_TOKEN` del `.env` de acá, y volver a abrir el servicio. Tiene que decir "Dirección anotada en Vercel: la app ya la usa".
7. Para que arranque con Windows: un acceso directo a `iniciar.cmd` en la carpeta de inicio (`Win+R` → `shell:startup`).

Para probar que anda: `http://localhost:8787/health` responde `{"ok":true,…,"public":"https://….trycloudflare.com"}`.

**En un servidor con dirección propia** (con https) no hace falta el túnel: `TUNNEL=off` y `PUBLIC_URL=https://…` en el `.env` (la anota igual en el Blob store), o directamente `YOUTUBE_WORKER_URL` en Vercel.

## Configuración (`.env`)

| Variable | Para qué | Por defecto |
| --- | --- | --- |
| `YOUTUBE_WORKER_SECRET` | Clave compartida con la app (32 caracteres o más) | Se genera la primera vez |
| `BLOB_READ_WRITE_TOKEN` | Token del Blob store de Vercel, para anotar la dirección pública | — (sin él, la app no se entera de la dirección) |
| `PORT` | Puerto local | `8787` |
| `TUNNEL`, `CLOUDFLARED` | `TUNNEL=off` para no abrir el túnel; `CLOUDFLARED`, dónde está cloudflared si no está en `bin/` | túnel activado |
| `PUBLIC_URL` | Dirección pública propia, si no se usa el túnel | — |
| `ALLOWED_ORIGINS` | Sitios que pueden pedirle archivos, separados por coma (ej: `https://herramientas.camaratbwa.com`) | `*` (cualquiera con un permiso firmado) |
| `MAX_PARALLEL` | Videos que baja a la vez (el resto espera) | `2` |
| `YTDLP`, `FFMPEG_DIR` | Dónde están yt-dlp y la carpeta de ffmpeg, si no están en `bin/` | `bin/` o el PATH |
| `YTDLP_ARGS` | Opciones extra para yt-dlp (ej: `--cookies-from-browser chrome`, ver abajo) | — |
| `YTDLP_AUTO_UPDATE` | `0` para no actualizar yt-dlp solo | activado |
| `TMP_DIR` | Dónde quedan los archivos mientras tanto | carpeta temporal del sistema |

## Si algo falla

- **"YouTube pidió confirmar que no es un bot"**: pasa si se piden muchos videos seguidos desde la misma conexión. Suele pasar solo en un rato. Si se vuelve constante, se le pueden pasar a yt-dlp las cookies de un navegador con una cuenta de Google iniciada (`YTDLP_ARGS=--cookies-from-browser chrome`). Conviene una cuenta que no sea personal: YouTube puede limitar cuentas que bajan mucho.
- **Algo que antes andaba deja de andar**: casi siempre es yt-dlp desactualizado. Cerrar y volver a abrir el servicio lo actualiza; también `bin\yt-dlp.exe -U`.
- **La app dice que la PC no responde**: el servicio está cerrado, la PC apagada o el túnel caído. La ventana del servicio muestra la dirección pública; probar `https://<esa dirección>/health`.
- **"No pude anotar la dirección en Vercel"**: el `BLOB_READ_WRITE_TOKEN` del `.env` no es el del store conectado al proyecto.
- Los túneles sin cuenta de Cloudflare no tienen garantía y Cloudflare pide no usarlos para mover mucho video. Para el uso del estudio alcanza; si crece, conviene el servidor de la empresa o un túnel con cuenta y dominio.
