-- ============================================================
-- Integraciones: Basecamp (proyectos → clientes, tareas, gente) y el Drive del estudio.
-- Una sola conexión por servicio para todo el estudio: la hace un admin desde la app y queda
-- guardada acá, con los tokens cifrados (la clave para descifrarlos vive solo en el servidor,
-- en INTEGRACIONES_SECRET: leer esta tabla no alcanza para usar las cuentas).
-- Las tablas bc_* son una copia de Basecamp: se pueden vaciar y volver a sincronizar sin perder
-- nada propio (lo propio vive en brands, planificaciones, etc.).
-- Correr DESPUÉS de migracion-acceso.sql (usa has_access()).
-- Supabase → SQL Editor → pegar todo → Run. Se puede correr más de una vez.
-- ============================================================

-- 1. Conexiones ---------------------------------------------------
create table if not exists public.integraciones (
  proveedor text primary key,
  -- Basecamp: id y nombre de la cuenta (bc3) · Google: el mail de la cuenta conectada.
  cuenta_id text,
  cuenta_nombre text,
  conectada_por text,
  access_token text not null,
  refresh_token text,
  expira timestamptz,
  -- Lo que haga falta recordar de cada una (ej: la carpeta raíz del Drive).
  datos jsonb not null default '{}'::jsonb,
  conectada timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integraciones_proveedor check (proveedor in ('basecamp', 'google'))
);

-- 2. Basecamp: proyectos --------------------------------------------
-- Cada proyecto es un cliente (brand_id). Los que no son clientes (internos) se marcan ignorado.
create table if not exists public.bc_proyectos (
  id bigint primary key,
  nombre text not null,
  descripcion text,
  estado text not null default 'active',
  app_url text,
  brand_id uuid references public.brands(id) on delete set null,
  ignorado boolean not null default false,
  creado timestamptz,
  actualizado timestamptz,
  sincronizado timestamptz not null default now()
);
create index if not exists bc_proyectos_brand_idx on public.bc_proyectos (brand_id);

-- 3. Gente de la cuenta (para mostrar quién está asignado y vincular cada mail del estudio).
create table if not exists public.bc_personas (
  id bigint primary key,
  nombre text not null,
  email text,
  avatar_url text,
  cargo text,
  empresa text,
  admin boolean not null default false,
  cliente boolean not null default false,
  sincronizado timestamptz not null default now()
);
create index if not exists bc_personas_email_idx on public.bc_personas (lower(email));

-- 4. Tableros (Card Tables): uno por sector dentro de cada proyecto (Digital, Arte, Creatividad…).
create table if not exists public.bc_tableros (
  id bigint primary key,
  proyecto_id bigint not null references public.bc_proyectos(id) on delete cascade,
  nombre text not null,
  url text,
  -- La última vez que se leyeron sus columnas (para no pedirlas en cada sincronización).
  columnas_leidas timestamptz
);
create index if not exists bc_tableros_proyecto_idx on public.bc_tableros (proyecto_id);

-- 5. Columnas de cada tablero. estado = la etapa normalizada (los nombres cambian de un proyecto a
-- otro: "Validación Interna", "VALIDACIÓN INTERNA"…); null si es una columna propia de ese proyecto.
create table if not exists public.bc_columnas (
  id bigint primary key,
  tablero_id bigint references public.bc_tableros(id) on delete cascade,
  proyecto_id bigint references public.bc_proyectos(id) on delete cascade,
  nombre text not null,
  estado text,
  posicion int
);
create index if not exists bc_columnas_tablero_idx on public.bc_columnas (tablero_id);

-- 6. Tareas (cards) -------------------------------------------------
create table if not exists public.bc_tareas (
  id bigint primary key,
  proyecto_id bigint not null references public.bc_proyectos(id) on delete cascade,
  columna_id bigint,
  titulo text not null default '',
  -- El brief, tal como está en Basecamp (HTML).
  contenido text,
  app_url text,
  vence date,
  completada boolean not null default false,
  asignados bigint[] not null default '{}',
  creador_id bigint,
  comentarios int not null default 0,
  creada timestamptz,
  actualizada timestamptz,
  sincronizada timestamptz not null default now()
);
create index if not exists bc_tareas_proyecto_idx on public.bc_tareas (proyecto_id, actualizada desc);
create index if not exists bc_tareas_asignados_idx on public.bc_tareas using gin (asignados);

-- 7. Estado de la sincronización -------------------------------------
create table if not exists public.bc_sync (
  id text primary key default 'basecamp',
  -- Hasta cuándo están las tareas al día (la próxima vez se pide solo lo que cambió después).
  tareas_hasta timestamptz,
  ultimo timestamptz,
  ultimo_error text,
  resumen jsonb not null default '{}'::jsonb,
  corriendo_desde timestamptz,
  constraint bc_sync_unica check (id = 'basecamp')
);

-- Toma el turno de sincronizar: si otro lo está haciendo (hace menos de 2 minutos), devuelve false.
create or replace function public.bc_tomar_sync()
returns boolean language plpgsql security definer set search_path = '' as $$
declare ok boolean;
begin
  if not public.has_access() then
    return false;
  end if;
  insert into public.bc_sync (id) values ('basecamp') on conflict (id) do nothing;
  update public.bc_sync
     set corriendo_desde = now()
   where id = 'basecamp'
     and (corriendo_desde is null or corriendo_desde < now() - interval '2 minutes')
  returning true into ok;
  return coalesce(ok, false);
end;
$$;

-- 8. Permisos: solo el estudio ---------------------------------------
alter table public.integraciones enable row level security;
alter table public.bc_proyectos enable row level security;
alter table public.bc_personas enable row level security;
alter table public.bc_tableros enable row level security;
alter table public.bc_columnas enable row level security;
alter table public.bc_tareas enable row level security;
alter table public.bc_sync enable row level security;

do $$
declare t text;
begin
  foreach t in array array['integraciones', 'bc_proyectos', 'bc_personas', 'bc_tableros', 'bc_columnas', 'bc_tareas', 'bc_sync']
  loop
    execute format('drop policy if exists "solo el estudio" on public.%I', t);
    execute format(
      'create policy "solo el estudio" on public.%I for all to authenticated using ((select public.has_access())) with check ((select public.has_access()))',
      t
    );
  end loop;
end $$;

revoke execute on function public.bc_tomar_sync() from anon;
