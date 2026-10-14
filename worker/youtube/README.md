# Servicio de YouTube (Herramientas → Descargas)

YouTube no deja bajar videos en buena calidad desde servidores en la nube como Vercel. Este servicio corre en una PC con conexión de oficina (o en el servidor de la empresa), baja con **yt-dlp** + **ffmpeg** y entrega el archivo al navegador.

- Es un solo archivo de Node (`server.mjs`), sin dependencias.
- La app le pide los datos de cada video con una clave compartida (`YOUTUBE_WORKER_SECRET`).
- El navegador le pide el archivo con un permiso firmado por la app, que sirve para un solo video y vence a las 6 horas. Sin clave o sin permiso no responde nada.
- Lo bajado queda una hora en la carpeta temporal: si otra persona pide el mismo video, sale al instante.
- yt-dlp se actualiza solo al arrancar y una vez por día (YouTube cambia seguido).

## Instalar en una PC nueva

1. **Node 20 o más nuevo** ([nodejs.org](https://nodejs.org)). yt-dlp también lo usa para resolver el desafío de YouTube.
2. Copiar esta carpeta (`worker/youtube`) a la PC.
3. Poner los programas en `bin/`:
   - `yt-dlp.exe`, de [github.com/yt-dlp/yt-dlp/releases](https://github.com/yt-dlp/yt-dlp/releases/latest) (el ejecutable oficial ya trae lo que necesita para YouTube);
   - `ffmpeg.exe` y `ffprobe.exe`, de [gyan.dev/ffmpeg/builds](https://www.gyan.dev/ffmpeg/builds/) (el "release essentials", carpeta `bin` del zip).
   
   Si ya están instalados en el sistema (en el PATH), no hace falta copiarlos. En Linux o Mac van `yt-dlp` y `ffmpeg` del sistema.
4. Arrancarlo: doble click en `iniciar.cmd` (o `node server.mjs`). La primera vez crea `.env` con una clave nueva.
5. Publicarlo con una dirección https fija. Lo más simple es [Tailscale Funnel](https://tailscale.com/kb/1223/funnel): instalar Tailscale, iniciar sesión y correr `tailscale funnel --bg 8787`. También sirve Cloudflare Tunnel, o una dirección del servidor de la empresa con certificado.
6. En Vercel (y en `.env.local` para desarrollo), cargar:
   - `YOUTUBE_WORKER_URL`: la dirección pública;
   - `YOUTUBE_WORKER_SECRET`: la misma clave del `.env` de acá.
7. Para que arranque con Windows: un acceso directo a `iniciar.cmd` en la carpeta de inicio (`Win+R` → `shell:startup`).

Para probar que anda: `http://localhost:8787/health` responde `{"ok":true,…}`.

## Configuración (`.env`)

| Variable | Para qué | Por defecto |
| --- | --- | --- |
| `YOUTUBE_WORKER_SECRET` | Clave compartida con la app (32 caracteres o más) | Se genera la primera vez |
| `PORT` | Puerto local | `8787` |
| `ALLOWED_ORIGINS` | Sitios que pueden pedirle archivos, separados por coma (ej: `https://herramientas.camaratbwa.com`) | `*` (cualquiera con un permiso firmado) |
| `MAX_PARALLEL` | Videos que baja a la vez (el resto espera) | `2` |
| `YTDLP`, `FFMPEG_DIR` | Dónde están yt-dlp y la carpeta de ffmpeg, si no están en `bin/` | `bin/` o el PATH |
| `YTDLP_ARGS` | Opciones extra para yt-dlp (ej: `--cookies-from-browser chrome`, ver abajo) | — |
| `YTDLP_AUTO_UPDATE` | `0` para no actualizar yt-dlp solo | activado |
| `TMP_DIR` | Dónde quedan los archivos mientras tanto | carpeta temporal del sistema |

## Si algo falla

- **"YouTube pidió confirmar que no es un bot"**: pasa si se piden muchos videos seguidos desde la misma conexión. Suele pasar solo en un rato. Si se vuelve constante, se le pueden pasar a yt-dlp las cookies de un navegador con una cuenta de Google iniciada (`YTDLP_ARGS=--cookies-from-browser chrome`). Conviene una cuenta que no sea personal: YouTube puede limitar cuentas que bajan mucho.
- **Algo que antes andaba deja de andar**: casi siempre es yt-dlp desactualizado. Cerrar y volver a abrir el servicio lo actualiza; también `bin\yt-dlp.exe -U`.
- **La app dice que la PC no responde**: el servicio está cerrado, la PC apagada o el túnel caído. Probar `https://<dirección pública>/health`.
