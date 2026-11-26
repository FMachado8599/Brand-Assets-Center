-- ============================================================
-- Feature | Inicio (en el historial de migraciones: feature_inicio)
-- Lo que necesita el Inicio con sesión para ser de cada uno:
--   1. Cumpleaños y fecha de ingreso en el perfil: para saludar, los aniversarios y las bienvenidas.
--   2. Las fechas de cada marca (marca_fechas): lanzamientos, aniversarios, campañas que vienen.
--   3. El uso de las herramientas (uso_herramientas): emojis copiados, archivos convertidos,
--      banners exportados… Alimenta "Tus números del mes", el emoji del estudio y el Wrapped.
--      Cada uno anota y ve solo lo suyo; lo del estudio sale contado, sin nombres.
--   4. Funciones que cuentan lo que la app no puede leer directo: tus visitas por herramienta,
--      lo último que pasó en el estudio, tus números, el emoji del estudio y el Wrapped del año.
--   5. Saludar a alguien (cumple, aniversario, bienvenida): le llega a la campanita.
-- Correr DESPUÉS de migracion-perfil.sql, migracion-equipo.sql y migracion-notificaciones.sql.
-- Supabase → SQL Editor → pegar todo → Run. Se puede correr más de una vez: no mueve datos.
-- ============================================================

do $$
begin
  if to_regprocedure('public.has_access()') is null then
    raise exception 'Primero corré supabase/migracion-acceso.sql (define has_access()) y volvé a correr esto.';
  end if;
  if to_regclass('public.profiles') is null or to_regclass('public.visits') is null then
    raise exception 'Primero corré supabase/migracion-usuarios.sql (crea profiles y visits) y volvé a correr esto.';
  end if;
  if to_regprocedure('public.mi_equipo_id()') is null then
    raise exception 'Primero corré supabase/migracion-equipo.sql (el equipo del Board) y volvé a correr esto.';
  end if;
  if to_regclass('public.notificaciones') is null then
    raise exception 'Primero corré supabase/migracion-notificaciones.sql (la campanita) y volvé a correr esto.';
  end if;
end $$;

-- 1. Cumpleaños e ingreso ----------------------------------------
-- El cumple va sin año ("MM-DD"): alcanza para saludar y no dice la edad.
-- El ingreso es el día que entró al estudio: los aniversarios y "se sumó" salen de ahí.
-- Cada uno los edita en su perfil (la política "perfil propio: editar" de migracion-usuarios.sql).
alter table public.profiles add column if not exists cumple text;
alter table public.profiles add column if not exists ingreso date;
alter table public.profiles drop constraint if exists profiles_cumple_valido;
alter table public.profiles add constraint profiles_cumple_valido
  check (cumple ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$');
alter table public.profiles drop constraint if exists profiles_ingreso_valido;
alter table public.profiles add constraint profiles_ingreso_valido
  check (ingreso between date '1950-01-01' and date '2100-12-31');

-- 2. Las fechas de cada marca -------------------------------------
create table if not exists public.marca_fechas (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  fecha date not null,
  titulo text not null check (char_length(trim(titulo)) between 1 and 120),
  tipo text not null default 'otro' check (tipo in ('lanzamiento', 'aniversario', 'campana', 'evento', 'otro')),
  -- Se repite todos los años (un aniversario): vale el día y el mes.
  anual boolean not null default false,
  creada_por uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists marca_fechas_brand_idx on public.marca_fechas (brand_id, fecha);

alter table public.marca_fechas enable row level security;
drop policy if exists "el estudio ve y edita las fechas" on public.marca_fechas;
create policy "el estudio ve y edita las fechas" on public.marca_fechas
  for all to authenticated
  using ((select public.has_access()))
  with check ((select public.has_access()));

-- 3. El uso de las herramientas -----------------------------------
-- Una fila por cosa hecha: copiar un emoji, convertir un archivo, exportar banners. Lo anota la app con
-- la sesión de cada uno; nadie lo edita ni lo borra.
create table if not exists public.uso_herramientas (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  creado timestamptz not null default now(),
  tipo text not null check (tipo in ('emoji', 'gif', 'icono', 'conversion', 'compresion', 'retoque', 'banner', 'tarjeta', 'redaccion')),
  -- El emoji copiado, el formato de salida, cómo se copió…
  detalle text check (char_length(detalle) <= 60),
  cantidad integer not null default 1 check (cantidad between 1 and 500),
  -- Lo que pesaba lo que entró (archivos convertidos, comprimidos o retocados).
  bytes bigint check (bytes >= 0),
  -- Sin clave foránea a propósito: si se borra el cliente, el registro queda.
  brand_id uuid
);
create index if not exists uso_herramientas_user_idx on public.uso_herramientas (user_id, creado desc);
create index if not exists uso_herramientas_tipo_idx on public.uso_herramientas (tipo, creado desc);

alter table public.uso_herramientas enable row level security;
drop policy if exists "cada uno anota lo suyo" on public.uso_herramientas;
create policy "cada uno anota lo suyo" on public.uso_herramientas
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.has_access()));
drop policy if exists "cada uno ve lo suyo" on public.uso_herramientas;
create policy "cada uno ve lo suyo" on public.uso_herramientas
  for select to authenticated
  using (user_id = (select auth.uid()));

