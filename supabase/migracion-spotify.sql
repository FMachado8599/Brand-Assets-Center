-- ============================================================
-- Spotify: el Jam del estudio.
-- Una sola fila: quién es el DJ (la persona que armó el Jam en su Spotify), su conexión y el link
-- del Jam. Con esa conexión, cualquiera del estudio ve qué suena y suma canciones a la cola desde
-- la app, sin conectar su propia cuenta.
-- Los tokens se guardan cifrados (la clave vive solo en el servidor, en INTEGRACIONES_SECRET):
-- leer esta tabla no alcanza para usar la cuenta del DJ.
-- Correr DESPUÉS de migracion-acceso.sql (usa has_access()).
-- Supabase → SQL Editor → pegar todo → Run. Se puede correr más de una vez.
-- ============================================================

create table if not exists public.spotify_jam (
  id smallint primary key default 1,
  -- El DJ en la app (para saber quién puede cambiar el link o terminar el Jam).
  dj_user uuid not null references auth.users(id) on delete cascade,
  dj_nombre text,
  -- Su cuenta de Spotify.
  spotify_id text not null,
  spotify_nombre text,
  access_token text not null,
  refresh_token text not null,
  expira timestamptz not null,
  -- El link para unirse (Spotify → Jam → Invitar → Copiar link). Spotify no deja crearlo desde afuera.
  jam_link text,
  conectado timestamptz not null default now(),
  actualizado timestamptz not null default now(),
  constraint spotify_jam_unico check (id = 1)
);

alter table public.spotify_jam enable row level security;

drop policy if exists "solo el estudio" on public.spotify_jam;
create policy "solo el estudio" on public.spotify_jam
  for all to authenticated
  using ((select public.has_access()))
  with check ((select public.has_access()));
