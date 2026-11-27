-- ============================================================
-- Feature | Calendario (en el historial de migraciones: feature_calendario)
-- El link personal para ver el calendario del estudio en Google Calendar o en Outlook (se suscribe
-- desde "Agregar calendario → Desde URL"). Cada uno tiene el suyo:
--   - Sus tareas con fecha de entrega (las asignadas en Basecamp y las que tiene en el Board).
--   - Los cumpleaños del estudio (marcados los de sus compañeros).
-- El link es la llave: quien lo tenga ve ese calendario. Se puede cambiar por uno nuevo desde la app
-- (el anterior deja de andar) y solo lo ve su dueño.
-- Las reuniones del calendario de Google del estudio no pasan por acá: las lee y las crea el servidor
-- de la app con la conexión de Google (la del Drive, con el permiso de Calendar).
-- Correr DESPUÉS de migracion-acceso.sql, migracion-flujo.sql y migracion-cumpleanos.sql.
-- Supabase → SQL Editor → pegar todo → Run. Se puede correr más de una vez: no mueve datos.
-- ============================================================

do $$
begin
  if to_regprocedure('public.has_access()') is null or to_regclass('public.board_flujo') is null
     or to_regprocedure('public.cumple_en(integer, integer, integer)') is null then
    raise exception 'Faltan migraciones anteriores (acceso, flujo y cumpleanos). Corrélas y volvé a correr esto.';
  end if;
end $$;

-- 1. El link de cada uno ------------------------------------------
create table if not exists public.agenda_links (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token text not null unique,
  creado timestamptz not null default now(),
  -- La última vez que Google u Outlook lo pidieron (para saber si alguien está suscripto).
  usado timestamptz,
  constraint agenda_links_token check (token ~ '^[0-9a-f]{64}$')
);

alter table public.agenda_links enable row level security;
-- Solo su dueño lo ve; se crea y se cambia con agenda_mi_link.
drop policy if exists "cada uno el suyo" on public.agenda_links;
create policy "cada uno el suyo" on public.agenda_links for select to authenticated using (user_id = (select auth.uid()));

-- El link propio: si no tiene, se crea; con p_renovar se cambia por uno nuevo (el anterior deja de andar).
create or replace function public.agenda_mi_link(p_renovar boolean default false)
returns text language plpgsql security definer set search_path = '' as $$
declare v_token text;
begin
  if auth.uid() is null or not public.has_access() then
    raise exception 'Iniciá sesión con tu cuenta del estudio' using errcode = '42501';
  end if;
  if not coalesce(p_renovar, false) then
    select token into v_token from public.agenda_links where user_id = auth.uid();
    if v_token is not null then
      return v_token;
    end if;
  end if;
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.agenda_links (user_id, token) values (auth.uid(), v_token)
  on conflict (user_id) do update set token = excluded.token, creado = now(), usado = null;
  return v_token;
end;
$$;
revoke execute on function public.agenda_mi_link(boolean) from public, anon;
grant execute on function public.agenda_mi_link(boolean) to authenticated;

-- 2. Lo que trae el link ---------------------------------------------
-- Lo pide Google u Outlook, sin sesión: la llave es el token.
create or replace function public.agenda_ics(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
  v_email text;
  v_yo record;
  v_tareas jsonb;
  v_cumples jsonb;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  select l.user_id, lower(u.email) into v_user, v_email
    from public.agenda_links l join auth.users u on u.id = l.user_id
   where l.token = p_token;
  if v_user is null then
    return null;
  end if;
  -- Si le sacaron el acceso al estudio, el link deja de andar.
  if not public.email_allowed(v_email) then
    return null;
  end if;
  update public.agenda_links set usado = now() where user_id = v_user;

  select e.id, e.bc_persona_id, e.nombre into v_yo from public.equipo e where e.email = v_email;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', f.id, 'titulo', f.titulo, 'marca', b.name, 'proyecto', f.proyecto, 'tablero', f.tablero,
           'fecha', coalesce(f.entrega, f.vence), 'app_url', f.app_url, 'etapa', f.etapa, 'actualizada', f.actualizada
         )), '[]'::jsonb)
    into v_tareas
    from (
      select f.* from public.board_flujo f
       where v_yo.id is not null
         and not f.completada and coalesce(f.etapa, '') <> 'finalizada'
         and coalesce(f.entrega, f.vence) between current_date - 60 and current_date + 365
         and (f.responsable_id = v_yo.id or (v_yo.bc_persona_id is not null and f.asignados @> array[v_yo.bc_persona_id::bigint]))
       order by coalesce(f.entrega, f.vence)
       limit 400
    ) f
    left join public.brands b on b.id = f.brand_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'persona_id', e.id,
           'nombre', coalesce(nullif(btrim(pr.nombre_visible), ''), e.nombre),
           'dia', e.cumple_dia, 'mes', e.cumple_mes,
           'companero', exists (select 1 from public.companeros_de(v_yo.id) c where c.persona_id = e.id),
           'yo', e.id = v_yo.id
         )), '[]'::jsonb)
    into v_cumples
    from public.equipo e
    left join lateral (select x.nombre_visible from public.profiles x where lower(x.email) = e.email limit 1) pr on true
   where e.activo and e.cumple_mes is not null;

  return jsonb_build_object('nombre', v_yo.nombre, 'tareas', v_tareas, 'cumples', v_cumples);
end;
$$;
revoke all on function public.agenda_ics(text) from public;
grant execute on function public.agenda_ics(text) to anon, authenticated;
