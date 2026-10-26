-- ============================================================
-- Board: el flujo de cada tarea dentro del estudio.
-- Basecamp dice en qué columna está una tarea; acá vive lo que Basecamp no sabe:
--   - la etapa interna: "En proceso" se divide en Redacción y Diseño (en Digital casi nadie mueve
--     la tarjeta a "En proceso": se trabaja con la tarea en "Asignada");
--   - quién la tiene ahora (si alguien la tomó o se la pasaron; si no, es del designado de la marca);
--   - la prioridad que arman Cuentas arrastrando;
--   - si está en pausa, hasta cuándo vale el trabajo (para archivarla) y todo lo que le pasó.
-- La app no escribe en Basecamp: si alguien mueve la tarjeta allá, la app la sigue.
-- Correr DESPUÉS de migracion-equipo.sql.
-- Supabase → SQL Editor → pegar todo → Run. Se puede correr más de una vez.
-- ============================================================

-- 1. Tablas ----------------------------------------------------------
create table if not exists public.tarea_flujo (
  tarea_id bigint primary key references public.bc_tareas(id) on delete cascade,
  etapa text not null default 'entrada'
    check (etapa in ('entrada', 'redaccion', 'diseno', 'en_proceso', 'validacion', 'cliente', 'implementacion', 'finalizada')),
  -- Quién la tomó o a quién se la pasaron. null = la tiene el designado de la marca para esa etapa.
  responsable_id uuid references public.equipo(id) on delete set null,
  -- La prioridad que se arma arrastrando. null = por fecha.
  orden double precision,
  pausada boolean not null default false,
  pausa_motivo text,
  -- Hasta cuándo vale el trabajo (ej: la plani de noviembre, hasta fin de noviembre). Terminada y
  -- vencida esta fecha, la tarea se archiva. null = la fecha de entrega de Basecamp.
  vigente_hasta date,
  vigente_origen text check (vigente_origen in ('manual', 'ia')),
  -- La columna de Basecamp la última vez que se miró: si cambia, la movieron allá.
  bc_columna_id bigint,
  bc_estado text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.equipo(id) on delete set null
);
create index if not exists tarea_flujo_responsable_idx on public.tarea_flujo (responsable_id);

-- Todo lo que le pasa a una tarea: cambios de etapa (en la app o en Basecamp), quién la tomó,
-- pausas, fechas y validaciones. Es lo que siguen Cuentas.
create table if not exists public.tarea_movimientos (
  id bigint generated always as identity primary key,
  tarea_id bigint not null references public.bc_tareas(id) on delete cascade,
  tipo text not null check (tipo in ('etapa', 'responsable', 'pausa', 'fecha', 'validacion')),
  de text,
  a text,
  nota text,
  autor_id uuid references public.equipo(id) on delete set null,
  origen text not null default 'app' check (origen in ('app', 'basecamp', 'ia')),
  creado timestamptz not null default now()
);
create index if not exists tarea_movimientos_tarea_idx on public.tarea_movimientos (tarea_id, creado desc);

-- 2. De Basecamp a la etapa de la app ------------------------------------
-- null = no cambia la etapa (Not now: la tarea queda en pausa donde estaba; columnas propias de un
-- proyecto que no se reconocen).
create or replace function public.flujo_etapa_bc(p_estado text, p_columna text, p_tablero text, p_completada boolean)
returns text language sql immutable set search_path = '' as $$
  select case
    when p_completada or p_estado = 'done' or coalesce(p_columna, '') ilike 'factur%' then 'finalizada'
    when p_estado in ('triage', 'para_hacer', 'asignada') then 'entrada'
    when p_estado = 'en_proceso' then case when p_tablero = 'Digital' then 'redaccion' else 'en_proceso' end
    when p_estado in ('validacion', 'cliente', 'implementacion') then p_estado
    else null
  end;
$$;

-- El sector que trabaja cada etapa (Validación la hacen varios; Entrada y Finalizada, nadie).
create or replace function public.flujo_sector(p_etapa text, p_tablero text)
returns text language sql stable set search_path = '' as $$
  select case p_etapa
    when 'redaccion' then 'redaccion'
    when 'diseno' then 'diseno_digital'
    when 'implementacion' then 'cm'
    when 'cliente' then 'cuentas'
    when 'en_proceso' then (select s.id from public.sectores s where s.tablero = p_tablero order by s.orden limit 1)
    else null
  end;
$$;

-- 3. Seguir a Basecamp ---------------------------------------------------
-- Crea el flujo de las tareas nuevas y, en las que se movieron en Basecamp, la app sigue a Basecamp
-- (salvo "En proceso", que en la app es Redacción o Diseño: si ya estaba en una de las dos, queda).
-- La llama la app al abrir el Board; es rápida y se puede llamar las veces que sea.
create or replace function public.flujo_reconciliar()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  nuevas integer;
  movidas integer;
