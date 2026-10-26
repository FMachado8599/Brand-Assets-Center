-- ============================================================
-- Board: el equipo del estudio.
-- Lo que Basecamp no sabe: quién es admin de la app, qué puestos tiene cada uno (pueden ser dos:
-- "coordinador de diseño y de redacción"), a qué sectores corresponde cada puesto, qué hub
-- (grupo de marcas con su director) integra cada persona y de qué marcas es el designado.
-- Basecamp solo dice quién está asignado a cada tarea.
-- Correr DESPUÉS de migracion-integraciones.sql y migracion-board.sql.
-- Supabase → SQL Editor → pegar todo → Run. Se puede correr más de una vez.
-- ============================================================

-- 1. Sectores ------------------------------------------------------
-- Los equipos de trabajo. Redacción, Diseño digital y CM comparten el tablero "Digital" de
-- Basecamp: una misma tarea pasa por los tres (redacción → diseño → implementación).
-- Cuentas no tiene tablero propio: sigue las tareas de sus marcas en todos.
create table if not exists public.sectores (
  id text primary key,
  nombre text not null,
  -- Para agrupar en la app ("Digital" junta Redacción, Diseño digital y CM).
  area text not null,
  -- El tablero de Basecamp de donde salen sus tareas (null: Cuentas).
  tablero text,
  orden int not null default 0
);

insert into public.sectores (id, nombre, area, tablero, orden) values
  ('redaccion', 'Redacción', 'Digital', 'Digital', 10),
  ('diseno_digital', 'Diseño digital', 'Digital', 'Digital', 20),
  ('cm', 'Community management', 'Digital', 'Digital', 30),
  ('cuentas', 'Cuentas', 'Cuentas', null, 40),
  ('creatividad', 'Creatividad', 'Creatividad', 'Creatividad', 50),
  ('arte', 'Arte', 'Arte', 'Arte', 60),
  ('produccion', 'Producción', 'Producción', 'Producción', 70),
  ('medios', 'Medios', 'Medios', 'Medios', 80)
on conflict (id) do nothing;

-- 2. Puestos -------------------------------------------------------
-- Cada puesto tiene un nivel (la jerarquía) y uno o más sectores: "Director digital" cubre
-- Redacción, Diseño digital y CM; "Social media manager" es CM y Redacción a la vez.
create table if not exists public.puestos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  nivel text not null check (nivel in ('direccion', 'coordinacion', 'operativo')),
  orden int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.puesto_sectores (
  puesto_id uuid not null references public.puestos(id) on delete cascade,
  sector_id text not null references public.sectores(id) on delete cascade,
  primary key (puesto_id, sector_id)
);

-- Los puestos de arranque se cargan una sola vez (si después se cambian desde la app, correr esto
-- de nuevo no los pisa).
do $$
begin
  if not exists (select 1 from public.puestos) then
    insert into public.puestos (nombre, nivel, orden) values
      ('Director digital', 'direccion', 10),
      ('Coordinador de diseño digital', 'coordinacion', 20),
      ('Coordinador de redacción', 'coordinacion', 30),
      ('Diseñador digital', 'operativo', 40),
      ('Redactor', 'operativo', 50),
      ('Community manager', 'operativo', 60),
      ('Social media manager', 'operativo', 70),
      ('Director de cuentas', 'direccion', 80),
      ('Ejecutivo de cuentas', 'operativo', 90);

    insert into public.puesto_sectores (puesto_id, sector_id)
    select p.id, s.sector
    from (values
      ('Director digital', 'redaccion'), ('Director digital', 'diseno_digital'), ('Director digital', 'cm'),
      ('Coordinador de diseño digital', 'diseno_digital'),
      ('Coordinador de redacción', 'redaccion'),
      ('Diseñador digital', 'diseno_digital'),
      ('Redactor', 'redaccion'),
      ('Community manager', 'cm'),
      ('Social media manager', 'cm'), ('Social media manager', 'redaccion'),
      ('Director de cuentas', 'cuentas'),
      ('Ejecutivo de cuentas', 'cuentas')
    ) as s(puesto, sector)
    join public.puestos p on p.nombre = s.puesto;
  end if;
end $$;

-- 3. Hubs ----------------------------------------------------------
-- Un grupo de marcas con su director (ej: Digital se divide en dos hubs, uno de Gala y otro de
-- Julio). Quién lo integra lo dice equipo.hub_id: pueden ser solo diseñadores o también
-- redactores y CMs, según cómo se arme.
create table if not exists public.hubs (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  lider_id uuid,
  created_at timestamptz not null default now()
);

