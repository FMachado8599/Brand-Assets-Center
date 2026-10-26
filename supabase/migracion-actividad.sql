-- ============================================================
-- Board: quién está activo en el equipo, según lo que hace.
-- Activo = en los últimos 30 días hizo algo en Basecamp (movió una tarjeta, comentó, creó algo…),
-- lo etiquetaron en una tarea nueva o movió algo en la app. Lo mide la sincronización con
-- Basecamp y aplica la regla al terminar: desactiva a quien no hizo nada y reactiva a quien volvió.
-- Los admins no se tocan, y si un admin activa o desactiva a alguien a mano, queda fijo.
-- Correr DESPUÉS de migracion-flujo.sql.
-- Supabase → SQL Editor → pegar todo → Run. Se puede correr más de una vez.
-- ============================================================

-- Lo último que hizo cada persona en Basecamp (su "timeline") y cuándo se leyó.
alter table public.bc_personas add column if not exists ultima_actividad timestamptz;
alter table public.bc_personas add column if not exists actividad_leida timestamptz;

-- null = activo según la actividad; true/false = lo fijó un admin a mano.
alter table public.equipo add column if not exists activo_manual boolean;

-- La actividad de cada persona del equipo: en Basecamp, cuándo la etiquetaron por última vez en
-- una tarea nueva (asignada en una tarea creada) y lo último que movió en la app.
create or replace function public.equipo_actividad()
returns table (persona_id uuid, basecamp timestamptz, etiquetada timestamptz, app timestamptz, ultima timestamptz, medida boolean)
language sql stable security definer set search_path = '' as $$
  select e.id,
         b.ultima_actividad,
         t.ultima,
         m.ultima,
         greatest(b.ultima_actividad, t.ultima, m.ultima),
         b.actividad_leida is not null
    from public.equipo e
    left join public.bc_personas b on b.id = e.bc_persona_id
    left join lateral (
      select max(x.creada) as ultima from public.bc_tareas x
       where e.bc_persona_id is not null and x.asignados @> array[e.bc_persona_id]
    ) t on true
    left join lateral (
      select max(y.creado) as ultima from public.tarea_movimientos y where y.autor_id = e.id
    ) m on true
   where public.has_access();
$$;

-- La regla. Solo toca a quien ya se le midió la actividad en Basecamp, no es admin y no fue fijado a
-- mano. Devuelve a quiénes desactivó y a quiénes reactivó.
create or replace function public.equipo_aplicar_actividad(p_dias integer default 30)
returns json language plpgsql security definer set search_path = '' as $$
declare
  limite timestamptz := now() - make_interval(days => p_dias);
  desactivados text[];
  reactivados text[];
begin
  if not public.has_access() then
    return null;
  end if;
  with calculo as (
    select a.persona_id, coalesce(a.ultima >= limite, false) as activo
      from public.equipo_actividad() a
      join public.equipo e on e.id = a.persona_id
     where a.medida and e.activo_manual is null and e.rol <> 'admin'
  ), cambios as (
    update public.equipo e
       set activo = c.activo, updated_at = now()
      from calculo c
     where e.id = c.persona_id and e.activo is distinct from c.activo
    returning e.nombre, c.activo
  )
  select array_agg(nombre order by nombre) filter (where not activo),
         array_agg(nombre order by nombre) filter (where activo)
    into desactivados, reactivados
    from cambios;
  return json_build_object('desactivados', coalesce(desactivados, '{}'), 'reactivados', coalesce(reactivados, '{}'));
end;
$$;

revoke execute on function public.equipo_actividad() from anon;
revoke execute on function public.equipo_aplicar_actividad(integer) from anon;
