-- ============================================================
-- Usuarios (login con Google), preferencias por cuenta y visitas
-- Correr DESPUÉS de schema.sql (y de las migraciones anteriores).
-- Supabase → SQL Editor → pegar todo → Run. Se puede correr más de una vez.
-- ============================================================

-- 1. Perfiles ---------------------------------------------------
-- Una fila por persona que inició sesión. Se completa sola con lo que
-- manda Google (nombre, mail, foto) gracias al trigger de más abajo.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "perfil propio: leer" on public.profiles;
drop policy if exists "perfil propio: editar" on public.profiles;
create policy "perfil propio: leer" on public.profiles
  for select to authenticated using (auth.uid() = id);
create policy "perfil propio: editar" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Quien ya se había registrado antes de correr esto también tiene perfil.
insert into public.profiles (id, email, full_name, avatar_url)
select id, email,
       coalesce(raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'name'),
       coalesce(raw_user_meta_data ->> 'avatar_url', raw_user_meta_data ->> 'picture')
from auth.users
on conflict (id) do nothing;

-- 2. Preferencias por cuenta ------------------------------------
-- Las mismas claves que cada módulo guarda en el navegador
-- ("emojis:favoritos", "emojis:recientes", "gif:ajustes"…), con su valor en JSON.
create table if not exists public.user_prefs (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null check (char_length(key) <= 64),
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.user_prefs enable row level security;

drop policy if exists "preferencias propias" on public.user_prefs;
create policy "preferencias propias" on public.user_prefs
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Tope por preferencia: favoritos y ajustes entran de sobra; evita que alguien llene la base.
alter table public.user_prefs drop constraint if exists user_prefs_value_size;
alter table public.user_prefs add constraint user_prefs_value_size check (octet_length(value::text) <= 100000);

-- 3. Tarjetas: quién las crea -----------------------------------
-- El tablero sigue siendo compartido (todos ven y editan todo, como antes).
-- Solo se anota el autor, para el filtro "Solo mis tarjetas".
alter table public.cards add column if not exists owner_id uuid references auth.users(id) on delete set null;
create index if not exists cards_owner_idx on public.cards(owner_id);

-- El autor lo pone la base con la sesión del pedido y después no cambia:
-- el navegador no puede inventarlo ni pasarle la tarjeta a otro.
create or replace function public.set_card_owner()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.owner_id := auth.uid();
  else
    new.owner_id := old.owner_id;
  end if;
  return new;
end;
$$;

drop trigger if exists cards_owner on public.cards;
create trigger cards_owner before insert or update on public.cards
  for each row execute function public.set_card_owner();

-- 4. Visitas ----------------------------------------------------
-- Una fila por página vista. user_id si había sesión; si no, visitor_id es
-- un id anónimo (cookie de un año) para contar invitados distintos.
-- No se guarda la IP.
create table if not exists public.visits (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  path text not null,
  referrer text,
  user_id uuid references auth.users(id) on delete set null,
  visitor_id text,
  user_agent text,
  country text
);

create index if not exists visits_created_idx on public.visits(created_at desc);
create index if not exists visits_user_idx on public.visits(user_id);

alter table public.visits enable row level security;

-- Cualquiera puede registrar una visita (solo a su nombre o como invitado);
-- nadie puede leerlas desde la app: se consultan en el panel de Supabase.
drop policy if exists "registrar visitas" on public.visits;
create policy "registrar visitas" on public.visits
  for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());

-- Resúmenes para mirar en el SQL Editor:
--   select * from visitas_por_dia;
--   select * from visitas_por_usuario;
-- (Zona horaria de Uruguay/Argentina: cambiala si hace falta.)
create or replace view public.visitas_por_dia with (security_invoker = true) as
select
  (created_at at time zone 'America/Montevideo')::date as dia,
  count(*) as visitas,
  count(*) filter (where user_id is null) as visitas_invitados,
  count(*) filter (where user_id is not null) as visitas_con_sesion,
  count(distinct visitor_id) filter (where user_id is null) as invitados_distintos,
  count(distinct user_id) as usuarios_distintos
from public.visits
group by 1
order by 1 desc;

create or replace view public.visitas_por_usuario with (security_invoker = true) as
select
  p.email,
  p.full_name as nombre,
  count(*) as visitas,
  min(v.created_at) as primera_visita,
  max(v.created_at) as ultima_visita
from public.visits v
join public.profiles p on p.id = v.user_id
group by p.email, p.full_name
order by visitas desc;

revoke all on public.visitas_por_dia from anon, authenticated;
revoke all on public.visitas_por_usuario from anon, authenticated;