-- 4. Funciones del Inicio -------------------------------------------

-- La herramienta de una dirección: el primer tramo ("/board/equipo" → "board"). Los nombres viejos van
-- con el de ahora: Planificación es Presentaciones y Emojis es una de las Librerías.
create or replace function public.inicio_modulo(p_path text)
returns text language sql immutable set search_path = '' as $$
  select case split_part(coalesce(p_path, ''), '/', 2)
    when 'planificacion' then 'presentaciones'
    when 'emojis' then 'library'
    else split_part(coalesce(p_path, ''), '/', 2)
  end;
$$;

-- Tus visitas por herramienta (el primer tramo de la dirección: board, library, redaccion…), de los
-- últimos p_dias. Las visitas no se leen desde la app: esto cuenta solo las tuyas.
create or replace function public.inicio_herramientas(p_dias integer default 60)
returns table (modulo text, visitas bigint, ultima timestamptz)
language sql stable security definer set search_path = '' as $$
  select public.inicio_modulo(v.path), count(*), max(v.created_at)
  from public.visits v
  where v.user_id = auth.uid()
    and coalesce(public.has_access(), false)
    and v.created_at > now() - make_interval(days => greatest(1, least(coalesce(p_dias, 60), 400)))
  group by 1;
$$;

-- El nombre y la foto de una cuenta, como se muestran en el Inicio.
create or replace function public.inicio_persona(p_user uuid)
returns table (nombre text, avatar text)
language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(trim(p.nombre_visible), ''), nullif(trim(p.full_name), ''), split_part(p.email, '@', 1)),
         coalesce(case when p.foto_origen in ('subida', 'basecamp') then p.foto_url end, p.avatar_url)
  from public.profiles p where p.id = p_user;
$$;
revoke execute on function public.inicio_persona(uuid) from public, anon;

-- Lo último que pasó en el estudio: logos subidos, presentaciones y tarjetas nuevas, clientes nuevos y
-- gente que entró por primera vez. Agrupado por día (y por cliente y persona), lo más nuevo primero.
create or replace function public.inicio_actividad(p_dias integer default 14, p_limite integer default 12)
returns table (tipo text, cuando timestamptz, user_id uuid, nombre text, avatar text, brand_id uuid, cantidad bigint, ref text, titulo text)
language plpgsql stable security definer set search_path = '' as $$
declare
  desde timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_dias, 14), 90)));
  limite integer := greatest(1, least(coalesce(p_limite, 12), 50));
begin
  if not coalesce(public.has_access(), false) then
    return;
  end if;
  return query
  with eventos as (
    -- Archivos de logo: storage.objects tiene la hora y quién lo subió; la ficha del cliente, de quién es.
    select 'logos'::text as tipo, max(o.created_at) as cuando, o.owner as user_id, b.id as brand_id,
           count(*)::bigint as cantidad, null::text as ref, null::text as titulo
    from storage.objects o
    join public.brands b on exists (
      select 1
      from jsonb_array_elements(case when jsonb_typeof(b.logos) = 'array' then b.logos else '[]'::jsonb end) l,
           jsonb_array_elements(case when jsonb_typeof(l -> 'files') = 'array' then l -> 'files' else '[]'::jsonb end) f
      where f ->> 'path' = o.name
    )
    where o.bucket_id = 'logos' and o.created_at > desde
    group by (o.created_at at time zone 'America/Montevideo')::date, o.owner, b.id
    union all
    select 'tarjetas', max(c.created_at), c.owner_id, c.brand_id, count(*)::bigint, null, null
    from public.cards c
    where c.created_at > desde
    group by (c.created_at at time zone 'America/Montevideo')::date, c.owner_id, c.brand_id
    union all
    select 'cliente', b.created_at, null::uuid, b.id, 1::bigint, null, b.name
    from public.brands b
    where b.created_at > desde
    union all
    select 'nuevo', p.created_at, p.id, null::uuid, 1::bigint, null, null
    from public.profiles p
    where p.created_at > desde
  )
  select e.tipo, e.cuando, e.user_id, pe.nombre, pe.avatar, e.brand_id, e.cantidad, e.ref, e.titulo
  from eventos e
  left join lateral public.inicio_persona(e.user_id) pe on true
  order by e.cuando desc
  limit limite;
