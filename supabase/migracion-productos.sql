-- Ejecutá esto en Supabase → SQL Editor si YA habías corrido schema.sql.
-- Si arrancás de cero, schema.sql ya lo incluye.

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand_id uuid not null references brands(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Un modelo es único dentro de su marca, no en todo el sistema:
-- dos marcas distintas pueden tener un modelo con el mismo nombre.
create unique index if not exists products_brand_name_idx
  on products (brand_id, lower(name));

create index if not exists products_brand_idx on products(brand_id);

alter table cards add column if not exists product_id uuid references products(id) on delete set null;
create index if not exists cards_product_idx on cards(product_id);

alter table products enable row level security;
drop policy if exists "acceso abierto" on products;
create policy "acceso abierto" on products for all using (true) with check (true);

-- Por si venís de una versión anterior
alter table fonts add column if not exists is_variable boolean not null default false;