begin
  if not public.has_access() then
    return 0;
  end if;

  insert into public.tarea_flujo (tarea_id, etapa, pausada, bc_columna_id, bc_estado)
  select t.id,
         coalesce(public.flujo_etapa_bc(c.estado, c.nombre, tb.nombre, t.completada), 'entrada'),
         coalesce(c.estado = 'not_now', false),
         t.columna_id,
         c.estado
    from public.bc_tareas t
    left join public.bc_columnas c on c.id = t.columna_id
    left join public.bc_tableros tb on tb.id = c.tablero_id
   where (not t.completada or t.actualizada > now() - interval '60 days')
     and not exists (select 1 from public.tarea_flujo f where f.tarea_id = t.id)
  on conflict do nothing;
  get diagnostics nuevas = row_count;

  with cambios as (
    select f.tarea_id, f.etapa as antes, f.bc_estado as estado_antes, c.estado, t.columna_id,
           public.flujo_etapa_bc(c.estado, c.nombre, tb.nombre, t.completada) as nueva
      from public.tarea_flujo f
      join public.bc_tareas t on t.id = f.tarea_id
      left join public.bc_columnas c on c.id = t.columna_id
      left join public.bc_tableros tb on tb.id = c.tablero_id
     where f.bc_columna_id is distinct from t.columna_id
        or (t.completada and f.etapa <> 'finalizada')
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
  get diagnostics movidas = row_count;

  return nuevas + movidas;
end;
$$;

-- Que una tarea tenga su fila de flujo antes de cambiarla (por si todavía no se reconcilió).
create or replace function public.flujo_asegurar(p_tarea bigint)
returns void language sql security definer set search_path = '' as $$
  insert into public.tarea_flujo (tarea_id, etapa, pausada, bc_columna_id, bc_estado)
  select t.id,
         coalesce(public.flujo_etapa_bc(c.estado, c.nombre, tb.nombre, t.completada), 'entrada'),
         coalesce(c.estado = 'not_now', false),
         t.columna_id,
         c.estado
    from public.bc_tareas t
    left join public.bc_columnas c on c.id = t.columna_id
    left join public.bc_tableros tb on tb.id = c.tablero_id
   where t.id = p_tarea
  on conflict do nothing;
$$;

revoke execute on function public.flujo_asegurar(bigint) from public, anon, authenticated;

-- 4. Lo que se hace desde la app ------------------------------------------
-- Todo pasa por estas funciones (las tablas no se escriben directo): así cada cambio queda en el
-- historial con quién lo hizo.

create or replace function public.flujo_chequear()
returns uuid language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_access() then
    raise exception 'Iniciá sesión con tu cuenta del estudio';
  end if;
  return public.mi_equipo_id();
end;
$$;

-- Mover de etapa (arrastrando o con los botones). Si cambia de etapa, vuelve al designado de la
-- etapa nueva. p_orden: la prioridad en la columna donde se soltó.
create or replace function public.tarea_mover(p_tarea bigint, p_etapa text, p_orden double precision default null, p_nota text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  yo uuid := public.flujo_chequear();
  antes text;
begin
  perform public.flujo_asegurar(p_tarea);
  select etapa into antes from public.tarea_flujo where tarea_id = p_tarea for update;
  if antes is null then
    raise exception 'Esa tarea no existe';
  end if;
  update public.tarea_flujo
     set etapa = p_etapa,
         responsable_id = case when p_etapa = antes then responsable_id else null end,
         orden = coalesce(p_orden, orden),
         updated_at = now(),
         updated_by = yo
   where tarea_id = p_tarea;
  if p_etapa <> antes then
    insert into public.tarea_movimientos (tarea_id, tipo, de, a, nota, autor_id)
    values (p_tarea, 'etapa', antes, p_etapa, nullif(trim(p_nota), ''), yo);
  end if;
end;
$$;

-- Cambiar solo la prioridad (arrastrar dentro de la misma columna).
create or replace function public.tarea_ordenar(p_tarea bigint, p_orden double precision)
returns void language plpgsql security definer set search_path = '' as $$
declare
  yo uuid := public.flujo_chequear();
begin
  perform public.flujo_asegurar(p_tarea);
  update public.tarea_flujo set orden = p_orden, updated_at = now(), updated_by = yo where tarea_id = p_tarea;
end;
$$;

-- Tomarla, pasársela a alguien o devolverla al designado (p_persona null). Solo puede quedar con
-- alguien que trabaja en el sector de la etapa: una de Redacción la toma otro de Redacción, una de
-- Diseño cualquier diseñador. La dirección supervisa: no queda como responsable.
create or replace function public.tarea_asignar(p_tarea bigint, p_persona uuid, p_orden double precision default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  yo uuid := public.flujo_chequear();
  f public.tarea_flujo%rowtype;
  tablero text;
  sector text;
  de_nombre text;
  a_nombre text;
begin
  perform public.flujo_asegurar(p_tarea);
  select * into f from public.tarea_flujo where tarea_id = p_tarea for update;
  select tb.nombre into tablero
    from public.bc_tareas t
    left join public.bc_columnas c on c.id = t.columna_id
    left join public.bc_tableros tb on tb.id = c.tablero_id
   where t.id = p_tarea;
  sector := public.flujo_sector(f.etapa, tablero);

  if p_persona is not null then
    if sector is null then
      raise exception 'En esta etapa la tarea no se asigna a una persona';
    end if;
    if not exists (
      select 1 from public.equipo_puestos ep
      join public.puestos pu on pu.id = ep.puesto_id and pu.nivel <> 'direccion'
      join public.puesto_sectores ps on ps.puesto_id = ep.puesto_id
      where ep.persona_id = p_persona and ps.sector_id = sector
    ) then
      raise exception 'Esa persona no trabaja tareas de ese sector';
    end if;
  end if;

  select nombre into de_nombre from public.equipo where id = f.responsable_id;
  select nombre into a_nombre from public.equipo where id = p_persona;
  update public.tarea_flujo
     set responsable_id = p_persona, orden = coalesce(p_orden, orden), updated_at = now(), updated_by = yo
   where tarea_id = p_tarea;
  if f.responsable_id is distinct from p_persona then
    insert into public.tarea_movimientos (tarea_id, tipo, de, a, autor_id)
    values (p_tarea, 'responsable', coalesce(de_nombre, 'designado'), coalesce(a_nombre, 'designado'), yo);
  end if;
end;
$$;

create or replace function public.tarea_pausar(p_tarea bigint, p_pausada boolean, p_motivo text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  yo uuid := public.flujo_chequear();
begin
  perform public.flujo_asegurar(p_tarea);
  update public.tarea_flujo
     set pausada = p_pausada,
         pausa_motivo = case when p_pausada then nullif(trim(p_motivo), '') else null end,
         updated_at = now(),
         updated_by = yo
   where tarea_id = p_tarea;
  insert into public.tarea_movimientos (tarea_id, tipo, a, nota, autor_id)
  values (p_tarea, 'pausa', case when p_pausada then 'pausada' else 'reanudada' end, nullif(trim(p_motivo), ''), yo);
end;
$$;

-- La fecha de vigencia: a mano o calculada por la IA (que solo puede cambiar esto).
create or replace function public.tarea_vigencia(p_tarea bigint, p_fecha date, p_origen text default 'manual', p_nota text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  yo uuid := public.flujo_chequear();
  antes date;
begin
  if p_origen not in ('manual', 'ia') then
    raise exception 'Origen desconocido';
  end if;
  perform public.flujo_asegurar(p_tarea);
  select vigente_hasta into antes from public.tarea_flujo where tarea_id = p_tarea;
  update public.tarea_flujo
     set vigente_hasta = p_fecha,
         vigente_origen = case when p_fecha is null then null else p_origen end,
         updated_at = now(),
         updated_by = yo
   where tarea_id = p_tarea;
  insert into public.tarea_movimientos (tarea_id, tipo, de, a, nota, autor_id, origen)
  values (p_tarea, 'fecha', antes::text, p_fecha::text, nullif(trim(p_nota), ''), yo, case when p_origen = 'ia' then 'ia' else 'app' end);
end;
$$;

-- "Lo vi y está bien": queda en el historial; la tarea pasa a Cliente cuando alguien la mueve.
create or replace function public.tarea_validar(p_tarea bigint, p_nota text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  yo uuid := public.flujo_chequear();
begin
  if yo is null then
    raise exception 'Para validar tenés que estar en el equipo';
  end if;
  perform public.flujo_asegurar(p_tarea);
  insert into public.tarea_movimientos (tarea_id, tipo, a, nota, autor_id)
  values (p_tarea, 'validacion', 'ok', nullif(trim(p_nota), ''), yo);
end;
$$;

revoke execute on function public.flujo_reconciliar() from anon;
revoke execute on function public.tarea_mover(bigint, text, double precision, text) from anon;
revoke execute on function public.tarea_ordenar(bigint, double precision) from anon;
revoke execute on function public.tarea_asignar(bigint, uuid, double precision) from anon;
revoke execute on function public.tarea_pausar(bigint, boolean, text) from anon;
revoke execute on function public.tarea_vigencia(bigint, date, text, text) from anon;
revoke execute on function public.tarea_validar(bigint, text) from anon;

-- 5. Para leer de una ------------------------------------------------------
create or replace view public.board_flujo with (security_invoker = true) as
select b.*,
       f.etapa,
       f.responsable_id,
       f.orden,
       coalesce(f.pausada, b.estado = 'not_now', false) as pausada,
       f.pausa_motivo,
       f.vigente_hasta,
       f.vigente_origen,
       coalesce(f.vigente_hasta, b.vence) as vigencia
  from public.board_tareas b
  left join public.tarea_flujo f on f.tarea_id = b.id;

-- 6. Permisos: todo el estudio lee; se escribe solo con las funciones de arriba.
alter table public.tarea_flujo enable row level security;
alter table public.tarea_movimientos enable row level security;

drop policy if exists "el estudio lee" on public.tarea_flujo;
create policy "el estudio lee" on public.tarea_flujo for select to authenticated using ((select public.has_access()));
drop policy if exists "el estudio lee" on public.tarea_movimientos;
create policy "el estudio lee" on public.tarea_movimientos for select to authenticated using ((select public.has_access()));