-- 4. Equipo --------------------------------------------------------
-- Una fila por persona del estudio. Sale de Basecamp (ver equipo_importar_bc) y se completa en la
-- app. No es una copia de Basecamp: lo de acá (rol, puestos, hub, marcas) es propio.
create table if not exists public.equipo (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  -- El mail con el que entra a Herramientas. En Basecamp casi todos usan el mismo (@camaratbwa.com).
  email text unique check (email = lower(email)),
  bc_persona_id bigint unique,
  rol text not null default 'empleado' check (rol in ('admin', 'empleado')),
  hub_id uuid references public.hubs(id) on delete set null,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists equipo_hub_idx on public.equipo (hub_id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'hubs_lider_fk') then
    alter table public.hubs add constraint hubs_lider_fk foreign key (lider_id) references public.equipo(id) on delete set null;
  end if;
end $$;

create table if not exists public.equipo_puestos (
  persona_id uuid not null references public.equipo(id) on delete cascade,
  puesto_id uuid not null references public.puestos(id) on delete cascade,
  primary key (persona_id, puesto_id)
);
create index if not exists equipo_puestos_puesto_idx on public.equipo_puestos (puesto_id);

-- 5. Marcas de cada hub y designados ---------------------------------
-- Una marca está en un solo hub.
create table if not exists public.hub_marcas (
  hub_id uuid not null references public.hubs(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  primary key (hub_id, brand_id)
);
create unique index if not exists hub_marcas_una_vez on public.hub_marcas (brand_id);

-- El designado de una marca en un sector: "Facu es el diseñador de Changan". Sus tareas de esa
-- marca son prioridad suya, aunque cualquiera del sector puede tomarlas. Uno por marca y sector.
create table if not exists public.marca_equipo (
  brand_id uuid not null references public.brands(id) on delete cascade,
  sector_id text not null references public.sectores(id) on delete cascade,
  persona_id uuid not null references public.equipo(id) on delete cascade,
  -- Por ahora siempre true (el designado). Queda lugar para "apoyo" fijo si hace falta.
  principal boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (brand_id, sector_id, persona_id)
);
create unique index if not exists marca_equipo_un_designado on public.marca_equipo (brand_id, sector_id) where principal;
create index if not exists marca_equipo_persona_idx on public.marca_equipo (persona_id);

-- Solo puede ser designado en un sector quien tiene un puesto de ese sector.
create or replace function public.marca_equipo_valida()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (
    select 1
    from public.equipo_puestos ep
    join public.puesto_sectores ps on ps.puesto_id = ep.puesto_id
    where ep.persona_id = new.persona_id and ps.sector_id = new.sector_id
  ) then
    raise exception 'Esa persona no tiene un puesto de ese sector';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists marca_equipo_valida on public.marca_equipo;
create trigger marca_equipo_valida before insert or update on public.marca_equipo
  for each row execute function public.marca_equipo_valida();

-- 6. ¿Quién soy? -----------------------------------------------------
create or replace function public.es_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.equipo e
    where e.email = lower(auth.jwt() ->> 'email') and e.rol = 'admin' and e.activo
  );
$$;

create or replace function public.mi_equipo_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select e.id from public.equipo e where e.email = lower(auth.jwt() ->> 'email');
$$;

-- Lo que la app necesita saber de quien entra: su fila del equipo (si tiene) y su persona de
-- Basecamp (por la fila del equipo o, si todavía no está, por el mail).
create or replace function public.board_yo()
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'email', lower(auth.jwt() ->> 'email'),
    'equipo_id', e.id,
    'nombre', coalesce(e.nombre, p.nombre),
    'rol', e.rol,
    'admin', coalesce(e.rol = 'admin' and e.activo, false),
    'bc_persona_id', coalesce(e.bc_persona_id, p.id)
  )
  from (select 1) uno
  left join public.equipo e on e.email = lower(auth.jwt() ->> 'email')
  left join lateral (
    select b.id, b.nombre from public.bc_personas b where lower(b.email) = lower(auth.jwt() ->> 'email') order by b.id limit 1
  ) p on true
  where public.has_access();
$$;

