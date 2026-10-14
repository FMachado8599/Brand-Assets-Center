-- ============================================================
-- Planificación: las planis mensuales de contenido de cada cliente.
-- Reemplaza a la presentación de Google Slides: cada pieza (post, carrusel, reel o historia)
-- tiene su fecha, sus plataformas, su copy, las indicaciones para diseño y el material final.
-- Correr DESPUÉS de migracion-acceso.sql (usa has_access()).
-- Supabase → SQL Editor → pegar todo → Run. Se puede correr más de una vez.
-- ============================================================

-- 1. La planificación -------------------------------------------
-- Una por cliente y mes (puede haber más de una: una plani y una pauta del mismo mes).
create table if not exists public.planificaciones (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  titulo text not null default '',
  -- plani: contenido orgánico · pauta: contenido pautado · programatica: programática / YouTube
  tipo text not null default 'plani',
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
  constraint planificaciones_tipo check (tipo in ('plani', 'pauta', 'programatica')),
  constraint planificaciones_mes check (mes between 1 and 12),
  constraint planificaciones_anio check (anio between 2020 and 2100),
  constraint planificaciones_estado check (estado in ('redaccion', 'diseno', 'revision', 'cliente', 'programacion', 'lista')),
  constraint planificaciones_titulo_largo check (char_length(titulo) <= 200),
  constraint planificaciones_notas_largo check (char_length(notas) <= 20000)
);

create index if not exists planificaciones_cliente_idx on public.planificaciones (brand_id, anio desc, mes desc);
create index if not exists planificaciones_tarea_idx on public.planificaciones (bc_tarea_id) where bc_tarea_id is not null;

-- 2. Las piezas -------------------------------------------------
-- Cada publicación de la plani. Se agrupan por fecha en la app (el "día" de la presentación).
create table if not exists public.plani_piezas (
  id uuid primary key default gen_random_uuid(),
  plani_id uuid not null references public.planificaciones(id) on delete cascade,
  fecha date not null,
  hora time,
  orden int not null default 0,
  formato text not null,
  -- post y carrusel: 4:5 o 1:1 · reel e historia: 9:16
  proporcion text not null default '4:5',
  plataformas text[] not null default '{instagram}',
  titulo text not null default '',
  -- El copy de cada plataforma: { "instagram": "…", "tiktok": "…" }
  copys jsonb not null default '{}'::jsonb,
  -- Indicaciones para diseño (en un carrusel, las generales; las de cada slide van en slides).
  instrucciones text not null default '',
  -- Carrusel: [{ "instruccion": "…" }, …] — una por slide.
  slides jsonb not null default '[]'::jsonb,
  -- Links de referencia (Pinterest, ejemplos) y de assets (fotos, logos, carpetas): [{ "id", "url", "label" }]
  referencias jsonb not null default '[]'::jsonb,
  assets jsonb not null default '[]'::jsonb,
  -- El material final, en el Drive del estudio: [{ "id", "drive_id", "nombre", "mime", "tamano", "ancho", "alto", "rol" }]
  -- rol: "final" (imágenes o video, en orden) o "portada" (la tapa de un reel).
  medios jsonb not null default '[]'::jsonb,
  -- Stickers de historia (link, encuesta, pregunta, cuenta regresiva…), con su posición sobre la pieza.
  stickers jsonb not null default '[]'::jsonb,
  -- Una historia que adapta un post del mismo día: hereda la idea y diseño la arma junto.
  adapta_de uuid references public.plani_piezas(id) on delete set null,
  estado_agencia text not null default 'pendiente',
  estado_cliente text not null default 'pendiente',
  programada boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plani_piezas_formato check (formato in ('post', 'carrusel', 'reel', 'historia')),
  constraint plani_piezas_proporcion check (proporcion in ('4:5', '1:1', '9:16', '16:9')),
  constraint plani_piezas_estado_agencia check (estado_agencia in ('pendiente', 'aprobada', 'cambios')),
  constraint plani_piezas_estado_cliente check (estado_cliente in ('pendiente', 'aprobada', 'cambios')),
  constraint plani_piezas_copys_objeto check (jsonb_typeof(copys) = 'object'),
  constraint plani_piezas_listas check (
    jsonb_typeof(slides) = 'array' and jsonb_typeof(referencias) = 'array' and jsonb_typeof(assets) = 'array'
    and jsonb_typeof(medios) = 'array' and jsonb_typeof(stickers) = 'array'
  ),
  constraint plani_piezas_textos_largo check (char_length(titulo) <= 300 and char_length(instrucciones) <= 20000)
);

