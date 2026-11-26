-- ============================================================
-- Registro de descargas (Descargas → Métricas)
--  - Una fila por archivo que alguien del estudio baja (o sube a Drive) desde Descargas: quién (su
--    cuenta), cuándo, de qué plataforma y posteo, qué bajó, a dónde y si fue desde la red de la oficina.
--  - No se guarda la IP: la app la compara en el momento con la de la oficina y anota solo sí o no.
--  - Lo escribe la app con la sesión de cada uno (/api/descargas/registro). Lo leen solo quienes estén
--    en descargas_admins (la página /descargas/metricas). Nadie lo edita ni lo borra desde la app.
-- Correr DESPUÉS de migracion-usuarios.sql y migracion-acceso.sql (usa profiles y has_access()).
-- Supabase → SQL Editor → pegar todo → Run. Se puede correr más de una vez.
-- ============================================================

do $$
begin
  if to_regprocedure('public.has_access()') is null then
    raise exception 'Primero corré supabase/migracion-acceso.sql (define has_access()) y volvé a correr esto.';
  end if;
  if to_regclass('public.profiles') is null then
    raise exception 'Primero corré supabase/migracion-usuarios.sql (crea profiles) y volvé a correr esto.';
  end if;
end $$;

-- 1. El registro ----------------------------------------------------
create table if not exists public.descargas_registro (
  id bigint generated always as identity primary key,
  creado timestamptz not null default now(),
  -- Si la cuenta se borra, la descarga queda en las estadísticas, sin nombre.
  user_id uuid default auth.uid() references auth.users(id) on delete set null,
  plataforma text not null check (plataforma in ('youtube', 'instagram', 'pinterest')),
  posteo_id text not null check (char_length(posteo_id) between 1 and 100),
  posteo_url text not null check (char_length(posteo_url) between 1 and 300),
  titulo text check (char_length(titulo) <= 300),
  -- La cuenta de Instagram, el canal de YouTube o quien guardó el pin.
  autor text check (char_length(autor) <= 200),
  -- Qué salió: el video, una foto, la portada de un video o solo el audio.
  tipo text not null check (tipo in ('video', 'foto', 'portada', 'audio')),
  -- En un carrusel, cuál de los archivos (1, 2…). null si el posteo tiene uno solo.
  numero smallint check (numero between 1 and 100),
  -- YouTube: la calidad que salió (1080, 720…).
  calidad smallint check (calidad between 1 and 10000),
  -- Videos: con o sin audio.
  audio text check (audio in ('con', 'sin')),
  destino text not null check (destino in ('compu', 'ambos', 'drive')),
  -- Exacto cuando el archivo pasó por la página; si no, lo que informó el origen (aproximado en YouTube).
  bytes bigint check (bytes >= 0),
  -- Desde la red de la oficina. null = no se pudo saber (por ejemplo, con el servicio de la PC apagado).
  desde_oficina boolean
);
create index if not exists descargas_registro_creado_idx on public.descargas_registro (creado desc);
create index if not exists descargas_registro_user_idx on public.descargas_registro (user_id, creado desc);

-- 2. Quién ve las métricas ---------------------------------------------
-- Sin políticas: solo se edita desde acá (SQL Editor o el editor de tablas de Supabase).
create table if not exists public.descargas_admins (
  email text primary key check (email = lower(email))
);
insert into public.descargas_admins (email) values ('fmachado@camaratbwa.com') on conflict do nothing;

create or replace function public.is_descargas_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.descargas_admins a where a.email = lower(auth.jwt() ->> 'email'));
$$;

-- 3. Permisos -----------------------------------------------------------
alter table public.descargas_registro enable row level security;
alter table public.descargas_admins enable row level security;

-- Cada uno anota solo las suyas (user_id lo pone la base).
drop policy if exists "descargas: anotar las propias" on public.descargas_registro;
create policy "descargas: anotar las propias" on public.descargas_registro
  for insert to authenticated
  with check (public.has_access() and user_id = auth.uid());

-- Leer, solo quien administra (la página de métricas usa la función de abajo, que suma los nombres).
drop policy if exists "descargas: leer si administrás" on public.descargas_registro;
create policy "descargas: leer si administrás" on public.descargas_registro
  for select to authenticated
  using (public.is_descargas_admin());

grant insert on public.descargas_registro to authenticated;
grant select on public.descargas_registro to authenticated;

-- 4. El registro con el nombre de cada uno ------------------------------------
-- profiles solo deja leer el propio: esta función suma nombre y foto, y solo responde a quien administra.
-- PostgREST devuelve de a 1000 filas: la página pide de a tandas (range).
create or replace function public.descargas_registro_listado(p_desde timestamptz default null)
returns table (
  id bigint,
  creado timestamptz,
  user_id uuid,
  nombre text,
  email text,
  avatar_url text,
  plataforma text,
  posteo_id text,
  posteo_url text,
  titulo text,
  autor text,
  tipo text,
  numero smallint,
  calidad smallint,
  audio text,
  destino text,
  bytes bigint,
  desde_oficina boolean
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_descargas_admin() then
    raise exception 'Solo quien administra las descargas puede ver el registro' using errcode = '42501';
  end if;
  return query
    select r.id, r.creado, r.user_id, p.full_name, p.email, p.avatar_url, r.plataforma, r.posteo_id, r.posteo_url,
           r.titulo, r.autor, r.tipo, r.numero, r.calidad, r.audio, r.destino, r.bytes, r.desde_oficina
    from public.descargas_registro r
    left join public.profiles p on p.id = r.user_id
    where p_desde is null or r.creado >= p_desde
    order by r.creado desc, r.id desc;
end $$;

revoke all on function public.is_descargas_admin() from public, anon;
grant execute on function public.is_descargas_admin() to authenticated;
revoke all on function public.descargas_registro_listado(timestamptz) from public, anon;
grant execute on function public.descargas_registro_listado(timestamptz) to authenticated;
