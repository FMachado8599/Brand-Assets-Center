-- ============================================================
-- Feature | Slack (en el historial de migraciones: feature_slack)
-- El bot de Slack del estudio: una sola conexión para todos (la hace un admin desde Board → Slack),
-- con el token cifrado en integraciones como Basecamp y el Drive.
--   - slack_personas: quién es quién en Slack, cruzado por el mail (lo arma la app al conectar).
--   - slack_prefs: qué le llega a cada uno por privado (lo elige cada uno en su Perfil).
--   - slack_canales: el canal de cada marca (se crea o se vincula desde Board → Slack).
--   - slack_cola: los avisos que esperan salir (las menciones y asignaciones de quien las pidió, lo
--     que comenta o aprueba el cliente en la presentación compartida). La llenan triggers de la base
--     y la vacía el servidor de la app.
--   - slack_envios: lo del día que ya salió (los cumpleaños, el resumen), para no mandarlo dos veces.
-- Lo que corre sin sesión (la tarea de cada mañana, los avisos de Basecamp, la página del cliente) se
-- identifica con la llave del servidor (servidor_llaves, uso 'slack'): sale de INTEGRACIONES_SECRET y
-- en la base queda solo su hash.
-- Correr DESPUÉS de migracion-integraciones, -notificaciones, -presentaciones-cliente,
-- -presentaciones-board, -perfil y migracion-cumpleanos.sql.
-- Supabase → SQL Editor → pegar todo → Run. Se puede correr más de una vez: no mueve datos.
-- ============================================================

do $$
begin
  if to_regclass('public.integraciones') is null or to_regclass('public.notificaciones') is null
     or to_regclass('public.servidor_llaves') is null or to_regclass('public.presentacion_comentarios') is null
     or to_regprocedure('public.companeros_de(uuid)') is null then
    raise exception 'Faltan migraciones anteriores (integraciones, notificaciones, presentaciones-cliente y cumpleanos). Corrélas y volvé a correr esto.';
  end if;
end $$;

-- 1. Slack entra a las conexiones y a las llaves del servidor ------------
alter table public.integraciones drop constraint if exists integraciones_proveedor;
alter table public.integraciones add constraint integraciones_proveedor
  check (proveedor in ('basecamp', 'google', 'influencity', 'slack'));

alter table public.servidor_llaves drop constraint if exists servidor_llaves_uso;
alter table public.servidor_llaves add constraint servidor_llaves_uso check (uso in ('drive', 'slack'));

-- La llave que trae el servidor es la suya. Solo la usan las funciones de acá abajo.
create or replace function public.servidor_llave_ok(p_uso text, p_llave text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.servidor_llaves k
     where k.uso = p_uso and k.hash = encode(sha256(convert_to(coalesce(p_llave, ''), 'UTF8')), 'hex')
  );
$$;
revoke execute on function public.servidor_llave_ok(text, text) from public, anon, authenticated;

-- 2. Quién es quién en Slack ------------------------------------------
create table if not exists public.slack_personas (
  persona_id uuid primary key references public.equipo(id) on delete cascade,
  slack_id text not null unique,
  slack_nombre text,
  vinculado timestamptz not null default now(),
  constraint slack_personas_id check (slack_id ~ '^[UW][A-Z0-9]{2,30}$')
);

-- 3. Lo que le llega a cada uno por privado --------------------------------
-- Sin fila: lo de siempre (los cumpleaños de sus compañeros sí; menciones y resumen, no).
create table if not exists public.slack_prefs (
  persona_id uuid primary key references public.equipo(id) on delete cascade,
  -- Te nombraron o te asignaron algo (en Basecamp o en la app): al instante.
  menciones boolean not null default false,
  -- A la mañana: lo tuyo que vence hoy o mañana, y lo vencido.
  resumen boolean not null default false,
  -- Hoy cumple alguien con quien trabajás.
  cumples boolean not null default true,
  updated_at timestamptz not null default now()
);

-- 4. El canal de cada marca ---------------------------------------------
create table if not exists public.slack_canales (
  brand_id uuid primary key references public.brands(id) on delete cascade,
  canal_id text not null,
  canal_nombre text not null,
  -- Avisar en el canal lo que hace el cliente en la presentación compartida.
  avisos boolean not null default true,
  creado_por text,
  updated_at timestamptz not null default now(),
  constraint slack_canales_id check (canal_id ~ '^[CG][A-Z0-9]{2,30}$')
);

