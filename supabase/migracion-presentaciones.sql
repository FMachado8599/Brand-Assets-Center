-- ============================================================
-- Presentaciones: donde se prepara el material de una tarea para mostrárselo al cliente. Cada una
-- es de un tipo (Planificación, Pauta, Leads / Ads, Programática / YouTube… o uno nuevo, que se
-- crea desde la app) y tiene sus piezas: cada post, carrusel, reel o historia con su fecha, sus
-- plataformas, su copy, las indicaciones para diseño y el material final.
--
-- Antes se llamaba Planificación (planificaciones, plani_piezas, plani_comentarios): si esas
-- tablas existen, se renombran sin perder nada.
-- Correr DESPUÉS de migracion-acceso.sql (has_access) y migracion-equipo.sql (es_admin).
-- Supabase → SQL Editor → pegar todo → Run. Se puede correr más de una vez.
-- ============================================================

-- 0. Lo de antes, con el nombre nuevo ------------------------------
do $$
begin
  if to_regclass('public.planificaciones') is not null and to_regclass('public.presentaciones') is null then
    alter table public.planificaciones rename to presentaciones;
  end if;
  if to_regclass('public.plani_piezas') is not null and to_regclass('public.presentacion_piezas') is null then
    alter table public.plani_piezas rename to presentacion_piezas;
  end if;
  if to_regclass('public.plani_comentarios') is not null and to_regclass('public.presentacion_comentarios') is null then
    alter table public.plani_comentarios rename to presentacion_comentarios;
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'presentacion_piezas' and column_name = 'plani_id') then
    alter table public.presentacion_piezas rename column plani_id to presentacion_id;
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'presentacion_comentarios' and column_name = 'plani_id') then
    alter table public.presentacion_comentarios rename column plani_id to presentacion_id;
  end if;
  -- Los triggers de antes (se vuelven a crear abajo, con el nombre nuevo).
  if to_regclass('public.presentaciones') is not null then
    drop trigger if exists planificaciones_touch on public.presentaciones;
  end if;
  if to_regclass('public.presentacion_piezas') is not null then
    drop trigger if exists plani_piezas_touch on public.presentacion_piezas;
    drop trigger if exists plani_piezas_touch_parent on public.presentacion_piezas;
  end if;
end $$;
drop function if exists public.plani_touch_parent();

