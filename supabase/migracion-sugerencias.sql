-- ============================================================
-- Sugerencias: el tablero de ideas y errores del Inicio
--  - Cada sugerencia queda guardada y el estudio la ve en el tablero (post-its).
--  - Con sesión se puede firmar con nombre y foto, o mandarla anónima.
--  - "Me sumo": cada persona del estudio puede apoyar una idea una vez.
--  - Quien administra (feedback_admins) marca "En camino" / "Hecha" o borra cualquiera.
-- Correr DESPUÉS de migracion-acceso.sql (usa has_access()).
-- Supabase → SQL Editor → pegar todo → Run. Se puede correr más de una vez.
-- ============================================================

-- 1. Sugerencias ------------------------------------------------
create table if not exists public.sugerencias (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('idea', 'error')),
  body text not null check (char_length(body) between 3 and 5000),
  -- Quién la mandó. Se guarda siempre que hay sesión (para poder borrar la propia),
  -- pero en el tablero solo se muestra si show_identity.
  user_id uuid references auth.users(id) on delete set null,
  show_identity boolean not null default false,
  author_name text check (char_length(author_name) <= 80),
  author_avatar text check (char_length(author_avatar) <= 500),
  status text not null default 'abierta' check (status in ('abierta', 'en_camino', 'hecha')),
  page text check (char_length(page) <= 200),
  created_at timestamptz not null default now()
);

create index if not exists sugerencias_created_idx on public.sugerencias(created_at desc);

-- 2. "Me sumo" --------------------------------------------------
create table if not exists public.sugerencia_votos (
  sugerencia_id uuid not null references public.sugerencias(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (sugerencia_id, user_id)
);

-- 3. Quién administra el tablero --------------------------------
-- Sin políticas: solo se edita desde el panel de Supabase.
create table if not exists public.feedback_admins (
  email text primary key check (email = lower(email))
);
insert into public.feedback_admins (email) values ('fmachado@camaratbwa.com') on conflict do nothing;

create or replace function public.is_feedback_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.feedback_admins a where a.email = lower(auth.jwt() ->> 'email'));
$$;

-- 4. Permisos ---------------------------------------------------
-- Nada se lee ni se escribe directo: la tabla tiene user_id, que en las anónimas no se
-- muestra. Todo pasa por las funciones de abajo, que chequean quién pide qué.
alter table public.sugerencias enable row level security;
alter table public.sugerencia_votos enable row level security;
alter table public.feedback_admins enable row level security;

-- 5. Mandar una ---------------------------------------------------
-- Con sesión del estudio: firma con el nombre y la foto de su cuenta (si show_identity).
-- Sin sesión (ej: "no puedo entrar"): anónima o con el nombre que escriba, y con un tope
-- de 10 por minuto entre todas las anónimas, para que nadie pueda llenar el tablero.
create or replace function public.enviar_sugerencia(
  p_kind text,
  p_body text,
  p_show_identity boolean default false,
  p_name text default null,
  p_page text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  studio boolean := coalesce(public.has_access(), false);
  v_name text;
  v_avatar text;
  new_id uuid;
begin
  if p_kind not in ('idea', 'error') then
    raise exception 'Tipo inválido';
  end if;

  if uid is not null and studio then
    if p_show_identity then
      select coalesce(nullif(trim(p.full_name), ''), split_part(p.email, '@', 1)), p.avatar_url
        into v_name, v_avatar
        from public.profiles p where p.id = uid;
    end if;
  else
    uid := null;
    if (select count(*) from public.sugerencias s
        where s.user_id is null and s.created_at > now() - interval '1 minute') >= 10 then
      raise exception 'Demasiados envíos seguidos: probá en un minuto';
    end if;
    v_name := nullif(left(trim(coalesce(p_name, '')), 80), '');
  end if;

  insert into public.sugerencias (kind, body, user_id, show_identity, author_name, author_avatar, page)
  values (
    p_kind,
    left(trim(p_body), 5000),
    uid,
    v_name is not null,
    v_name,
    left(v_avatar, 500),
    left(p_page, 200)
  )
  returning id into new_id;
  return new_id;
end;
$$;

-- 6. El tablero ---------------------------------------------------
-- Solo para el estudio. No devuelve user_id: dice si es tuya (mine) y qué podés hacer.
create or replace function public.tablero_sugerencias()
returns table (
  id uuid,
  kind text,
  body text,
  status text,
  created_at timestamptz,
  author_name text,
  author_avatar text,
  votos bigint,
  votada boolean,
  mine boolean,
  can_manage boolean
)
language sql stable security definer set search_path = '' as $$
  select
    s.id, s.kind, s.body, s.status, s.created_at,
    case when s.show_identity then s.author_name end,
    case when s.show_identity then s.author_avatar end,
    (select count(*) from public.sugerencia_votos v where v.sugerencia_id = s.id),
    exists (select 1 from public.sugerencia_votos v where v.sugerencia_id = s.id and v.user_id = auth.uid()),
    s.user_id is not null and s.user_id = auth.uid(),
    public.is_feedback_admin()
  from public.sugerencias s
  where public.has_access()
  order by s.created_at desc
  limit 300;
$$;

-- 7. Me sumo / ya no ----------------------------------------------
-- Devuelve si quedaste sumado.
create or replace function public.alternar_voto_sugerencia(p_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null or not coalesce(public.has_access(), false) then
    raise exception 'Iniciá sesión con tu cuenta del estudio';
  end if;
  delete from public.sugerencia_votos v where v.sugerencia_id = p_id and v.user_id = uid;
  if found then
    return false;
  end if;
  insert into public.sugerencia_votos (sugerencia_id, user_id) values (p_id, uid);
  return true;
end;
$$;

-- 8. Estado y borrar -------------------------------------------------
create or replace function public.estado_sugerencia(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_feedback_admin() then
    raise exception 'Solo quien administra el tablero puede cambiar el estado';
  end if;
  if p_status not in ('abierta', 'en_camino', 'hecha') then
    raise exception 'Estado inválido';
  end if;
  update public.sugerencias set status = p_status where id = p_id;
end;
$$;

-- La propia, o cualquiera si administrás.
create or replace function public.borrar_sugerencia(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not coalesce(public.has_access(), false) then
    raise exception 'Iniciá sesión con tu cuenta del estudio';
  end if;
  delete from public.sugerencias s
  where s.id = p_id and (s.user_id = auth.uid() or public.is_feedback_admin());
  if not found then
    raise exception 'Solo podés borrar las tuyas';
  end if;
end;
$$;

-- Quién puede llamar a cada función.
revoke all on function public.enviar_sugerencia(text, text, boolean, text, text) from public;
grant execute on function public.enviar_sugerencia(text, text, boolean, text, text) to anon, authenticated;
revoke all on function public.tablero_sugerencias() from public, anon;
grant execute on function public.tablero_sugerencias() to authenticated;
revoke all on function public.is_feedback_admin() from public, anon;
grant execute on function public.is_feedback_admin() to authenticated;
revoke all on function public.alternar_voto_sugerencia(uuid) from public, anon;
grant execute on function public.alternar_voto_sugerencia(uuid) to authenticated;
revoke all on function public.estado_sugerencia(uuid, text) from public, anon;
grant execute on function public.estado_sugerencia(uuid, text) to authenticated;
revoke all on function public.borrar_sugerencia(uuid) from public, anon;
grant execute on function public.borrar_sugerencia(uuid) to authenticated;
