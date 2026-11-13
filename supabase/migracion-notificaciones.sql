-- ============================================================
-- Notificaciones de Basecamp (y del Board) con prioridad.
--
-- Basecamp avisa por webhook cada cosa que pasa en un proyecto (comentarios, cards, mensajes…).
-- Cada aviso se guarda una vez en bc_eventos, actualiza la copia de la card si es de un tablero y
-- se reparte SOLO a quien le importa, con el motivo:
--   mencion    → te nombraron (@vos)                                        (lo más importante)
--   asignacion → te asignaron la card en Basecamp, o te pasaron la tarea en el Board
--   tuya       → una tarea que tenés vos (asignada, tomada o sos el designado de esa etapa)
--   hilo       → una conversación en la que estás (la creaste, comentaste o te nombraron)
--   marca      → algo de una marca tuya, en tu sector (no aparece en "Para mí": solo en "Todo")
-- A quien no le corresponde nada de eso, no le llega nada: no hay notificaciones basura.
-- La app ordena después por motivo y por lo urgente de la tarea (vencida, vence hoy o mañana).
--
-- Basecamp no firma los avisos: la URL lleva una llave secreta. La app guarda acá solo su hash
-- (bc_sync.webhook_hash) y cada aviso se valida contra él, así que la función pública de abajo no
-- sirve sin la llave.
--
-- Correr DESPUÉS de migracion-integraciones, -board, -equipo y -flujo.
-- Supabase → SQL Editor → pegar todo → Run. Se puede correr más de una vez.
-- ============================================================

-- 1. Lo que hace falta en las tablas de Basecamp ----------------------
alter table public.bc_sync add column if not exists webhook_hash text;
-- El "sgid" con el que Basecamp nombra a una persona en un texto (para reconocer las menciones).
alter table public.bc_personas add column if not exists attachable_sgid text;

-- 2. Los webhooks registrados (uno por proyecto) -----------------------
create table if not exists public.bc_webhooks (
  proyecto_id bigint primary key references public.bc_proyectos(id) on delete cascade,
  webhook_id bigint not null,
  activo boolean not null default true,
  -- La última vez que la sincronización miró que siguiera activo (Basecamp lo apaga si falla 10 veces).
  revisado timestamptz not null default now(),
  ultimo_evento timestamptz
);

-- 3. Lo que pasó en Basecamp ------------------------------------------
create table if not exists public.bc_eventos (
  -- El id del evento en Basecamp: un reintento trae el mismo y no se procesa dos veces.
  id bigint primary key,
  kind text not null,
  proyecto_id bigint,
  recording_id bigint,
  recording_tipo text,
  -- La conversación: lo comentado (card, mensaje, to-do…) o el propio recording.
  hilo_id bigint,
  hilo_tipo text,
  hilo_titulo text,
  -- La card del Board, si la conversación es una card.
  tarea_id bigint,
  autor_bc_id bigint,
  autor_nombre text,
  -- Un extracto sin HTML.
  texto text,
  app_url text,
  detalles jsonb not null default '{}'::jsonb,
  creado timestamptz not null default now(),
  recibido timestamptz not null default now()
);
create index if not exists bc_eventos_hilo_idx on public.bc_eventos (hilo_id, creado desc);
create index if not exists bc_eventos_recording_idx on public.bc_eventos (recording_id);
create index if not exists bc_eventos_creado_idx on public.bc_eventos (creado desc);

-- 4. Las notificaciones de cada uno -------------------------------------
create table if not exists public.notificaciones (
  id bigint generated always as identity primary key,
  persona_id uuid not null references public.equipo(id) on delete cascade,
  -- null en lo que pasa en el Board (no viene de Basecamp).
  evento_id bigint references public.bc_eventos(id) on delete cascade,
  origen text not null default 'basecamp' check (origen in ('basecamp', 'app')),
  motivo text not null check (motivo in ('mencion', 'asignacion', 'tuya', 'hilo', 'marca')),
  hilo_id bigint,
  tarea_id bigint,
  proyecto_id bigint,
  -- Solo las del Board: quién lo hizo y qué decir.
  autor_id uuid references public.equipo(id) on delete set null,
  texto text,
  creada timestamptz not null default now(),
  leida timestamptz
);
create unique index if not exists notificaciones_una_por_evento on public.notificaciones (persona_id, evento_id) where evento_id is not null;
create index if not exists notificaciones_persona_idx on public.notificaciones (persona_id, creada desc);
create index if not exists notificaciones_no_leidas_idx on public.notificaciones (persona_id) where leida is null;