-- 1. Los tipos ------------------------------------------------------
-- Qué es la presentación. Se reconoce en Basecamp por las palabras del título de la tarea
-- ("Plani noviembre", "Leads Black Friday"…). Cualquiera del estudio puede crear uno nuevo; lo
-- edita o lo borra quien lo creó o un admin.
create table if not exists public.presentacion_tipos (
  id text primary key,
  nombre text not null,
  descripcion text not null default '',
  color text not null default '#52525B',
  -- El nombre de un ícono de la app (lib/presentaciones: ICONOS).
  icono text not null default 'presentacion',
  -- En minúsculas y sin tildes; se buscan como palabras enteras en el título de la tarea.
  palabras text[] not null default '{}',
  -- Las herramientas de la app que usa: ads (el mockup del anuncio en cada pieza) y gif (banners
  -- con su GIF armado con los frames).
  herramientas text[] not null default '{}',
  orden int not null default 100,
  creado_por uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint presentacion_tipos_id check (id ~ '^[a-z0-9_]{2,40}$'),
  constraint presentacion_tipos_nombre check (char_length(btrim(nombre)) between 1 and 60),
  constraint presentacion_tipos_color check (color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint presentacion_tipos_textos check (char_length(descripcion) <= 300 and cardinality(palabras) <= 30)
);

-- Si la tabla es de antes de las herramientas.
alter table public.presentacion_tipos add column if not exists herramientas text[] not null default '{}';
alter table public.presentacion_tipos drop constraint if exists presentacion_tipos_herramientas;
alter table public.presentacion_tipos add constraint presentacion_tipos_herramientas
  check (herramientas <@ array['ads', 'gif']::text[]);

insert into public.presentacion_tipos (id, nombre, descripcion, color, icono, palabras, herramientas, orden) values
  ('planificacion', 'Planificación', 'El contenido orgánico del mes', '#7C3AED', 'calendario',
   array['plani', 'planis', 'planificacion', 'social media plan', 'plan de contenido', 'plan de contenidos', 'grilla'], '{}', 10),
  ('pauta', 'Pauta', 'Contenido pautado', '#2563EB', 'megafono', array['pauta', 'pautas', 'pautado', 'paid'], '{ads}', 20),
  ('leads', 'Leads / Ads', 'Anuncios para captar leads', '#DB2777', 'objetivo',
   array['leads', 'lead', 'ads', 'anuncio', 'anuncios', 'meta ads', 'lead ads'], '{ads}', 30),
  ('programatica', 'Programática / YouTube', 'Banners de programática y piezas para YouTube', '#059669', 'pantalla',
   array['programatica', 'youtube', 'display', 'banners'], '{gif}', 40)
on conflict (id) do nothing;
-- Los de base que se crearon antes de las herramientas (si nadie las cambió todavía).
update public.presentacion_tipos set herramientas = '{ads}' where id in ('leads', 'pauta') and herramientas = '{}';
update public.presentacion_tipos set herramientas = '{gif}' where id = 'programatica' and herramientas = '{}';

-- 2. La presentación ------------------------------------------------
-- Una por tarea: cliente, tipo, mes. Puede haber más de una del mismo cliente y mes.
create table if not exists public.presentaciones (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  titulo text not null default '',
  tipo text not null default 'planificacion',
  anio int not null,
  mes int not null,
  -- En qué etapa está: redacción → diseño → revisión interna → en cliente → programación → lista.
  estado text not null default 'redaccion',
  -- La tarea de Basecamp de la que salió (bc_tareas.id). Sin FK: la caché de Basecamp se puede
  -- borrar y volver a sincronizar sin perder el vínculo.
  bc_tarea_id bigint,
  -- La carpeta en el Drive del estudio donde va el material final.
  drive_carpeta_id text,
  notas text not null default '',
  creada_por uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint presentaciones_mes check (mes between 1 and 12),
  constraint presentaciones_anio check (anio between 2020 and 2100),
  constraint presentaciones_estado check (estado in ('redaccion', 'diseno', 'revision', 'cliente', 'programacion', 'lista')),
  constraint presentaciones_titulo_largo check (char_length(titulo) <= 200),
  constraint presentaciones_notas_largo check (char_length(notas) <= 20000)
);

create index if not exists presentaciones_cliente_idx on public.presentaciones (brand_id, anio desc, mes desc);
create index if not exists presentaciones_tarea_idx on public.presentaciones (bc_tarea_id) where bc_tarea_id is not null;

-- 3. Las piezas -----------------------------------------------------
-- Cada publicación de la presentación. Se agrupan por fecha en la app (el "día" de la presentación).
create table if not exists public.presentacion_piezas (
  id uuid primary key default gen_random_uuid(),
  presentacion_id uuid not null references public.presentaciones(id) on delete cascade,
  fecha date not null,
  hora time,
  orden int not null default 0,
  formato text not null,
  -- post y carrusel: 4:5 o 1:1 · reel e historia: 9:16 · banner: libre (con ancho y alto)
  proporcion text not null default '4:5',
  ancho int,
  alto int,
  plataformas text[] not null default '{instagram}',
  titulo text not null default '',
  -- El copy: { "todas": "…", "html": "…" } (las de antes pueden traer uno por red).
  copys jsonb not null default '{}'::jsonb,
  -- El anuncio (en los tipos con ads): { "lugares": ["feed", "reels", "story", …], "cta": "…", "titulo": "…" }
  anuncio jsonb not null default '{}'::jsonb,
  -- Indicaciones para diseño (en un carrusel, las generales; las de cada slide van en slides).
  instrucciones text not null default '',
  -- Carrusel: [{ "instruccion": "…" }, …] — una por slide.
  slides jsonb not null default '[]'::jsonb,
  -- Links de referencia (Pinterest, ejemplos) y de assets (fotos, logos, carpetas): [{ "id", "url", "label" }]
  referencias jsonb not null default '[]'::jsonb,
  assets jsonb not null default '[]'::jsonb,
  -- El material final, en el Drive del estudio: [{ "id", "drive_id", "nombre", "mime", "tamano", "ancho", "alto", "rol" }]
  medios jsonb not null default '[]'::jsonb,
  -- Stickers de historia (link, encuesta, pregunta, cuenta regresiva…), con su posición sobre la pieza.
  stickers jsonb not null default '[]'::jsonb,
  -- Una historia que adapta otra pieza del mismo día: hereda la idea y diseño la arma junto.
  adapta_de uuid references public.presentacion_piezas(id) on delete set null,
  estado_agencia text not null default 'pendiente',
  estado_cliente text not null default 'pendiente',
  programada boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint presentacion_piezas_formato check (formato in ('post', 'carrusel', 'reel', 'historia', 'banner')),
  constraint presentacion_piezas_proporcion check (proporcion in ('4:5', '1:1', '9:16', '16:9', 'libre')),
  constraint presentacion_piezas_medida check ((ancho is null or ancho between 10 and 4000) and (alto is null or alto between 10 and 4000)),
  constraint presentacion_piezas_anuncio check (jsonb_typeof(anuncio) = 'object'),
  constraint presentacion_piezas_estado_agencia check (estado_agencia in ('pendiente', 'aprobada', 'cambios')),
  constraint presentacion_piezas_estado_cliente check (estado_cliente in ('pendiente', 'aprobada', 'cambios')),
  constraint presentacion_piezas_copys_objeto check (jsonb_typeof(copys) = 'object'),
  constraint presentacion_piezas_listas check (
    jsonb_typeof(slides) = 'array' and jsonb_typeof(referencias) = 'array' and jsonb_typeof(assets) = 'array'
    and jsonb_typeof(medios) = 'array' and jsonb_typeof(stickers) = 'array'
  ),
  constraint presentacion_piezas_textos_largo check (char_length(titulo) <= 300 and char_length(instrucciones) <= 20000)
);

-- 4. Comentarios ----------------------------------------------------
-- interno = solo el estudio. Los del cliente (desde su link) van con interno = false.
create table if not exists public.presentacion_comentarios (
  id uuid primary key default gen_random_uuid(),
  presentacion_id uuid not null references public.presentaciones(id) on delete cascade,
  pieza_id uuid references public.presentacion_piezas(id) on delete cascade,
  autor_id uuid default auth.uid() references auth.users(id) on delete set null,
  autor_nombre text not null default '',
  texto text not null,
  interno boolean not null default true,
  resuelto boolean not null default false,
  created_at timestamptz not null default now(),
  constraint presentacion_comentarios_texto check (char_length(texto) between 1 and 4000)
);

-- 5. Carpetas del Drive ---------------------------------------------
-- Para no buscar en Drive cada vez dónde va un archivo: cliente, presentación y día → id de la carpeta.
create table if not exists public.drive_carpetas (
  clave text primary key,
  drive_id text not null,
  created_at timestamptz not null default now()
);

-- 6. Los nombres de antes (constraints e índices de las tablas renombradas) ----------
do $$
declare
  r record;
  nuevo text;
begin
  for r in
    select c.conrelid::regclass::text as tabla, c.conname
      from pg_constraint c
     where c.conrelid in ('public.presentaciones'::regclass, 'public.presentacion_piezas'::regclass, 'public.presentacion_comentarios'::regclass)
       and (c.conname like 'planificaciones%' or c.conname like 'plani\_piezas%' or c.conname like 'plani\_comentarios%')
  loop
    nuevo := regexp_replace(regexp_replace(r.conname, '^planificaciones', 'presentaciones'), '^plani_(piezas|comentarios)', 'presentacion_\1');
    if exists (select 1 from pg_constraint where conname = nuevo) then
      execute format('alter table %s drop constraint %I', r.tabla, r.conname);
    else
      execute format('alter table %s rename constraint %I to %I', r.tabla, r.conname, nuevo);
    end if;
  end loop;
  for r in
    select i.indexname
      from pg_indexes i
     where i.schemaname = 'public'
       and i.tablename in ('presentaciones', 'presentacion_piezas', 'presentacion_comentarios')
       and (i.indexname like 'planificaciones%' or i.indexname like 'plani\_piezas%' or i.indexname like 'plani\_comentarios%')
  loop
    nuevo := regexp_replace(regexp_replace(r.indexname, '^planificaciones', 'presentaciones'), '^plani_(piezas|comentarios)', 'presentacion_\1');
    -- Si ya está el nuevo (lo creó este mismo script), el viejo sobra.
    if to_regclass('public.' || nuevo) is null then
      execute format('alter index public.%I rename to %I', r.indexname, nuevo);
    else
      execute format('drop index public.%I', r.indexname);
    end if;
  end loop;
end $$;

-- Si la tabla es de antes de los banners y los anuncios.
alter table public.presentacion_piezas add column if not exists ancho int;
alter table public.presentacion_piezas add column if not exists alto int;
alter table public.presentacion_piezas add column if not exists anuncio jsonb not null default '{}'::jsonb;
alter table public.presentacion_piezas drop constraint if exists presentacion_piezas_formato;
alter table public.presentacion_piezas add constraint presentacion_piezas_formato
  check (formato in ('post', 'carrusel', 'reel', 'historia', 'banner'));
alter table public.presentacion_piezas drop constraint if exists presentacion_piezas_proporcion;
alter table public.presentacion_piezas add constraint presentacion_piezas_proporcion
  check (proporcion in ('4:5', '1:1', '9:16', '16:9', 'libre'));
alter table public.presentacion_piezas drop constraint if exists presentacion_piezas_medida;
alter table public.presentacion_piezas add constraint presentacion_piezas_medida
  check ((ancho is null or ancho between 10 and 4000) and (alto is null or alto between 10 and 4000));
alter table public.presentacion_piezas drop constraint if exists presentacion_piezas_anuncio;
alter table public.presentacion_piezas add constraint presentacion_piezas_anuncio check (jsonb_typeof(anuncio) = 'object');

create index if not exists presentacion_piezas_presentacion_idx on public.presentacion_piezas (presentacion_id, fecha, orden);
create index if not exists presentacion_comentarios_presentacion_idx on public.presentacion_comentarios (presentacion_id, created_at);

-- El tipo, de la lista de tipos (antes era un texto fijo: plani, pauta o programatica).
alter table public.presentaciones drop constraint if exists presentaciones_tipo;
update public.presentaciones set tipo = 'planificacion' where tipo = 'plani';
alter table public.presentaciones alter column tipo set default 'planificacion';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'presentaciones_tipo_fk') then
    alter table public.presentaciones
      add constraint presentaciones_tipo_fk foreign key (tipo) references public.presentacion_tipos(id) on update cascade;
  end if;
