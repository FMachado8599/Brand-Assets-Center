-- ============================================================
-- Presentaciones ↔ Board: cuando una presentación pasa de etapa (ej: "Redacción lista" → Diseño),
-- la tarea de Basecamp a la que está vinculada pasa a esa etapa en el Board, y al designado de la
-- marca en ese sector le llega el aviso de que le toca. Es solo en la app: Basecamp no se toca
-- (la app solo lee de Basecamp).
--
--   presentación    →  Board
--   Redacción       →  Redacción (en un tablero que no es Digital: En proceso)
--   Diseño          →  Diseño    (ídem)
--   Revisión        →  Validación interna
--   En cliente      →  Cliente
--   Programación    →  Implementación (CM)
--   Lista           →  Finalizada
--
-- Correr DESPUÉS de migracion-presentaciones.sql, migracion-flujo.sql (tarea_mover, flujo_sector)
-- y migracion-notificaciones.sql. Se puede correr más de una vez.
-- ============================================================

-- La etapa del Board que corresponde a la de la presentación.
create or replace function public.presentacion_etapa_board(p_estado text, p_tablero text)
returns text language sql immutable set search_path = '' as $$
  select case p_estado
    when 'redaccion' then case when p_tablero = 'Digital' then 'redaccion' else 'en_proceso' end
    when 'diseno' then case when p_tablero = 'Digital' then 'diseno' else 'en_proceso' end
    when 'revision' then 'validacion'
    when 'cliente' then 'cliente'
    when 'programacion' then 'implementacion'
    when 'lista' then 'finalizada'
  end;
$$;

-- Cómo se nombra cada etapa de la presentación (para la nota del movimiento y el aviso).
create or replace function public.presentacion_estado_nombre(p_estado text)
returns text language sql immutable set search_path = '' as $$
  select case p_estado
    when 'redaccion' then 'Redacción'
    when 'diseno' then 'Diseño'
    when 'revision' then 'Revisión'
    when 'cliente' then 'En cliente'
    when 'programacion' then 'Programación'
    when 'lista' then 'Lista'
    else p_estado
  end;
$$;

-- Cómo se dice que una etapa terminó ("Redacción lista", "Diseño listo"…), para el aviso.
create or replace function public.presentacion_estado_listo(p_estado text)
returns text language sql immutable set search_path = '' as $$
  select case p_estado
    when 'redaccion' then 'Redacción lista'
    when 'diseno' then 'Diseño listo'
    when 'revision' then 'Revisión lista'
    when 'cliente' then 'Aprobada por el cliente'
    when 'programacion' then 'Programación lista'
    else public.presentacion_estado_nombre(p_estado)
  end;
$$;

/*
 * Pasa la presentación a otra etapa. Si está vinculada a una tarea, la mueve en el Board (con
 * tarea_mover: queda en el historial y la tarea pasa al sector nuevo) y le avisa al designado de
 * la marca en ese sector. Devuelve { estado, tarea, etapa, avisados }.
 */
