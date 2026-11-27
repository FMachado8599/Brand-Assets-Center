-- ============================================================
-- Material de marca: PDFs, presentaciones, logos (variaciones) y assets de cada cliente
--  - Los archivos van a un bucket privado (material); acá queda la lista, con el texto que
--    se leyó de cada documento para que la IA de Redacción escriba con el tono de la marca.
--  - Se ve y se edita desde la ficha del cliente (Clientes → el cliente → Material de marca).
-- Correr DESPUÉS de migracion-acceso.sql y migracion-clientes.sql (usa has_access() y brands).
-- Supabase → SQL Editor → pegar todo → Run. Se puede correr más de una vez.
-- ============================================================

do $$
begin
  if to_regprocedure('public.has_access()') is null then
    raise exception 'Primero corré supabase/migracion-acceso.sql (define has_access()) y volvé a correr esto.';
  end if;
end $$;

-- 1. La lista --------------------------------------------------
create table if not exists public.brand_materials (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  -- documento (PDF, Word, texto), presentacion, logo (una variación) o asset (imágenes, archivos de diseño…)
  kind text not null check (kind in ('documento', 'presentacion', 'logo', 'asset')),
  -- Cómo se ve en la lista; se puede cambiar. file_name es el del archivo original.
  name text not null check (char_length(name) between 1 and 200),
  file_name text not null check (char_length(file_name) <= 300),
  -- Ruta del archivo en el bucket material: para abrirlo y para borrarlo.
  file_path text not null unique,
  mime text not null default '',
  size_bytes bigint not null default 0,
  -- Lo que hay que saber para usarlo ("versión blanca, para fondos oscuros"). La IA también lo lee.
  note text not null default '' check (char_length(note) <= 600),
  -- Si la IA de Redacción lo tiene en cuenta (su texto y su nota).
  use_ai boolean not null default true,
  -- El texto que se leyó del archivo en el navegador al subirlo (vacío en imágenes y escaneos).
  text_content text not null default '' check (char_length(text_content) <= 200000),
  text_chars integer generated always as (char_length(text_content)) stored,
  created_at timestamptz not null default now()
);

create index if not exists brand_materials_brand_idx on public.brand_materials(brand_id, created_at desc);

-- 2. Quién puede ------------------------------------------------
alter table public.brand_materials enable row level security;
drop policy if exists "solo el estudio" on public.brand_materials;
create policy "solo el estudio" on public.brand_materials
  for all to authenticated using ((select public.has_access())) with check ((select public.has_access()));

-- 3. Los archivos -----------------------------------------------
-- Privado: son documentos de clientes. Se abren con links firmados que duran una hora.
-- Hasta 30 MB por archivo (el tope de Supabase en el plan gratis es 50 MB).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('material', 'material', false, 31457280, null)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "material del estudio" on storage.objects;
create policy "material del estudio" on storage.objects
  for all to authenticated
  using (bucket_id = 'material' and (select public.has_access()))
  with check (bucket_id = 'material' and (select public.has_access()));
