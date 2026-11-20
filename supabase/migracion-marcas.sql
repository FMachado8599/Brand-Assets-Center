-- ============================================================
-- Marcas principales y secundarias.
-- Cada uno elige, entre las marcas de los proyectos de Basecamp en los que está, cuáles son sus
-- principales y cuáles sus secundarias. Las dos son filas de marca_equipo:
--   · principal = true: es el designado de esa marca en ese sector (uno solo por marca y sector). Las
--     tareas nuevas de la marca le llegan a él y lo de la marca le avisa como "tuya".
--   · principal = false: secundaria. También la trabaja (pueden ser varios por marca y sector): se
--     entera de sus novedades en "Todo" (motivo "marca"), sin que le lleguen las tareas.
-- La tabla y los permisos ya estaban (migracion-equipo.sql: cada uno las suyas, un admin las de
-- cualquiera). Acá solo cambia el aviso de los comentarios de una presentación: antes le llegaba como
-- "tuya" a todos los de la marca; ahora así solo a los principales, y a los secundarios como "marca".
--
-- Historial de migraciones: feature_marcas. SQL Editor: "Feature | Marcas".
-- Correr DESPUÉS de migracion-equipo.sql y migracion-presentaciones-board.sql.
-- Supabase → SQL Editor → pegar todo → Run. Se puede correr más de una vez: no mueve datos.
-- ============================================================

comment on column public.marca_equipo.principal is
  'true: la marca es principal de esa persona (el designado; uno por marca y sector) · false: secundaria (también la trabaja)';

-- Los comentarios de una presentación avisan a:
--   te nombraron (@vos);
--   tuya: los principales de la marca en Redacción, Diseño, CM y Cuentas, quien tiene la tarea en el
--     Board y los asignados en Basecamp;
--   tu conversación: quien escribió el comentario que se responde y los que ya comentaron esa pieza
--     (o la presentación, en los generales);
--   tu marca: los que la tienen como secundaria en esos sectores.
-- A quien lo escribió no le avisa. Lo que cada uno silenció en esa tarea lo frena
-- notificaciones_silenciar (migracion-notificaciones.sql). Un aviso que falla nunca frena el comentario.
create or replace function public.presentacion_comentario_avisar()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_p record;
  v_titulo text;
  v_texto text;
  v_enlace text;
  v_meses text[] := array['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
begin
  select pr.id, pr.brand_id, pr.mes, pr.bc_tarea_id, b.name as marca, coalesce(t.nombre, 'Presentación') as tipo, bt.proyecto_id,
         bt.asignados, f.responsable_id
    into v_p
    from public.presentaciones pr
    left join public.brands b on b.id = pr.brand_id
    left join public.presentacion_tipos t on t.id = pr.tipo
    left join public.bc_tareas bt on bt.id = pr.bc_tarea_id
    left join public.tarea_flujo f on f.tarea_id = pr.bc_tarea_id
   where pr.id = new.presentacion_id;
  if v_p.id is null then
    return null;
  end if;

  v_titulo := concat_ws(' · ', v_p.marca, v_p.tipo || ' ' || v_meses[v_p.mes]);
  v_texto := case when new.autor_equipo_id is null then coalesce(nullif(btrim(new.autor_nombre), ''), 'El cliente') || ' (cliente): ' else '' end
             || left(new.texto, 280);
  v_enlace := '/presentaciones/' || v_p.id || case when new.pieza_id is null then '' else '?pieza=' || new.pieza_id end;

  with cand(persona_id, motivo, rango) as (
    select m, 'mencion', 5 from unnest(new.menciones) m
    union all
    -- Principal: "tuya". Secundaria: "marca" (en Todo, sin sumar a la campanita).
    select me.persona_id, case when me.principal then 'tuya' else 'marca' end, case when me.principal then 3 else 1 end
      from public.marca_equipo me
     where me.brand_id = v_p.brand_id and me.sector_id in ('redaccion', 'diseno_digital', 'cm', 'cuentas')
    union all
    select v_p.responsable_id, 'tuya', 3 where v_p.responsable_id is not null
    union all
    select e.id, 'tuya', 3 from public.equipo e where e.bc_persona_id = any(coalesce(v_p.asignados, '{}'))
    union all
    select c.autor_equipo_id, 'hilo', 2
      from public.presentacion_comentarios c
     where c.id = new.respuesta_a
        or (c.presentacion_id = new.presentacion_id and c.pieza_id is not distinct from new.pieza_id and c.id <> new.id)
  )
  insert into public.notificaciones (persona_id, origen, motivo, tarea_id, proyecto_id, autor_id, texto, titulo, brand_id, presentacion_id, enlace, creada)
  select distinct on (c.persona_id) c.persona_id, 'app', c.motivo, v_p.bc_tarea_id, v_p.proyecto_id, new.autor_equipo_id,
         v_texto, v_titulo, v_p.brand_id, v_p.id, v_enlace, new.created_at
    from cand c
    join public.equipo e on e.id = c.persona_id
   where e.activo and c.persona_id is distinct from new.autor_equipo_id
   order by c.persona_id, c.rango desc;
  return null;
exception when others then
  return null;
end;
$$;
revoke execute on function public.presentacion_comentario_avisar() from public, anon;