-- 5. La cola de avisos ------------------------------------------------------
create table if not exists public.slack_cola (
  id bigint generated always as identity primary key,
  -- notificacion: por privado a persona_id · cliente: al canal de brand_id.
  tipo text not null check (tipo in ('notificacion', 'cliente')),
  persona_id uuid references public.equipo(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete cascade,
  datos jsonb not null default '{}'::jsonb,
  creado timestamptz not null default now(),
  -- Lo tomó el servidor para mandarlo (si no termina en 5 minutos, se vuelve a intentar).
  tomado timestamptz,
  intentos int not null default 0,
  enviado timestamptz,
  error text
);
create index if not exists slack_cola_pendientes_idx on public.slack_cola (creado) where enviado is null;

-- 6. Lo del día que ya salió --------------------------------------------------
create table if not exists public.slack_envios (
  clave text primary key,
  enviado timestamptz not null default now()
);

-- 7. Permisos -----------------------------------------------------------------
alter table public.slack_personas enable row level security;
alter table public.slack_prefs enable row level security;
alter table public.slack_canales enable row level security;
alter table public.slack_cola enable row level security;
alter table public.slack_envios enable row level security;

-- Personas y canales: el estudio lee (para saber a quién avisar y dónde); los configura un admin.
do $$
declare t text;
begin
  foreach t in array array['slack_personas', 'slack_canales']
  loop
    execute format('drop policy if exists "el estudio lee" on public.%I', t);
    execute format('create policy "el estudio lee" on public.%I for select to authenticated using ((select public.has_access()))', t);
    execute format('drop policy if exists "admins editan" on public.%I', t);
    execute format(
      'create policy "admins editan" on public.%I for all to authenticated using ((select public.es_admin())) with check ((select public.es_admin()))',
      t
    );
  end loop;
end $$;

-- Las preferencias: cada uno las suyas.
drop policy if exists "cada uno las suyas" on public.slack_prefs;
create policy "cada uno las suyas" on public.slack_prefs for all to authenticated
  using (persona_id = (select public.mi_equipo_id()))
  with check (persona_id = (select public.mi_equipo_id()));

-- La cola y los envíos no tienen políticas: solo los tocan las funciones de acá abajo.

-- 8. La gente de una marca ------------------------------------------------------
-- Los designados de la marca (todos los sectores), la gente del hub que la tiene y sus directores.
-- Solo los activos. Es a quienes se invita al canal y a quienes llega "Avisar al equipo".
create or replace function public.marca_gente(p_brand uuid)
returns table (persona_id uuid, nombre text, email text, slack_id text)
language sql stable security definer set search_path = '' as $$
  select e.id, coalesce(nullif(btrim(pr.nombre_visible), ''), e.nombre), e.email, sp.slack_id
    from (
      select me.persona_id from public.marca_equipo me where me.brand_id = p_brand
      union
      select e.id from public.equipo e join public.hub_marcas hm on hm.hub_id = e.hub_id where hm.brand_id = p_brand
      union
      select hl.persona_id from public.hub_lideres hl join public.hub_marcas hm on hm.hub_id = hl.hub_id where hm.brand_id = p_brand
    ) g(id)
    join public.equipo e on e.id = g.id
    left join public.slack_personas sp on sp.persona_id = e.id
    left join lateral (select x.nombre_visible from public.profiles x where lower(x.email) = e.email limit 1) pr on true
   where e.activo and public.has_access()
   order by 2;
$$;
revoke execute on function public.marca_gente(uuid) from public, anon;
grant execute on function public.marca_gente(uuid) to authenticated;

-- 9. Lo que llena la cola ----------------------------------------------------------
-- Una mención o una asignación nueva, para quien pidió recibirlas por Slack y está vinculado.
create or replace function public.slack_encolar_notificacion()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  begin
    if new.motivo in ('mencion', 'asignacion')
       and exists (select 1 from public.slack_prefs p where p.persona_id = new.persona_id and p.menciones)
       and exists (select 1 from public.slack_personas s where s.persona_id = new.persona_id)
       and exists (select 1 from public.integraciones i where i.proveedor = 'slack') then
      insert into public.slack_cola (tipo, persona_id, datos) values ('notificacion', new.persona_id, jsonb_build_object('notificacion_id', new.id));
    end if;
  exception when others then
    null; -- Un aviso de Slack nunca frena la notificación.
  end;
  return null;
end;
$$;
revoke execute on function public.slack_encolar_notificacion() from public, anon, authenticated;

drop trigger if exists slack_encolar_notificacion on public.notificaciones;
create trigger slack_encolar_notificacion after insert on public.notificaciones
  for each row execute function public.slack_encolar_notificacion();

-- Lo que comenta el cliente en la presentación compartida (sin sesión del estudio), si la marca
-- tiene canal con avisos.
create or replace function public.slack_encolar_comentario_cliente()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_brand uuid;
begin
  begin
    if new.autor_equipo_id is null then
      select pr.brand_id into v_brand from public.presentaciones pr where pr.id = new.presentacion_id;
      if exists (select 1 from public.slack_canales c where c.brand_id = v_brand and c.avisos) then
        insert into public.slack_cola (tipo, brand_id, datos)
        values ('cliente', v_brand, jsonb_build_object(
          'evento', 'comentario', 'presentacion_id', new.presentacion_id, 'pieza_id', new.pieza_id,
          'autor', left(coalesce(nullif(btrim(new.autor_nombre), ''), 'El cliente'), 80), 'texto', left(new.texto, 500)
        ));
      end if;
    end if;
  exception when others then
    null;
  end;
  return null;
end;
$$;
revoke execute on function public.slack_encolar_comentario_cliente() from public, anon, authenticated;

drop trigger if exists slack_encolar_comentario_cliente on public.presentacion_comentarios;
create trigger slack_encolar_comentario_cliente after insert on public.presentacion_comentarios
  for each row execute function public.slack_encolar_comentario_cliente();

-- Cuando el cliente aprueba o pide cambios en una pieza (desde el link, sin sesión).
create or replace function public.slack_encolar_estado_cliente()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_brand uuid;
begin
  begin
    if auth.uid() is null and new.estado_cliente is distinct from old.estado_cliente and new.estado_cliente in ('aprobada', 'cambios') then
      select pr.brand_id into v_brand from public.presentaciones pr where pr.id = new.presentacion_id;
      if exists (select 1 from public.slack_canales c where c.brand_id = v_brand and c.avisos) then
        insert into public.slack_cola (tipo, brand_id, datos)
        values ('cliente', v_brand, jsonb_build_object(
          'evento', new.estado_cliente, 'presentacion_id', new.presentacion_id, 'pieza_id', new.id, 'fecha', new.fecha
        ));
      end if;
    end if;
  exception when others then
    null;
  end;
  return null;
end;
$$;
revoke execute on function public.slack_encolar_estado_cliente() from public, anon, authenticated;

drop trigger if exists slack_encolar_estado_cliente on public.presentacion_piezas;
create trigger slack_encolar_estado_cliente after update of estado_cliente on public.presentacion_piezas
  for each row execute function public.slack_encolar_estado_cliente();

-- 10. Lo que usa el servidor de la app (con su llave) ------------------------------------

-- La conexión con Slack (el token, cifrado: lo descifra el servidor).
create or replace function public.slack_conexion_servidor(p_llave text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('cuenta_id', i.cuenta_id, 'cuenta_nombre', i.cuenta_nombre, 'access_token', i.access_token, 'datos', i.datos)
    from public.integraciones i
   where i.proveedor = 'slack' and public.servidor_llave_ok('slack', p_llave);
$$;

-- Toma hasta p_limite avisos de la cola (los que nadie está mandando) y los devuelve con todo lo que
-- hace falta para escribirlos. Dos servidores a la vez nunca toman el mismo. Lo que ya no tiene a quién
-- mandarse (se desvinculó la persona o el canal) se da por terminado.
create or replace function public.slack_cola_tomar(p_llave text, p_limite int default 40)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_ids bigint[];
  v_out jsonb;
begin
  if not public.servidor_llave_ok('slack', p_llave) then
    raise exception 'Llave del servidor inválida' using errcode = '42501';
  end if;

  -- Limpieza: lo de hace más de una semana, enviado o no.
  delete from public.slack_cola where creado < now() - interval '7 days';

  with libres as (
    select c.id from public.slack_cola c
     where c.enviado is null and c.intentos < 3 and c.creado > now() - interval '1 day'
       and (c.tomado is null or c.tomado < now() - interval '5 minutes')
     order by c.id
     limit greatest(1, least(coalesce(p_limite, 40), 200))
     for update skip locked
  ), tomados as (
    update public.slack_cola c set tomado = now(), intentos = c.intentos + 1
      from libres where c.id = libres.id
    returning c.id
  )
  select coalesce(array_agg(id), '{}') into v_ids from tomados;

  if cardinality(v_ids) = 0 then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(x order by (x ->> 'id')::bigint), '[]'::jsonb) into v_out
    from (
      -- Notificaciones: a quién, qué y adónde lleva.
      select jsonb_build_object(
        'id', c.id, 'tipo', c.tipo, 'slack_id', sp.slack_id,
        'motivo', n.motivo,
        'titulo', coalesce(n.titulo, ev.hilo_titulo, t.titulo),
        'texto', coalesce(ev.texto, n.texto),
        'autor', coalesce(ev.autor_nombre, a.nombre),
        'app_url', coalesce(ev.app_url, t.app_url),
        'enlace', n.enlace,
        'tarea_id', n.tarea_id,
        'marca', b.name
      ) as x
        from public.slack_cola c
        join public.notificaciones n on n.id = (c.datos ->> 'notificacion_id')::bigint
        join public.slack_personas sp on sp.persona_id = c.persona_id
        left join public.bc_eventos ev on ev.id = n.evento_id
        left join public.bc_tareas t on t.id = n.tarea_id
        left join public.bc_proyectos p on p.id = n.proyecto_id
        left join public.brands b on b.id = coalesce(p.brand_id, n.brand_id)
        left join public.equipo a on a.id = n.autor_id
       where c.id = any(v_ids) and c.tipo = 'notificacion'
      union all
      -- Lo del cliente: el canal de la marca y la presentación.
      select jsonb_build_object(
        'id', c.id, 'tipo', c.tipo, 'canal_id', sc.canal_id, 'marca', b.name,
        'evento', c.datos ->> 'evento', 'autor', c.datos ->> 'autor', 'texto', c.datos ->> 'texto',
        'presentacion_id', pr.id, 'pieza_id', c.datos ->> 'pieza_id', 'fecha', c.datos ->> 'fecha',
        'titulo', concat_ws(' · ', coalesce(nullif(btrim(pr.titulo), ''), tp.nombre, 'Presentación'),
                   (array['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'])[pr.mes])
      )
        from public.slack_cola c
        join public.slack_canales sc on sc.brand_id = c.brand_id
        join public.brands b on b.id = c.brand_id
        join public.presentaciones pr on pr.id = (c.datos ->> 'presentacion_id')::uuid
        left join public.presentacion_tipos tp on tp.id = pr.tipo
       where c.id = any(v_ids) and c.tipo = 'cliente'
    ) s;

  update public.slack_cola c set enviado = now(), error = 'sin destino'
   where c.id = any(v_ids)
     and not exists (select 1 from jsonb_array_elements(v_out) e where (e ->> 'id')::bigint = c.id);

  return v_out;
end;
$$;

-- Lo que salió bien queda enviado; lo que falló guarda el error (se reintenta hasta 3 veces).
create or replace function public.slack_cola_terminar(p_llave text, p_ok bigint[], p_errores jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.servidor_llave_ok('slack', p_llave) then
    raise exception 'Llave del servidor inválida' using errcode = '42501';
  end if;
  update public.slack_cola set enviado = now(), error = null where id = any(coalesce(p_ok, '{}'));
  update public.slack_cola c set error = left(e.value #>> '{}', 500), tomado = null
    from jsonb_each(coalesce(p_errores, '{}'::jsonb)) e
   where c.id = e.key::bigint;
end;
$$;

-- Marca como enviadas las claves del día (ej: 'cumple:2026-11-26:<persona>:<a quién>') y devuelve las
-- que eran nuevas: solo esas se mandan, así repetir la tarea del día no duplica nada.
create or replace function public.slack_marcar(p_llave text, p_claves text[])
returns text[] language plpgsql security definer set search_path = '' as $$
declare v text[];
begin
  if not public.servidor_llave_ok('slack', p_llave) then
    raise exception 'Llave del servidor inválida' using errcode = '42501';
  end if;
  delete from public.slack_envios where enviado < now() - interval '45 days';
  with nuevas as (
    insert into public.slack_envios (clave)
    select distinct k from unnest(coalesce(p_claves, '{}')) k where k is not null and k <> ''
    on conflict do nothing
    returning clave
  )
  select coalesce(array_agg(clave), '{}') into v from nuevas;
  return v;
end;
$$;

-- Si algo no salió, la clave se libera para que la próxima vez se intente de nuevo.
create or replace function public.slack_desmarcar(p_llave text, p_claves text[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.servidor_llave_ok('slack', p_llave) then
    raise exception 'Llave del servidor inválida' using errcode = '42501';
  end if;
  delete from public.slack_envios where clave = any(coalesce(p_claves, '{}'));
end;
$$;

-- La gente activa con su nombre para mostrar, su foto, su usuario de Slack y hasta cuándo está fuera
-- de oficina. Solo para las funciones de acá.
create or replace function public.slack_gente()
returns table (id uuid, nombre text, email text, slack_id text, bc_id bigint, foto text, fuera date, cumple_dia smallint, cumple_mes smallint)
language sql stable security definer set search_path = '' as $$
  select e.id, coalesce(nullif(btrim(pr.nombre_visible), ''), e.nombre), e.email, sp.slack_id, e.bc_persona_id,
         case when pr.foto_origen = 'subida' then pr.foto_url
              when pr.foto_origen = 'basecamp' then coalesce(bp.avatar_url, pr.foto_url)
              else coalesce(pr.avatar_url, bp.avatar_url) end,
         pr.fuera_hasta, e.cumple_dia, e.cumple_mes
    from public.equipo e
    left join public.slack_personas sp on sp.persona_id = e.id
    left join lateral (select * from public.profiles x where lower(x.email) = e.email order by x.updated_at desc limit 1) pr on true
    left join public.bc_personas bp on bp.id = e.bc_persona_id
   where e.activo;
$$;
revoke execute on function public.slack_gente() from public, anon, authenticated;

-- Todo lo del día para la tarea de la mañana: quién cumple (y a quién avisarle), quién está fuera de
-- oficina y el resumen de cada uno que lo pidió.
create or replace function public.slack_dia_servidor(p_llave text, p_fecha date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_cumples jsonb;
  v_fuera jsonb;
  v_resumen jsonb;
begin
  if not public.servidor_llave_ok('slack', p_llave) then
    raise exception 'Llave del servidor inválida' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'persona_id', g.id, 'nombre', g.nombre, 'slack_id', g.slack_id, 'foto', g.foto,
           'companeros', coalesce((
             select jsonb_agg(jsonb_build_object('persona_id', o.id, 'nombre', o.nombre, 'slack_id', o.slack_id))
               from public.companeros_de(g.id) c
               join public.slack_gente() o on o.id = c.persona_id
               left join public.slack_prefs p on p.persona_id = o.id
              where o.slack_id is not null and coalesce(p.cumples, true)
           ), '[]'::jsonb)
         ) order by g.nombre), '[]'::jsonb)
    into v_cumples
    from public.slack_gente() g
   where public.cumple_en(g.cumple_dia, g.cumple_mes, extract(year from p_fecha)::int) = p_fecha;

  select coalesce(jsonb_agg(jsonb_build_object('persona_id', g.id, 'nombre', g.nombre, 'slack_id', g.slack_id, 'hasta', g.fuera) order by g.fuera, g.nombre), '[]'::jsonb)
    into v_fuera
    from public.slack_gente() g
   where g.fuera >= p_fecha;

  select coalesce(jsonb_agg(jsonb_build_object('persona_id', g.id, 'nombre', g.nombre, 'slack_id', g.slack_id, 'tareas', coalesce(t.tareas, '[]'::jsonb)) order by g.nombre), '[]'::jsonb)
    into v_resumen
    from public.slack_gente() g
    join public.slack_prefs p on p.persona_id = g.id and p.resumen
    cross join lateral (
      select jsonb_agg(jsonb_build_object(
               'id', f.id, 'titulo', f.titulo, 'marca', b.name, 'proyecto', f.proyecto,
               'fecha', coalesce(f.entrega, f.vence), 'app_url', f.app_url, 'etapa', f.etapa
             ) order by coalesce(f.entrega, f.vence), f.titulo) as tareas
        from (
          select f.* from public.board_flujo f
           where not f.completada and coalesce(f.etapa, '') <> 'finalizada' and not coalesce(f.pausada, false)
             and coalesce(f.entrega, f.vence) between p_fecha - 14 and p_fecha + 1
             and (f.responsable_id = g.id or (g.bc_id is not null and f.asignados @> array[g.bc_id]))
           order by coalesce(f.entrega, f.vence)
           limit 15
        ) f
        left join public.brands b on b.id = f.brand_id
    ) t
   where g.slack_id is not null;

  return jsonb_build_object('cumples', v_cumples, 'fuera', v_fuera, 'resumen', v_resumen);
end;
$$;

revoke all on function public.slack_conexion_servidor(text) from public;
revoke all on function public.slack_cola_tomar(text, int) from public;
revoke all on function public.slack_cola_terminar(text, bigint[], jsonb) from public;
revoke all on function public.slack_marcar(text, text[]) from public;
revoke all on function public.slack_desmarcar(text, text[]) from public;
revoke all on function public.slack_dia_servidor(text, date) from public;
grant execute on function public.slack_conexion_servidor(text) to anon, authenticated;
grant execute on function public.slack_cola_tomar(text, int) to anon, authenticated;
grant execute on function public.slack_cola_terminar(text, bigint[], jsonb) to anon, authenticated;
grant execute on function public.slack_marcar(text, text[]) to anon, authenticated;
grant execute on function public.slack_desmarcar(text, text[]) to anon, authenticated;
grant execute on function public.slack_dia_servidor(text, date) to anon, authenticated;