end $$;

-- 7. updated_at automático --------------------------------------------
-- touch_updated_at() es de schema.sql.
drop trigger if exists presentaciones_touch on public.presentaciones;
create trigger presentaciones_touch before update on public.presentaciones
  for each row execute function public.touch_updated_at();

drop trigger if exists presentacion_piezas_touch on public.presentacion_piezas;
create trigger presentacion_piezas_touch before update on public.presentacion_piezas
  for each row execute function public.touch_updated_at();

-- Tocar una pieza también marca la presentación como modificada (para ordenar por "lo último que se tocó").
create or replace function public.presentacion_touch_parent()
returns trigger language plpgsql set search_path = '' as $$
begin
  update public.presentaciones set updated_at = now()
   where id = coalesce(new.presentacion_id, old.presentacion_id);
  return null;
end;
$$;

drop trigger if exists presentacion_piezas_touch_parent on public.presentacion_piezas;
create trigger presentacion_piezas_touch_parent after insert or update or delete on public.presentacion_piezas
  for each row execute function public.presentacion_touch_parent();

-- 8. Permisos: solo el estudio ---------------------------------------
alter table public.presentacion_tipos enable row level security;
alter table public.presentaciones enable row level security;
alter table public.presentacion_piezas enable row level security;
alter table public.presentacion_comentarios enable row level security;
alter table public.drive_carpetas enable row level security;