end;
$$;

-- Las presentaciones nuevas, aparte: la tabla es de migracion-presentaciones.sql y puede no estar.
create or replace function public.inicio_actividad_presentaciones(p_dias integer default 14, p_limite integer default 6)
returns table (cuando timestamptz, user_id uuid, nombre text, avatar text, brand_id uuid, ref text, titulo text, tipo text, mes integer, anio integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce(public.has_access(), false) or to_regclass('public.presentaciones') is null then
    return;
  end if;
  return query
  select p.created_at, p.creada_por, pe.nombre, pe.avatar, p.brand_id, p.id::text, p.titulo, p.tipo, p.mes, p.anio
  from public.presentaciones p
  left join lateral public.inicio_persona(p.creada_por) pe on true
  where p.created_at > now() - make_interval(days => greatest(1, least(coalesce(p_dias, 14), 90)))
  order by p.created_at desc
  limit greatest(1, least(coalesce(p_limite, 6), 30));
end;
$$;

-- Tus números desde una fecha (el mes, el año): lo que hiciste con cada herramienta.
create or replace function public.inicio_numeros(p_desde timestamptz default date_trunc('month', now()))
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  desde timestamptz := coalesce(p_desde, date_trunc('month', now()));
  r jsonb;
  descargas bigint := 0;
  bajado bigint := 0;
  partidas bigint := 0;
begin
  if uid is null or not coalesce(public.has_access(), false) then
    return null;
  end if;

  select jsonb_build_object(
    'emojis', coalesce(sum(u.cantidad) filter (where u.tipo = 'emoji'), 0),
    'gifs', coalesce(sum(u.cantidad) filter (where u.tipo = 'gif'), 0),
    'iconos', coalesce(sum(u.cantidad) filter (where u.tipo = 'icono'), 0),
    'conversiones', coalesce(sum(u.cantidad) filter (where u.tipo = 'conversion'), 0),
    'compresiones', coalesce(sum(u.cantidad) filter (where u.tipo = 'compresion'), 0),
    'bytes_convertidos', coalesce(sum(u.bytes) filter (where u.tipo in ('conversion', 'compresion')), 0),
    'retoques', coalesce(sum(u.cantidad) filter (where u.tipo = 'retoque'), 0),
    'banners', coalesce(sum(u.cantidad) filter (where u.tipo = 'banner'), 0),
    'tarjetas', coalesce(sum(u.cantidad) filter (where u.tipo = 'tarjeta'), 0),
    'redacciones', coalesce(sum(u.cantidad) filter (where u.tipo = 'redaccion'), 0)
  ) into r
  from public.uso_herramientas u
  where u.user_id = uid and u.creado >= desde;

  r := r || jsonb_build_object('emoji_favorito', (
    select u.detalle from public.uso_herramientas u
    where u.user_id = uid and u.creado >= desde and u.tipo = 'emoji' and u.detalle is not null
    group by u.detalle order by sum(u.cantidad) desc, max(u.creado) desc limit 1
  ));

  if to_regclass('public.descargas_registro') is not null then
    select count(*), coalesce(sum(d.bytes), 0) into descargas, bajado
    from public.descargas_registro d where d.user_id = uid and d.creado >= desde;
  end if;
  if to_regclass('public.juego_partidas') is not null then
    select count(*) into partidas
    from public.juego_partidas p where p.user_id = uid and p.terminada >= desde and p.puntaje is not null;
  end if;

  return r || jsonb_build_object(
    'descargas', descargas,
    'bytes_bajados', bajado,
    'partidas', partidas,
    'visitas', (select count(*) from public.visits v where v.user_id = uid and v.created_at >= desde),
    'dias', (select count(distinct (v.created_at at time zone 'America/Montevideo')::date)
             from public.visits v where v.user_id = uid and v.created_at >= desde)
  );
end;
$$;

-- El emoji del estudio: el más copiado ayer (hora de Montevideo); si ayer nadie copió, el de la semana.
create or replace function public.inicio_emoji_del_estudio()
returns table (emoji text, veces bigint, personas bigint, desde date)
language plpgsql stable security definer set search_path = '' as $$
declare
  hoy date := (now() at time zone 'America/Montevideo')::date;
begin
  if not coalesce(public.has_access(), false) then
    return;
  end if;
  return query
  select u.detalle, sum(u.cantidad)::bigint, count(distinct u.user_id)::bigint, hoy - 1
  from public.uso_herramientas u
  where u.tipo = 'emoji' and u.detalle is not null
    and (u.creado at time zone 'America/Montevideo')::date = hoy - 1
  group by u.detalle
  order by 2 desc, 3 desc
  limit 1;
  if not found then
    return query
    select u.detalle, sum(u.cantidad)::bigint, count(distinct u.user_id)::bigint, hoy - 7
    from public.uso_herramientas u
    where u.tipo = 'emoji' and u.detalle is not null
      and u.creado >= (hoy - 7)::timestamp at time zone 'America/Montevideo'
    group by u.detalle
    order by 2 desc, 3 desc
    limit 1;
  end if;
end;
$$;

-- El Wrapped: tu año en Herramientas (y el del estudio, contado sin nombres salvo el gamer del año).
create or replace function public.inicio_wrapped(p_anio integer default extract(year from now())::integer)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  yo uuid := public.mi_equipo_id();
  desde timestamptz := make_timestamptz(coalesce(p_anio, 2026), 1, 1, 0, 0, 0, 'America/Montevideo');
  hasta timestamptz := make_timestamptz(coalesce(p_anio, 2026) + 1, 1, 1, 0, 0, 0, 'America/Montevideo');
  mio jsonb;
  estudio jsonb;
  extra jsonb := '{}'::jsonb;
begin
  if uid is null or not coalesce(public.has_access(), false) then
    return null;
  end if;

  -- Tus visitas: cuántas, cuántos días, desde cuándo, a qué hora y qué día, y la racha más larga.
  with v as (
    select v.created_at, (v.created_at at time zone 'America/Montevideo') as local, public.inicio_modulo(v.path) as modulo
    from public.visits v where v.user_id = uid and v.created_at >= desde and v.created_at < hasta
  ),
  dias as (select distinct local::date as dia from v),
  islas as (select dia, dia - (row_number() over (order by dia))::integer as grupo from dias),
  racha as (select count(*) as largo from islas group by grupo order by 1 desc limit 1)
  select jsonb_build_object(
    'visitas', (select count(*) from v),
    'dias', (select count(*) from dias),
    'primera', (select min(local)::date from v),
    'racha', coalesce((select largo from racha), 0),
    'hora', (select extract(hour from local)::integer from v group by 1 order by count(*) desc limit 1),
    'dia_semana', (select extract(isodow from local)::integer from v group by 1 order by count(*) desc limit 1),
    'herramientas', coalesce((
      select jsonb_agg(jsonb_build_object('modulo', m.modulo, 'visitas', m.n) order by m.n desc)
      from (select modulo, count(*) as n from v where modulo <> '' and modulo not in ('perfil', 'ingresar', 'wrapped')
            group by modulo order by 2 desc limit 5) m
    ), '[]'::jsonb)
  ) into mio;

  -- Lo que hiciste con las herramientas.
  select jsonb_build_object(
    'emojis', coalesce(sum(u.cantidad) filter (where u.tipo = 'emoji'), 0),
    'gifs', coalesce(sum(u.cantidad) filter (where u.tipo = 'gif'), 0),
    'iconos', coalesce(sum(u.cantidad) filter (where u.tipo = 'icono'), 0),
    'conversiones', coalesce(sum(u.cantidad) filter (where u.tipo in ('conversion', 'compresion')), 0),
    'bytes_convertidos', coalesce(sum(u.bytes) filter (where u.tipo in ('conversion', 'compresion')), 0),
    'retoques', coalesce(sum(u.cantidad) filter (where u.tipo = 'retoque'), 0),
    'banners', coalesce(sum(u.cantidad) filter (where u.tipo = 'banner'), 0),
    'tarjetas_copiadas', coalesce(sum(u.cantidad) filter (where u.tipo = 'tarjeta'), 0),
    'redacciones_copiadas', coalesce(sum(u.cantidad) filter (where u.tipo = 'redaccion'), 0),
    'top_emojis', coalesce((
      select jsonb_agg(jsonb_build_object('emoji', t.detalle, 'veces', t.n) order by t.n desc)
      from (select u2.detalle, sum(u2.cantidad) as n from public.uso_herramientas u2
            where u2.user_id = uid and u2.tipo = 'emoji' and u2.detalle is not null and u2.creado >= desde and u2.creado < hasta
            group by u2.detalle order by 2 desc limit 5) t
    ), '[]'::jsonb)
  ) into extra
  from public.uso_herramientas u
  where u.user_id = uid and u.creado >= desde and u.creado < hasta;
  mio := mio || extra;

  mio := mio || jsonb_build_object(
    'tarjetas_creadas', (select count(*) from public.cards c where c.owner_id = uid and c.created_at >= desde and c.created_at < hasta),
    'redacciones_creadas', (select count(*) from public.redacciones r where r.user_id = uid and r.deleted_at is null
                            and r.created_at >= desde and r.created_at < hasta)
  );

  if to_regclass('public.descargas_registro') is not null then
    select mio || jsonb_build_object(
      'descargas', count(*),
      'bytes_bajados', coalesce(sum(d.bytes), 0),
      'plataforma', (select d2.plataforma from public.descargas_registro d2
                     where d2.user_id = uid and d2.creado >= desde and d2.creado < hasta
                     group by 1 order by count(*) desc limit 1)
    ) into mio
    from public.descargas_registro d where d.user_id = uid and d.creado >= desde and d.creado < hasta;
  end if;

  if to_regclass('public.juego_partidas') is not null then
    select mio || jsonb_build_object(
      'partidas', count(*),
      'juego', (select p2.juego from public.juego_partidas p2
                where p2.user_id = uid and p2.puntaje is not null and p2.terminada >= desde and p2.terminada < hasta
                group by 1 order by count(*) desc limit 1)
    ) into mio
    from public.juego_partidas p where p.user_id = uid and p.puntaje is not null and p.terminada >= desde and p.terminada < hasta;
  end if;

  -- Las tareas que llevaste hasta el final en el Board, y la marca con la que más trabajaste.
  if yo is not null and to_regclass('public.tarea_movimientos') is not null and to_regclass('public.board_flujo') is not null then
    select mio || jsonb_build_object(
      'tareas', count(distinct m.tarea_id),
      'marca', (select f.brand_id from public.tarea_movimientos m2 join public.board_flujo f on f.id = m2.tarea_id
                where m2.autor_id = yo and m2.tipo = 'etapa' and m2.creado >= desde and m2.creado < hasta and f.brand_id is not null
                group by 1 order by count(distinct m2.tarea_id) desc limit 1)
    ) into mio
    from public.tarea_movimientos m
    where m.autor_id = yo and m.tipo = 'etapa' and m.a = 'finalizada' and m.creado >= desde and m.creado < hasta;
  end if;

  -- Cuánto usaste la app al lado del resto: el porcentaje de gente que la usó menos que vos.
  mio := mio || jsonb_build_object('percentil', (
    with c as (select v.user_id, count(*) as n from public.visits v
               where v.user_id is not null and v.created_at >= desde and v.created_at < hasta group by 1)
    select case when count(*) <= 1 then null
                else round(100.0 * count(*) filter (where c.n < (select n from c where c.user_id = uid)) / (count(*) - 1))
           end
    from c
  ));

  -- El estudio.
  select jsonb_build_object(
    'visitas', count(*),
    'personas', count(distinct v.user_id),
    'herramienta', (select public.inicio_modulo(v2.path) from public.visits v2
                    where v2.user_id is not null and v2.created_at >= desde and v2.created_at < hasta
                      and public.inicio_modulo(v2.path) not in ('', 'perfil', 'ingresar', 'wrapped')
                    group by 1 order by count(*) desc limit 1),
    'emoji', (select u.detalle from public.uso_herramientas u
              where u.tipo = 'emoji' and u.detalle is not null and u.creado >= desde and u.creado < hasta
              group by 1 order by sum(u.cantidad) desc limit 1),
    'emojis', (select coalesce(sum(u.cantidad), 0) from public.uso_herramientas u
               where u.tipo = 'emoji' and u.creado >= desde and u.creado < hasta)
  ) into estudio
  from public.visits v
  where v.user_id is not null and v.created_at >= desde and v.created_at < hasta;

  if to_regclass('public.juego_partidas') is not null then
    select estudio || jsonb_build_object(
      'partidas', (select count(*) from public.juego_partidas p where p.puntaje is not null and p.terminada >= desde and p.terminada < hasta),
      'gamer', (select jsonb_build_object('nombre', pe.nombre, 'avatar', pe.avatar, 'partidas', g.n)
                from (select p.user_id, count(*) as n from public.juego_partidas p
                      where p.puntaje is not null and p.terminada >= desde and p.terminada < hasta
                      group by 1 order by 2 desc limit 1) g
                left join lateral public.inicio_persona(g.user_id) pe on true)
    ) into estudio;
  end if;
  if to_regclass('public.descargas_registro') is not null then
    estudio := estudio || jsonb_build_object('descargas', (
      select count(*) from public.descargas_registro d where d.creado >= desde and d.creado < hasta));
  end if;

  return jsonb_build_object('anio', coalesce(p_anio, 2026), 'yo', mio, 'estudio', estudio);
end;
$$;

-- 5. Saludar ------------------------------------------------------
-- Le llega a la campanita de esa persona, con tu nombre. Un saludo por ocasión por día.
create or replace function public.inicio_saludar(p_persona uuid, p_ocasion text, p_texto text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_yo uuid := public.mi_equipo_id();
  v_titulo text;
  v_enlace text := '/#' || coalesce(p_ocasion, '');
begin
  if v_yo is null or not coalesce(public.has_access(), false) then
    raise exception 'Iniciá sesión con tu cuenta del estudio';
  end if;
  v_titulo := case p_ocasion
    when 'cumple' then '🎂 ¡Feliz cumple!'
    when 'aniversario' then '🎉 ¡Feliz aniversario en el estudio!'
    when 'bienvenida' then '👋 ¡Te damos la bienvenida al estudio!'
  end;
  if v_titulo is null then
    raise exception 'Ese saludo no existe';
  end if;
  if p_persona = v_yo then
    raise exception 'No te podés saludar a vos';
  end if;
  if not exists (select 1 from public.equipo e where e.id = p_persona and e.activo) then
    raise exception 'Esa persona no está en el equipo';
  end if;
  if exists (
    select 1 from public.notificaciones n
    where n.persona_id = p_persona and n.autor_id = v_yo and n.enlace = v_enlace and n.creada > now() - interval '20 hours'
  ) then
    raise exception 'Ya le mandaste ese saludo hoy';
  end if;
  insert into public.notificaciones (persona_id, origen, motivo, autor_id, titulo, texto, enlace, creada)
  values (p_persona, 'app', 'mencion', v_yo, v_titulo,
          left(coalesce(nullif(trim(p_texto), ''), v_titulo), 280), v_enlace, now());
end;
$$;

-- 6. Permisos de las funciones --------------------------------------
revoke execute on function public.inicio_herramientas(integer) from public, anon;
revoke execute on function public.inicio_actividad(integer, integer) from public, anon;
revoke execute on function public.inicio_actividad_presentaciones(integer, integer) from public, anon;
revoke execute on function public.inicio_numeros(timestamptz) from public, anon;
revoke execute on function public.inicio_emoji_del_estudio() from public, anon;
revoke execute on function public.inicio_wrapped(integer) from public, anon;
revoke execute on function public.inicio_saludar(uuid, text, text) from public, anon;
grant execute on function public.inicio_herramientas(integer) to authenticated;
grant execute on function public.inicio_actividad(integer, integer) to authenticated;
grant execute on function public.inicio_actividad_presentaciones(integer, integer) to authenticated;
grant execute on function public.inicio_numeros(timestamptz) to authenticated;
grant execute on function public.inicio_emoji_del_estudio() to authenticated;
grant execute on function public.inicio_wrapped(integer) to authenticated;
grant execute on function public.inicio_saludar(uuid, text, text) to authenticated;
