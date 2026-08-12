-- ============================================================
-- Tarjetas — esquema completo
-- Pegá TODO esto en Supabase → SQL Editor → Run
-- ============================================================

create extension if not exists "pgcrypto";

-- 1. Marcas -------------------------------------------------
create table if not exists brands (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text not null default '#B61760',
  created_at timestamptz not null default now()
);

-- 2. Categorías ---------------------------------------------
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

-- 3. Tipografías --------------------------------------------
-- Cada archivo subido = una "face". full_name es el nombre que
-- va a viajar al portapapeles (ej: "Montserrat Light").
create table if not exists fonts (
  id uuid primary key default gen_random_uuid(),
  family text not null,                 -- Montserrat
  style_name text not null,             -- Light
  full_name text not null unique,       -- Montserrat Light
  weight int not null default 400,      -- 300
  italic boolean not null default false,
  file_path text not null,              -- storage path
  file_url text not null,               -- url pública
  format text not null default 'woff2', -- woff2 | woff | truetype | opentype
  created_at timestamptz not null default now()
);

-- 4. Tarjetas -----------------------------------------------
create table if not exists cards (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  content_html text not null default '',
  content_text text not null default '',
  category_id uuid references categories(id) on delete set null,
  brand_id uuid references brands(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cards_brand_idx on cards(brand_id);
create index if not exists cards_category_idx on cards(category_id);
create index if not exists cards_updated_idx on cards(updated_at desc);

-- updated_at automático
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists cards_touch on cards;
create trigger cards_touch before update on cards
for each row execute function touch_updated_at();

-- 5. Permisos ------------------------------------------------
-- App interna sin login: cualquiera con el link puede leer/escribir.
-- Si más adelante querés login, borrá estas policies y usá auth.uid().
alter table brands     enable row level security;
alter table categories enable row level security;
alter table fonts      enable row level security;
alter table cards      enable row level security;

drop policy if exists "acceso abierto" on brands;
drop policy if exists "acceso abierto" on categories;
drop policy if exists "acceso abierto" on fonts;
drop policy if exists "acceso abierto" on cards;

create policy "acceso abierto" on brands     for all using (true) with check (true);
create policy "acceso abierto" on categories for all using (true) with check (true);
create policy "acceso abierto" on fonts      for all using (true) with check (true);
create policy "acceso abierto" on cards      for all using (true) with check (true);

-- 6. Storage para los archivos de fuente ---------------------
insert into storage.buckets (id, name, public)
values ('fonts', 'fonts', true)
on conflict (id) do nothing;

drop policy if exists "fonts lectura" on storage.objects;
drop policy if exists "fonts escritura" on storage.objects;

create policy "fonts lectura" on storage.objects
  for select using (bucket_id = 'fonts');
create policy "fonts escritura" on storage.objects
  for all using (bucket_id = 'fonts') with check (bucket_id = 'fonts');

-- 7. Datos de arranque ---------------------------------------
insert into categories (name) values
  ('Autonomía'), ('Seguridad'), ('Tecnología')
on conflict (name) do nothing;

insert into brands (name, color) values
  ('General', '#52525B')
on conflict (name) do nothing;
