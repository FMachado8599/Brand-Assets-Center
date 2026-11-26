-- ============================================================
-- Feature | Cumpleaños (en el historial de migraciones: feature_cumpleanos)
-- El cumpleaños de cada persona del equipo: solo el día y el mes (el año no se pide ni se guarda).
--   - Es opcional: cada uno lo carga o lo borra desde su Perfil (mi_cumple).
--   - Un admin también lo puede cargar desde Board → Organización (la ficha de cada persona).
--   - Lo ve todo el estudio: sale en el perfil, en el Calendario y en el aviso de Slack del día.
-- Además, quiénes son los compañeros de cada uno (su hub, sus directores y la gente de sus mismas
-- marcas): a ellos les llega el aviso de que hoy cumple.
-- Correr DESPUÉS de migracion-equipo.sql y migracion-organigrama.sql.
-- Supabase → SQL Editor → pegar todo → Run. Se puede correr más de una vez: no mueve datos.
-- ============================================================

do $$
begin
  if to_regclass('public.equipo') is null or to_regclass('public.hub_lideres') is null then
    raise exception 'Primero corré supabase/migracion-equipo.sql y supabase/migracion-organigrama.sql, y volvé a correr esto.';
  end if;
end $$;

-- 1. El día y el mes ----------------------------------------------
alter table public.equipo add column if not exists cumple_dia smallint;
alter table public.equipo add column if not exists cumple_mes smallint;

-- Los dos o ninguno, y una fecha que existe (el 29 de febrero sí: se festeja el 28 los años que no tienen).
alter table public.equipo drop constraint if exists equipo_cumple_valido;
alter table public.equipo add constraint equipo_cumple_valido check (
  (cumple_dia is null) = (cumple_mes is null)
  and (
    cumple_mes is null
    or (cumple_mes between 1 and 12
        and cumple_dia between 1 and case when cumple_mes = 2 then 29 when cumple_mes in (4, 6, 9, 11) then 30 else 31 end)
  )
);
create index if not exists equipo_cumple_idx on public.equipo (cumple_mes, cumple_dia) where cumple_mes is not null;

-- 2. Cada uno, el suyo ----------------------------------------------
-- El equipo lo editan los admins (RLS); el cumpleaños propio lo puede poner o sacar cualquiera.
-- null y null = sacarlo.
create or replace function public.mi_cumple(p_dia int, p_mes int)
returns void language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.has_access() then
    raise exception 'Iniciá sesión con tu cuenta del estudio' using errcode = '42501';
  end if;
  v_id := public.mi_equipo_id();
  if v_id is null then
    raise exception 'Todavía no estás en el equipo del Board: pedile a un admin que te sume';
  end if;
  update public.equipo set cumple_dia = p_dia, cumple_mes = p_mes, updated_at = now() where id = v_id;
end;
$$;
revoke execute on function public.mi_cumple(int, int) from public, anon;
grant execute on function public.mi_cumple(int, int) to authenticated;

-- 3. El día que se festeja un año dado --------------------------------
-- El 29 de febrero, los años que no tienen, se festeja el 28.
create or replace function public.cumple_en(p_dia int, p_mes int, p_anio int)
returns date language sql immutable set search_path = '' as $$
  select case
    when p_dia is null or p_mes is null then null
    when p_mes = 2 and p_dia = 29
         and not ((p_anio % 4 = 0 and p_anio % 100 <> 0) or p_anio % 400 = 0) then make_date(p_anio, 2, 28)
    else make_date(p_anio, p_mes, p_dia)
  end;
$$;

-- 4. Los compañeros de alguien ------------------------------------------
-- La gente de su hub, los directores de su hub, la gente de los hubs que dirige y los designados de
-- sus mismas marcas. Solo los activos, sin la persona.
-- companeros_de no se puede llamar desde afuera: la usan las funciones del servidor (los avisos de
-- Slack). companeros es la misma, para el estudio.
create or replace function public.companeros_de(p_persona uuid)
returns table (persona_id uuid) language sql stable security definer set search_path = '' as $$
  select distinct c.id
    from (
      select o.id from public.equipo e join public.equipo o on o.hub_id = e.hub_id where e.id = p_persona and e.hub_id is not null
      union
      select hl.persona_id from public.equipo e join public.hub_lideres hl on hl.hub_id = e.hub_id where e.id = p_persona
      union
      select o.id from public.hub_lideres hl join public.equipo o on o.hub_id = hl.hub_id where hl.persona_id = p_persona
      union
      select m2.persona_id from public.marca_equipo m1 join public.marca_equipo m2 on m2.brand_id = m1.brand_id where m1.persona_id = p_persona
    ) c(id)
    join public.equipo e on e.id = c.id
   where e.activo and c.id <> p_persona;
$$;
revoke execute on function public.companeros_de(uuid) from public, anon, authenticated;

create or replace function public.companeros(p_persona uuid)
returns table (persona_id uuid) language sql stable security definer set search_path = '' as $$
  select c.persona_id from public.companeros_de(p_persona) c where public.has_access();
$$;
revoke execute on function public.companeros(uuid) from public, anon;
grant execute on function public.companeros(uuid) to authenticated;