-- 5. Ayudas -------------------------------------------------------------

-- La etapa de una columna por su nombre (igual que etapaDeColumna en lib/integraciones/basecamp-sync.ts).
create or replace function public.bc_etapa_columna(p_nombre text, p_tipo text)
returns text language sql immutable set search_path = '' as $$
  select case
    when p_tipo = 'Kanban::Triage' then 'triage'
    when p_tipo = 'Kanban::DoneColumn' then 'done'
    when p_tipo = 'Kanban::NotNowColumn' then 'not_now'
    else (
      select case limpio
        when 'triage' then 'triage'
        when 'para hacer' then 'para_hacer'
        when 'asignada' then 'asignada'
        when 'en proceso' then 'en_proceso'
        when 'validacion interna' then 'validacion'
        when 'validacion' then 'validacion'
        when 'cliente' then 'cliente'
        when 'en cliente' then 'cliente'
        when 'implementacion' then 'implementacion'
        when 'implmentacion' then 'implementacion'
        when 'done' then 'done'
        when 'hecho' then 'done'
        when 'not now' then 'not_now'
        when 'stand by' then 'not_now'
        else null
      end
      from (
        select btrim(regexp_replace(regexp_replace(
                 lower(translate(coalesce(p_nombre, ''), 'ÁÀÄÂÉÈËÊÍÌÏÎÓÒÖÔÚÙÜÛÑáàäâéèëêíìïîóòöôúùüûñ', 'AAAAEEEEIIIIOOOOUUUUNaaaaeeeeiiiioooouuuun')),
                 '[^[:alnum:] ]', '', 'g'), '\s+', ' ', 'g')) as limpio
      ) x
    )
  end;
$$;

-- Las personas de Basecamp nombradas en un texto. Cada mención es un <bc-attachment sgid="…">; el
-- sgid es base64 de "gid://bc3/Person/<id>" más una firma ("--…"): se lee el id de ahí.
create or replace function public.bc_mencionados(p_html text)
returns bigint[] language plpgsql immutable set search_path = '' as $$
declare
  m text[];
  crudo text;
  plano text;
  ids bigint[] := '{}';
begin
  if p_html is null or position('sgid' in p_html) = 0 then
    return ids;
  end if;
  for m in select regexp_matches(p_html, 'sgid="([^"]+)"', 'g') loop
    crudo := split_part(m[1], '--', 1);
    begin
      plano := encode(decode(crudo, 'base64'), 'escape');
    exception when others then
      continue;
    end;
    ids := ids || coalesce(
      (select array_agg(x[1]::bigint) from regexp_matches(plano, 'gid://bc3/Person/([0-9]+)', 'g') x),
      '{}'
    );
  end loop;
  return ids;
end;
$$;