drop policy if exists "leer el estudio" on public.presentacion_tipos;
drop policy if exists "crear el estudio" on public.presentacion_tipos;
drop policy if exists "editar quien lo creó o un admin" on public.presentacion_tipos;
drop policy if exists "borrar quien lo creó o un admin" on public.presentacion_tipos;
create policy "leer el estudio" on public.presentacion_tipos
  for select to authenticated using ((select public.has_access()));
create policy "crear el estudio" on public.presentacion_tipos
  for insert to authenticated with check ((select public.has_access()));
create policy "editar quien lo creó o un admin" on public.presentacion_tipos
  for update to authenticated
  using ((select public.has_access()) and (creado_por = (select auth.uid()) or (select public.es_admin())))
  with check ((select public.has_access()));
create policy "borrar quien lo creó o un admin" on public.presentacion_tipos
  for delete to authenticated
  using ((select public.has_access()) and (creado_por = (select auth.uid()) or (select public.es_admin())));

drop policy if exists "solo el estudio" on public.presentaciones;
drop policy if exists "solo el estudio" on public.presentacion_piezas;
drop policy if exists "solo el estudio" on public.drive_carpetas;
drop policy if exists "leer el estudio" on public.presentacion_comentarios;
drop policy if exists "comentar el estudio" on public.presentacion_comentarios;
drop policy if exists "resolver el estudio" on public.presentacion_comentarios;
drop policy if exists "borrar los propios" on public.presentacion_comentarios;

create policy "solo el estudio" on public.presentaciones
  for all to authenticated using ((select public.has_access())) with check ((select public.has_access()));
create policy "solo el estudio" on public.presentacion_piezas
  for all to authenticated using ((select public.has_access())) with check ((select public.has_access()));
create policy "solo el estudio" on public.drive_carpetas
  for all to authenticated using ((select public.has_access())) with check ((select public.has_access()));

-- Comentarios: todo el estudio los lee y los resuelve; cada uno escribe con su nombre y borra los suyos.
create policy "leer el estudio" on public.presentacion_comentarios
  for select to authenticated using ((select public.has_access()));
create policy "comentar el estudio" on public.presentacion_comentarios
  for insert to authenticated with check ((select public.has_access()) and autor_id = (select auth.uid()));
create policy "resolver el estudio" on public.presentacion_comentarios
  for update to authenticated using ((select public.has_access())) with check ((select public.has_access()));
create policy "borrar los propios" on public.presentacion_comentarios
  for delete to authenticated using ((select public.has_access()) and autor_id = (select auth.uid()));
