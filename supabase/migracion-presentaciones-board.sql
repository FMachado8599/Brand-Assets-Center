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