-- El texto de Basecamp (HTML) en una línea corta.
create or replace function public.bc_extracto(p_html text)
returns text language sql immutable set search_path = '' as $$
  select nullif(left(btrim(regexp_replace(
           replace(replace(replace(replace(replace(replace(
             regexp_replace(coalesce(p_html, ''), '<[^>]+>', ' ', 'g'),
             '&nbsp;', ' '), '&quot;', '"'), '&#39;', ''''), '&lt;', '<'), '&gt;', '>'), '&amp;', '&'),
           '\s+', ' ', 'g')), 240), '');
$$;

-- 6. Recibir un aviso de Basecamp ---------------------------------------
-- La llama /api/basecamp/webhook (sin sesión: Basecamp no tiene una). Valida la llave, guarda el
-- evento, actualiza la card y reparte las notificaciones. Devuelve 'ok', 'repetido' o 'ignorado'.
create or replace function public.bc_recibir_evento(p_llave text, p_evento jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_hash text;
  v_ev_id bigint;
  v_kind text := p_evento ->> 'kind';
  v_rec jsonb := coalesce(p_evento -> 'recording', '{}'::jsonb);
  v_det jsonb := coalesce(p_evento -> 'details', '{}'::jsonb);
  v_padre jsonb := v_rec -> 'parent';
  v_rec_id bigint;
  v_rec_tipo text := v_rec ->> 'type';
  v_proyecto bigint;
  v_autor bigint;
  v_creado timestamptz;
  v_contenido text := v_rec ->> 'content';
  v_hilo bigint;
  v_hilo_tipo text;
  v_hilo_titulo text;
  v_tarea bigint;
  v_marca uuid;
  v_agregados bigint[];
  v_sacados bigint[];
  v_mencionados bigint[];
  v_n integer;
begin
  select s.webhook_hash into v_hash from public.bc_sync s where s.id = 'basecamp';
  if v_hash is null or p_llave is null or encode(sha256(convert_to(p_llave, 'UTF8')), 'hex') <> v_hash then
    raise exception 'Llave de Basecamp inválida' using errcode = '28000';
  end if;

  begin
    v_ev_id := (p_evento ->> 'id')::bigint;
    v_rec_id := (v_rec ->> 'id')::bigint;
    v_proyecto := (v_rec -> 'bucket' ->> 'id')::bigint;
    v_autor := coalesce((p_evento -> 'creator' ->> 'id')::bigint, (v_rec -> 'creator' ->> 'id')::bigint);
    v_creado := coalesce((p_evento ->> 'created_at')::timestamptz, now());
  exception when others then
    return 'ignorado';
  end;
  if v_ev_id is null or v_kind is null or v_rec_id is null or v_proyecto is null then
    return 'ignorado';
  end if;

  -- La conversación: un comentario (o un paso de una card) es parte de lo que comenta.
  if v_rec_tipo in ('Comment', 'Kanban::Step') and v_padre is not null then
    v_hilo := (v_padre ->> 'id')::bigint;
    v_hilo_tipo := v_padre ->> 'type';
    v_hilo_titulo := v_padre ->> 'title';
  else
    v_hilo := v_rec_id;
    v_hilo_tipo := v_rec_tipo;
    v_hilo_titulo := v_rec ->> 'title';
  end if;
  if v_hilo_tipo = 'Kanban::Card' then
    v_tarea := v_hilo;
  end if;

  insert into public.bc_eventos (id, kind, proyecto_id, recording_id, recording_tipo, hilo_id, hilo_tipo, hilo_titulo, tarea_id,
                                 autor_bc_id, autor_nombre, texto, app_url, detalles, creado)
  values (v_ev_id, v_kind, v_proyecto, v_rec_id, v_rec_tipo, v_hilo, v_hilo_tipo, v_hilo_titulo, v_tarea,
          v_autor, coalesce(p_evento -> 'creator' ->> 'name', v_rec -> 'creator' ->> 'name'),
          public.bc_extracto(v_contenido), v_rec ->> 'app_url', v_det, v_creado)
  on conflict (id) do nothing;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    return 'repetido';
  end if;

  -- Un proyecto nuevo: un registro mínimo (la próxima sincronización lo completa y le busca cliente).
  insert into public.bc_proyectos (id, nombre)
  values (v_proyecto, coalesce(nullif(btrim(v_rec -> 'bucket' ->> 'name'), ''), 'Proyecto ' || v_proyecto))
  on conflict (id) do nothing;
  update public.bc_webhooks set ultimo_evento = now() where proyecto_id = v_proyecto;

  -- La copia de la card, al día sin esperar a la sincronización.
  if v_rec_tipo = 'Kanban::Card' then
    if v_kind ~ '_(trashed|archived|deleted)$' then
      delete from public.bc_tareas where id = v_rec_id;
    else
      if v_padre is not null and (v_padre ->> 'id') is not null then
        insert into public.bc_columnas (id, proyecto_id, nombre, estado)
        values ((v_padre ->> 'id')::bigint, v_proyecto, coalesce(v_padre ->> 'title', ''), public.bc_etapa_columna(v_padre ->> 'title', v_padre ->> 'type'))
        on conflict (id) do update set nombre = excluded.nombre, estado = excluded.estado;
      end if;
      insert into public.bc_tareas (id, proyecto_id, columna_id, titulo, contenido, app_url, creador_id, creada, actualizada, sincronizada)
      values (v_rec_id, v_proyecto, (v_padre ->> 'id')::bigint, coalesce(v_rec ->> 'title', ''), v_contenido, v_rec ->> 'app_url',
              (v_rec -> 'creator' ->> 'id')::bigint, (v_rec ->> 'created_at')::timestamptz, coalesce((v_rec ->> 'updated_at')::timestamptz, v_creado), now())
      on conflict (id) do update
        set columna_id = coalesce(excluded.columna_id, public.bc_tareas.columna_id),
            titulo = excluded.titulo,
            contenido = coalesce(excluded.contenido, public.bc_tareas.contenido),
            app_url = coalesce(excluded.app_url, public.bc_tareas.app_url),
            actualizada = excluded.actualizada,
            sincronizada = now()
        -- Un aviso viejo (un reintento que llega tarde) no pisa uno más nuevo.
        where public.bc_tareas.actualizada is null or excluded.actualizada >= public.bc_tareas.actualizada;
      if v_kind ~ '_completed$' then
        update public.bc_tareas set completada = true where id = v_rec_id;
      elsif v_kind ~ '_uncompleted$' then
        update public.bc_tareas set completada = false where id = v_rec_id;
      end if;
    end if;
  end if;

  if v_kind ~ '_assignment_changed$' then
    select coalesce(array_agg(x::bigint), '{}') into v_agregados from jsonb_array_elements_text(coalesce(v_det -> 'added_person_ids', '[]'::jsonb)) x;
    select coalesce(array_agg(x::bigint), '{}') into v_sacados from jsonb_array_elements_text(coalesce(v_det -> 'removed_person_ids', '[]'::jsonb)) x;
    if v_rec_tipo = 'Kanban::Card' then
      update public.bc_tareas t
         set asignados = (select coalesce(array_agg(distinct a), '{}') from unnest(t.asignados || v_agregados) a where not (a = any(v_sacados)))
       where t.id = v_rec_id;
    end if;
  else
    v_agregados := '{}';
  end if;

  if v_kind = 'comment_created' and v_tarea is not null then
    update public.bc_tareas set comentarios = comentarios + 1 where id = v_tarea;
  end if;

  -- Lo que se borra o se archiva no avisa nada; las ediciones solo si nombran a alguien nuevo.
  if v_kind ~ '_(trashed|archived|deleted|untrashed|unarchived|copied|inserted|publicized|subscribers_changed|title_updated|paused|resumed)$' then
    return 'ok';
  end if;

  if v_kind ~ '_(created|content_updated)$' then
    v_mencionados := public.bc_mencionados(v_contenido);
  else
    v_mencionados := '{}';
  end if;
  select p.brand_id into v_marca from public.bc_proyectos p where p.id = v_proyecto;

  with
  t as (
    select t.id, t.asignados, t.creador_id, t.columna_id, c.estado, c.nombre as columna, tb.nombre as tablero,
           f.etapa, f.responsable_id, f.bc_columna_id, t.completada
      from public.bc_tareas t
      left join public.bc_columnas c on c.id = t.columna_id
      left join public.bc_tableros tb on tb.id = c.tablero_id
      left join public.tarea_flujo f on f.tarea_id = t.id
     where t.id = v_tarea
  ),
  -- La etapa de la card ahora: si la movieron en Basecamp desde la última vez, la nueva (como
  -- flujo_reconciliar); y si cambió, ya no la tiene quien la tenía.
  ahora as (
    select t.*,
           coalesce(public.flujo_etapa_bc(t.estado, t.columna, t.tablero, t.completada), t.etapa, 'entrada') as etapa_ahora,
           case when t.bc_columna_id is distinct from t.columna_id then null else t.responsable_id end as responsable_ahora
      from t
  ),
  -- Quién tiene la tarea: asignada en Basecamp, tomada en el Board o el designado de la marca para la
  -- etapa (en Entrada, el del primer sector del tablero; si no tiene nadie asignado).
  duenos as (
    select e.id as persona_id
      from ahora a
      join public.equipo e on e.bc_persona_id = any(a.asignados)
    union
    select a.responsable_ahora from ahora a where a.responsable_ahora is not null
    union
    select me.persona_id
      from ahora a
      join public.marca_equipo me on me.brand_id = v_marca and me.principal
     where a.responsable_ahora is null
       and me.sector_id = coalesce(
             public.flujo_sector(a.etapa_ahora, a.tablero),
             case when a.etapa_ahora = 'entrada' and cardinality(a.asignados) = 0 then
               case when a.tablero = 'Digital' then 'redaccion'
                    else (select s.id from public.sectores s where s.tablero = a.tablero order by s.orden limit 1) end
             end)
  ),
  -- Quién está en la conversación: la creó, comentó o la nombraron antes.
  en_hilo as (
    select e.id as persona_id
      from public.equipo e
     where e.bc_persona_id in (
             select a.creador_id from ahora a
             union
             select ev.autor_bc_id from public.bc_eventos ev
              where ev.hilo_id = v_hilo and ev.id <> v_ev_id and ev.autor_bc_id is not null
                and (ev.kind = 'comment_created' or (ev.recording_id = v_hilo and ev.kind ~ '_created$'))
           )
    union
    select n.persona_id from public.notificaciones n where n.hilo_id = v_hilo and n.motivo = 'mencion'
  ),
  cand(persona_id, motivo, rango) as (
    -- Te nombraron (en una edición, solo si no te habían nombrado ya en ese texto).
    select e.id, 'mencion', 5
      from public.equipo e
      left join public.bc_personas bp on bp.id = e.bc_persona_id
     where (e.bc_persona_id = any(v_mencionados)
            or (bp.attachable_sgid is not null and v_contenido is not null and position(bp.attachable_sgid in v_contenido) > 0))
       and (v_kind !~ '_content_updated$' or not exists (
             select 1 from public.notificaciones n join public.bc_eventos ev on ev.id = n.evento_id
              where n.persona_id = e.id and n.motivo = 'mencion' and ev.recording_id = v_rec_id))
    union all
    -- Te asignaron.
    select e.id, 'asignacion', 4 from public.equipo e where e.bc_persona_id = any(v_agregados)
    union all
    -- Algo en una tarea tuya: un comentario, se movió o se terminó (no cada edición del brief).
    select d.persona_id, 'tuya', 3
      from duenos d
     where v_kind = 'comment_created' or v_kind ~ '(moved|_completed|_uncompleted|kanban_card_created)'
    union all
    -- Un comentario en una conversación tuya.
    select h.persona_id, 'hilo', 2 from en_hilo h where v_kind = 'comment_created'
    union all
    -- Algo nuevo en una marca tuya: si es de un tablero, solo a los de ese sector (y a Cuentas, que
    -- sigue todos); si no (mensajes, to-dos), a todos los designados de la marca.
    select me.persona_id, 'marca', 1
      from public.marca_equipo me
     where me.brand_id = v_marca
       and v_kind ~ '_created$' and v_kind <> 'kanban_step_created'
       and (
         v_tarea is null
         or me.sector_id = 'cuentas'
         or me.sector_id in (select s.id from public.sectores s join ahora a on s.tablero = a.tablero)
       )
  )
  insert into public.notificaciones (persona_id, evento_id, origen, motivo, hilo_id, tarea_id, proyecto_id, creada)
  select distinct on (c.persona_id) c.persona_id, v_ev_id, 'basecamp', c.motivo, v_hilo, v_tarea, v_proyecto, v_creado
    from cand c
    join public.equipo e on e.id = c.persona_id
   where c.persona_id is not null
     and e.activo
     -- Lo que hiciste vos no te avisa.
     and e.bc_persona_id is distinct from v_autor
   order by c.persona_id, c.rango desc
  on conflict do nothing;

  -- De vez en cuando, lo viejo se va (las notificaciones a los 45 días, los eventos a los 90).
  if random() < 0.02 then
    delete from public.notificaciones where creada < now() - interval '45 days';
    delete from public.bc_eventos where creado < now() - interval '90 days';
  end if;

  return 'ok';
end;
$$;

revoke execute on function public.bc_recibir_evento(text, jsonb) from public;
grant execute on function public.bc_recibir_evento(text, jsonb) to anon, authenticated;

-- 7. Lo que pasa en el Board: "te pasaron una tarea" -----------------------
create or replace function public.notificar_movimiento()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  quien uuid;
begin
  if new.tipo <> 'responsable' or new.origen <> 'app' then
    return new;
  end if;
  select f.responsable_id into quien from public.tarea_flujo f where f.tarea_id = new.tarea_id;
  -- Nadie (volvió al designado) o la tomó uno mismo: no hay a quién avisar.
  if quien is null or quien is not distinct from new.autor_id then
    return new;
  end if;
  insert into public.notificaciones (persona_id, origen, motivo, hilo_id, tarea_id, proyecto_id, autor_id, texto, creada)
  select quien, 'app', 'asignacion', t.id, t.id, t.proyecto_id, new.autor_id,
         case when a.nombre is null then 'Te la pasaron en el Board' else a.nombre || ' te la pasó en el Board' end,
         new.creado
    from public.bc_tareas t
    left join public.equipo a on a.id = new.autor_id
   where t.id = new.tarea_id;
  return new;
exception when others then
  -- Una notificación que no se pudo crear nunca frena el cambio de la tarea.
  return new;
end;
$$;

drop trigger if exists notificar_movimiento on public.tarea_movimientos;
create trigger notificar_movimiento after insert on public.tarea_movimientos
  for each row execute function public.notificar_movimiento();

-- 8. Para leer ----------------------------------------------------------------
-- Las notificaciones de quien pide, con lo que hace falta para mostrarlas y para saber qué tan
-- urgente es la tarea (vence, etapa, pausa). security_invoker: se lee con sus permisos.
create or replace view public.mis_notificaciones with (security_invoker = true) as
select n.id, n.origen, n.motivo, n.hilo_id, n.tarea_id, n.proyecto_id, n.creada, n.leida,
       ev.kind,
       coalesce(ev.hilo_titulo, f.titulo) as titulo,
       coalesce(ev.texto, n.texto) as texto,
       coalesce(ev.autor_nombre, a.nombre) as autor,
       pa.avatar_url as autor_avatar,
       coalesce(ev.app_url, f.app_url) as app_url,
       p.nombre as proyecto,
       b.id as brand_id, b.name as brand_name, b.color as brand_color, b.logo_url as brand_logo_url,
       b.logo_bg as brand_logo_bg, b.logo_from as brand_logo_from,
       f.vence, f.vigencia, f.completada, f.etapa, f.estado, f.columna, f.tablero, f.pausada
  from public.notificaciones n
  left join public.bc_eventos ev on ev.id = n.evento_id
  left join public.board_flujo f on f.id = n.tarea_id
  left join public.bc_proyectos p on p.id = n.proyecto_id
  left join public.brands b on b.id = p.brand_id
  left join public.equipo a on a.id = n.autor_id
  left join public.bc_personas pa on pa.id = ev.autor_bc_id
 where n.persona_id = (select public.mi_equipo_id());

-- 9. Permisos -------------------------------------------------------------------
alter table public.bc_webhooks enable row level security;
alter table public.bc_eventos enable row level security;
alter table public.notificaciones enable row level security;

drop policy if exists "solo el estudio" on public.bc_webhooks;
create policy "solo el estudio" on public.bc_webhooks for all to authenticated
  using ((select public.has_access())) with check ((select public.has_access()));

-- Los eventos se escriben solo con bc_recibir_evento; el estudio los puede leer.
drop policy if exists "el estudio lee" on public.bc_eventos;
create policy "el estudio lee" on public.bc_eventos for select to authenticated using ((select public.has_access()));

-- Cada uno ve y marca como leídas las suyas (las crean solo las funciones de arriba).
drop policy if exists "cada uno las suyas" on public.notificaciones;
create policy "cada uno las suyas" on public.notificaciones for select to authenticated
  using (persona_id = (select public.mi_equipo_id()));
drop policy if exists "cada uno marca las suyas" on public.notificaciones;
create policy "cada uno marca las suyas" on public.notificaciones for update to authenticated
  using (persona_id = (select public.mi_equipo_id()))
  with check (persona_id = (select public.mi_equipo_id()));
