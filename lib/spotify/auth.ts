import { hasSecret } from "@/lib/integraciones/crypto";

/**
 * OAuth de Spotify (Authorization Code con client secret): el canje del código y la renovación
 * pasan solo por el servidor, así el secreto y los tokens nunca llegan al navegador.
 * https://developer.spotify.com/documentation/web-api/tutorials/code-flow
 */

/**
 * Lo mínimo para el Jam, con la cuenta del DJ: leer qué suena y la cola (GET /me/player/queue pide
 * user-read-playback-state y user-read-currently-playing), sumar a la cola (user-modify-playback-state)
 * y buscar con su país (user-read-private).
 */
export const SPOTIFY_SCOPES = [
  "user-read-private",
  "user-read-playback-state",
  "user-read-currently-playing",
  "user-modify-playback-state",
];

// SPOTIFY_ACCOUNTS_URL y SPOTIFY_API_URL solo para probar contra una API simulada; en producción no se definen.
const ACCOUNTS = () => process.env.SPOTIFY_ACCOUNTS_URL || "https://accounts.spotify.com";
export const SPOTIFY_API = () => process.env.SPOTIFY_API_URL || "https://api.spotify.com";

const clientId = () => process.env.SPOTIFY_CLIENT_ID?.trim() ?? "";
const clientSecret = () => process.env.SPOTIFY_CLIENT_SECRET?.trim() ?? "";

export const hasSpotifyEnv = () => Boolean(clientId() && clientSecret() && hasSecret());

/**
 * El origen con el que la persona abrió la app. En `next dev`, request.url dice "localhost" aunque
 * se haya entrado por 127.0.0.1; el Host (o el x-forwarded-host de Vercel) dice la verdad. Un Host
 * inventado no lleva a ningún lado: Spotify solo vuelve a direcciones registradas.
 */
export function origenDe(request: Request) {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const url = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0].trim() ?? url.protocol.slice(0, -1);
  return host ? `${proto}://${host}` : url.origin;
}

/**
 * La dirección de vuelta tiene que coincidir exacta con una registrada en el Dashboard de Spotify.
 * Spotify no acepta "localhost": en local hay que abrir la app en http://127.0.0.1:3000.
 */
export function spotifyRedirectUri(request: Request) {
  const fija = process.env.SPOTIFY_REDIRECT_URI?.trim();
  return fija || `${origenDe(request)}/api/spotify/callback`;
}

export function spotifyAuthorizeUrl(redirectUri: string, state: string) {
  const url = new URL(`${ACCOUNTS()}/authorize`);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId(),
    scope: SPOTIFY_SCOPES.join(" "),
    redirect_uri: redirectUri,
    state,
    // Siempre la pantalla de permiso: muestra con qué cuenta de Spotify se entra (y deja cambiarla),
    // y evita que una autorización a medias de antes termine en "server_error".
    show_dialog: "true",
  }).toString();
  return url.toString();
}

type TokenResponse = {
  access_token: string;
  token_type: string;
  scope?: string;
  expires_in: number;
  refresh_token?: string;
};

/** Un error de Spotify con lo que conviene mostrar (sin tokens ni el cuerpo crudo). */
export class SpotifyError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** El refresh token ya no sirve (venció a los 6 meses o se revocó): hay que volver a conectar. */
    readonly reconectar = false
  ) {
    super(message);
  }
}

async function pedirToken(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(`${ACCOUNTS()}/api/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId()}:${clientSecret()}`).toString("base64")}`,
    },
    body: new URLSearchParams(body),
    cache: "no-store",
  });
  if (res.ok) return (await res.json()) as TokenResponse;
  const error = (await res.json().catch(() => ({}))) as { error?: string; error_description?: string };
  if (error.error === "invalid_grant") {
    throw new SpotifyError("La conexión con Spotify venció: volvé a conectar tu cuenta", 401, true);
  }
  throw new SpotifyError(`Spotify no entregó el token (${error.error_description ?? error.error ?? res.status})`, 502);
}

export const canjearCodigo = (code: string, redirectUri: string) =>
  pedirToken({ grant_type: "authorization_code", code, redirect_uri: redirectUri });

export const renovarToken = (refreshToken: string) =>
  pedirToken({ grant_type: "refresh_token", refresh_token: refreshToken });

/** El perfil de la cuenta conectada. En Development Mode ya no trae email, país ni tipo de cuenta (feb 2026). */
export async function perfilSpotify(accessToken: string) {
  const res = await fetch(`${SPOTIFY_API()}/v1/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (res.status === 403) {
    throw new SpotifyError(
      "Esa cuenta de Spotify no está habilitada en la app: en Development Mode hay que sumarla en User Management del Dashboard (hasta 5)",
      403
    );
  }
  if (!res.ok) throw new SpotifyError(`Spotify no devolvió el perfil (${res.status})`, 502);
  const me = (await res.json()) as { id: string; display_name: string | null };
  return { id: me.id, nombre: me.display_name || me.id };
}