create or replace function public.presentacion_cambiar_estado(p_presentacion uuid, p_estado text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_p public.presentaciones%rowtype;
  v_tarea public.bc_tareas%rowtype;
  v_tablero text;
  v_etapa text;
  v_sector text;
  v_yo uuid;
  v_orden text[] := array['redaccion', 'diseno', 'revision', 'cliente', 'programacion', 'lista'];
  v_texto text;
  v_avisados integer := 0;
begin
  if not public.has_access() then
    raise exception 'Solo el estudio' using errcode = '42501';
  end if;
  if not (p_estado = any(v_orden)) then
    raise exception 'Etapa desconocida';
  end if;
  select * into v_p from public.presentaciones where id = p_presentacion for update;
  if not found then
    raise exception 'Esa presentación no existe';
  end if;
  update public.presentaciones set estado = p_estado where id = p_presentacion;

  if v_p.bc_tarea_id is null or p_estado = v_p.estado then
    return jsonb_build_object('estado', p_estado, 'tarea', null, 'etapa', null, 'avisados', 0);
  end if;
  select * into v_tarea from public.bc_tareas where id = v_p.bc_tarea_id;
  if not found then
    -- La tarea ya no está en Basecamp (o todavía no se sincronizó): la presentación cambia igual.
    return jsonb_build_object('estado', p_estado, 'tarea', null, 'etapa', null, 'avisados', 0);
  end if;

  select tb.nombre into v_tablero
    from public.bc_columnas c
    left join public.bc_tableros tb on tb.id = c.tablero_id
   where c.id = v_tarea.columna_id;
  v_etapa := public.presentacion_etapa_board(p_estado, v_tablero);
  perform public.tarea_mover(v_tarea.id, v_etapa, null,
    'Desde la presentación: ' || public.presentacion_estado_nombre(p_estado));

  -- El aviso: hacia adelante, "Redacción lista: pasó a Diseño"; hacia atrás, "Volvió a Redacción".
  v_texto := case
    when array_position(v_orden, p_estado) > array_position(v_orden, v_p.estado)
      then public.presentacion_estado_listo(v_p.estado) || ': pasó a ' || public.presentacion_estado_nombre(p_estado)
    else 'Volvió a ' || public.presentacion_estado_nombre(p_estado)
  end;
  v_sector := public.flujo_sector(v_etapa, v_tablero);
  v_yo := public.mi_equipo_id();
  if v_sector is not null then
    insert into public.notificaciones (persona_id, origen, motivo, hilo_id, tarea_id, proyecto_id, autor_id, texto, creada)
    select me.persona_id, 'app', 'tuya', v_tarea.id, v_tarea.id, v_tarea.proyecto_id, v_yo, v_texto, now()
      from public.marca_equipo me
      join public.equipo e on e.id = me.persona_id and e.activo
     where me.brand_id = v_p.brand_id and me.sector_id = v_sector and me.principal
       and me.persona_id is distinct from v_yo;
    get diagnostics v_avisados = row_count;
  end if;

  return jsonb_build_object('estado', p_estado, 'tarea', v_tarea.id, 'etapa', v_etapa, 'avisados', v_avisados);
end;
$$;

revoke all on function public.presentacion_cambiar_estado(uuid, text) from public, anon;
grant execute on function public.presentacion_cambiar_estado(uuid, text) to authenticated;

-- ============================================================
-- Y al revés: la presentación sigue a su tarea. Si la tarea cambia de etapa en el Board (alguien la
-- arrastra) o en Basecamp (la card pasa de columna), la presentación pasa a la etapa que corresponde.
--
--   Board               →  presentación
--   Entrada, Redacción  →  Redacción
--   Diseño              →  Diseño
--   En proceso          →  queda en Redacción o Diseño si estaba en una de las dos; si no, Diseño
--   Validación interna  →  Revisión
--   Cliente             →  En cliente
--   Implementación      →  Programación
--   Finalizada          →  Lista
-- ============================================================

create or replace function public.presentacion_estado_de_board(p_etapa text, p_actual text)
returns text language sql immutable set search_path = '' as $$
  select case p_etapa
    when 'entrada' then 'redaccion'
    when 'redaccion' then 'redaccion'
    when 'diseno' then 'diseno'
    when 'en_proceso' then case when p_actual in ('redaccion', 'diseno') then p_actual else 'diseno' end
    when 'validacion' then 'revision'
    when 'cliente' then 'cliente'
    when 'implementacion' then 'programacion'
    when 'finalizada' then 'lista'
    else p_actual
  end;
$$;

-- Cuando cambia la etapa de una tarea en el Board. (Si el cambio vino de la presentación, la
-- presentación ya está en esa etapa: no pasa nada, así que no da vueltas.)
create or replace function public.presentacion_seguir_board()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.etapa is not distinct from old.etapa then
    return null;
  end if;
  update public.presentaciones p
     set estado = public.presentacion_estado_de_board(new.etapa, p.estado)
   where p.bc_tarea_id = new.tarea_id
     and p.estado is distinct from public.presentacion_estado_de_board(new.etapa, p.estado);
  return null;
end;
$$;

drop trigger if exists presentacion_seguir_board on public.tarea_flujo;
create trigger presentacion_seguir_board after insert or update of etapa on public.tarea_flujo
  for each row execute function public.presentacion_seguir_board();

-- Lo mismo que flujo_reconciliar, pero para una sola tarea: el Board sigue a Basecamp en el momento.
create or replace function public.flujo_reconciliar_tarea(p_tarea bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.flujo_asegurar(p_tarea);
  with cambios as (
    select f.tarea_id, f.etapa as antes, f.bc_estado as estado_antes, c.estado, t.columna_id,
           public.flujo_etapa_bc(c.estado, c.nombre, tb.nombre, t.completada) as nueva
      from public.tarea_flujo f
      join public.bc_tareas t on t.id = f.tarea_id
      left join public.bc_columnas c on c.id = t.columna_id
      left join public.bc_tableros tb on tb.id = c.tablero_id
     where f.tarea_id = p_tarea
       and (f.bc_columna_id is distinct from t.columna_id or (t.completada and f.etapa <> 'finalizada'))
  ), destino as (
    select x.*,
           case
             when x.nueva is null then x.antes
             when x.nueva = 'redaccion' and x.antes in ('redaccion', 'diseno') then x.antes
             else x.nueva
           end as despues
      from cambios x
  ), aplicados as (
    update public.tarea_flujo f
       set etapa = d.despues,
           responsable_id = case when d.despues <> d.antes then null else f.responsable_id end,
           pausada = case
                       when d.estado = 'not_now' then true
                       when d.estado_antes = 'not_now' then false
                       else f.pausada
                     end,
           bc_columna_id = d.columna_id,
           bc_estado = d.estado,
           updated_at = now()
      from destino d
     where f.tarea_id = d.tarea_id
    returning f.tarea_id, d.antes, d.despues
  )
  insert into public.tarea_movimientos (tarea_id, tipo, de, a, origen)
  select tarea_id, 'etapa', antes, despues, 'basecamp' from aplicados where antes <> despues;
end;
$$;

revoke execute on function public.flujo_reconciliar_tarea(bigint) from public, anon, authenticated;

-- Cuando una card cambia de columna en Basecamp (por el aviso al instante o la sincronización):
-- si tiene presentación, el Board la sigue en el momento (y con él, la presentación). Las demás
-- tareas se siguen poniendo al día al abrir el Board, como siempre.
create or replace function public.presentacion_seguir_basecamp()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.presentaciones p where p.bc_tarea_id = new.id) then
    perform public.flujo_reconciliar_tarea(new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists presentacion_seguir_basecamp on public.bc_tareas;
create trigger presentacion_seguir_basecamp after update of columna_id, completada on public.bc_tareas
  for each row
  when (old.columna_id is distinct from new.columna_id or old.completada is distinct from new.completada)
  execute function public.presentacion_seguir_basecamp();