-- 7. Traer la gente de Basecamp --------------------------------------
-- Suma al equipo a la gente del estudio que está en Basecamp (los mismos mails que pueden entrar
-- a Herramientas) y vincula a los que ya estaban por mail. No toca roles, puestos ni marcas.
-- Activo = tuvo una tarea en los últimos 90 días o está en algún proyecto activo.
create or replace function public.equipo_importar_bc()
returns integer language plpgsql security definer set search_path = '' as $$
declare nuevos integer;
begin
  update public.equipo e
     set bc_persona_id = p.id, updated_at = now()
    from public.bc_personas p
   where e.bc_persona_id is null
     and p.email is not null and e.email = lower(p.email)
     and not exists (select 1 from public.equipo o where o.bc_persona_id = p.id);

  insert into public.equipo (nombre, email, bc_persona_id, activo)
  select distinct on (lower(p.email))
         p.nombre, lower(p.email), p.id,
         exists (
           select 1 from public.bc_tareas t
           where t.asignados @> array[p.id] and t.actualizada > now() - interval '90 days'
         ) or exists (
           select 1 from public.bc_proyecto_personas pp
           join public.bc_proyectos pr on pr.id = pp.proyecto_id
           where pp.persona_id = p.id and pr.estado = 'active'
         )
    from public.bc_personas p
   where not p.cliente
     and p.email is not null
     and public.email_allowed(p.email)
     and not exists (select 1 from public.equipo e where e.bc_persona_id = p.id or e.email = lower(p.email))
   order by lower(p.email), p.id
  on conflict do nothing;
  get diagnostics nuevos = row_count;
  return nuevos;
end;
$$;

revoke execute on function public.equipo_importar_bc() from public, anon, authenticated;

-- El botón "Traer gente de Basecamp" de la app (solo admins).
create or replace function public.traer_equipo_de_basecamp()
returns integer language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_admin() then
    raise exception 'Solo un admin puede traer la gente de Basecamp';
  end if;
  return public.equipo_importar_bc();
end;
$$;

revoke execute on function public.traer_equipo_de_basecamp() from anon;

-- 8. Tareas, listas para mostrar ---------------------------------------
-- Cada tarea de Basecamp con su columna, su etapa normalizada, su tablero (el sector) y su
-- proyecto (la marca). security_invoker: se lee con los permisos de quien pide.
create or replace view public.board_tareas with (security_invoker = true) as
select t.id, t.titulo, t.app_url, t.vence, t.completada, t.asignados, t.comentarios, t.creada, t.actualizada,
       t.proyecto_id, p.nombre as proyecto, p.brand_id,
       t.columna_id, c.nombre as columna, c.estado,
       c.tablero_id, tb.nombre as tablero
  from public.bc_tareas t
  join public.bc_proyectos p on p.id = t.proyecto_id
  left join public.bc_columnas c on c.id = t.columna_id
  left join public.bc_tableros tb on tb.id = c.tablero_id;

-- 9. Permisos ----------------------------------------------------------
-- Todo el estudio lee. Configurar (sectores, puestos, hubs, equipo) es de admins. Cada uno puede
-- elegir sus propias marcas (y un admin, las de cualquiera).
alter table public.sectores enable row level security;
alter table public.puestos enable row level security;
alter table public.puesto_sectores enable row level security;
alter table public.hubs enable row level security;
alter table public.equipo enable row level security;
alter table public.equipo_puestos enable row level security;
alter table public.hub_marcas enable row level security;
alter table public.marca_equipo enable row level security;

do $$
declare t text;
begin
  foreach t in array array['sectores', 'puestos', 'puesto_sectores', 'hubs', 'equipo', 'equipo_puestos', 'hub_marcas', 'marca_equipo']
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

drop policy if exists "cada uno sus marcas" on public.marca_equipo;
create policy "cada uno sus marcas" on public.marca_equipo for all to authenticated
  using (persona_id = (select public.mi_equipo_id()))
  with check (persona_id = (select public.mi_equipo_id()));

-- 10. Arranque --------------------------------------------------------
-- La gente que ya está en Basecamp entra al equipo, y si todavía no hay ningún admin, los admins
-- del tablero de sugerencias (hoy Facu) arrancan como admins. Después todo se maneja desde la app.
select public.equipo_importar_bc();

do $$
begin
  if not exists (select 1 from public.equipo where rol = 'admin') then
    insert into public.equipo (nombre, email, rol)
    select coalesce(nullif(pr.full_name, ''), split_part(a.email, '@', 1)), a.email, 'admin'
      from public.feedback_admins a
      left join public.profiles pr on lower(pr.email) = a.email
    on conflict (email) do update set rol = 'admin', activo = true;
  end if;
end $$;