create index if not exists plani_piezas_plani_idx on public.plani_piezas (plani_id, fecha, orden);

-- 3. Comentarios ------------------------------------------------
-- interno = solo el estudio. Los del cliente (cuando tenga su página) van con interno = false.
create table if not exists public.plani_comentarios (
  id uuid primary key default gen_random_uuid(),
  plani_id uuid not null references public.planificaciones(id) on delete cascade,
  pieza_id uuid references public.plani_piezas(id) on delete cascade,
  autor_id uuid default auth.uid() references auth.users(id) on delete set null,
  autor_nombre text not null default '',
  texto text not null,
  interno boolean not null default true,
  resuelto boolean not null default false,
  created_at timestamptz not null default now(),
  constraint plani_comentarios_texto check (char_length(texto) between 1 and 4000)
);

create index if not exists plani_comentarios_plani_idx on public.plani_comentarios (plani_id, created_at);

-- 4. Carpetas del Drive -----------------------------------------
-- Para no buscar en Drive cada vez dónde va un archivo: cliente, plani y día → id de la carpeta.
create table if not exists public.drive_carpetas (
  clave text primary key,
  drive_id text not null,
  created_at timestamptz not null default now()
);

-- 5. updated_at automático ----------------------------------------
-- touch_updated_at() es de schema.sql.
drop trigger if exists planificaciones_touch on public.planificaciones;
create trigger planificaciones_touch before update on public.planificaciones
  for each row execute function public.touch_updated_at();

drop trigger if exists plani_piezas_touch on public.plani_piezas;
create trigger plani_piezas_touch before update on public.plani_piezas
  for each row execute function public.touch_updated_at();

-- Tocar una pieza también marca la plani como modificada (para ordenar por "lo último que se tocó").
create or replace function public.plani_touch_parent()
returns trigger language plpgsql set search_path = '' as $$
begin
  update public.planificaciones set updated_at = now()
   where id = coalesce(new.plani_id, old.plani_id);
  return null;
end;
$$;

drop trigger if exists plani_piezas_touch_parent on public.plani_piezas;
create trigger plani_piezas_touch_parent after insert or update or delete on public.plani_piezas
  for each row execute function public.plani_touch_parent();

-- 6. Permisos: solo el estudio ------------------------------------
alter table public.planificaciones enable row level security;
alter table public.plani_piezas enable row level security;
alter table public.plani_comentarios enable row level security;
alter table public.drive_carpetas enable row level security;

drop policy if exists "solo el estudio" on public.planificaciones;
drop policy if exists "solo el estudio" on public.plani_piezas;
drop policy if exists "solo el estudio" on public.drive_carpetas;
drop policy if exists "leer el estudio" on public.plani_comentarios;
drop policy if exists "comentar el estudio" on public.plani_comentarios;
drop policy if exists "resolver el estudio" on public.plani_comentarios;
drop policy if exists "borrar los propios" on public.plani_comentarios;

create policy "solo el estudio" on public.planificaciones
  for all to authenticated using ((select public.has_access())) with check ((select public.has_access()));
create policy "solo el estudio" on public.plani_piezas
  for all to authenticated using ((select public.has_access())) with check ((select public.has_access()));
create policy "solo el estudio" on public.drive_carpetas
  for all to authenticated using ((select public.has_access())) with check ((select public.has_access()));

-- Comentarios: todo el estudio los lee y los resuelve; cada uno escribe con su nombre y borra los suyos.
create policy "leer el estudio" on public.plani_comentarios
  for select to authenticated using ((select public.has_access()));
create policy "comentar el estudio" on public.plani_comentarios
  for insert to authenticated with check ((select public.has_access()) and autor_id = (select auth.uid()));
create policy "resolver el estudio" on public.plani_comentarios
  for update to authenticated using ((select public.has_access())) with check ((select public.has_access()));
create policy "borrar los propios" on public.plani_comentarios
  for delete to authenticated using ((select public.has_access()) and autor_id = (select auth.uid()));
