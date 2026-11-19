-- ============================================================
-- Clientes: varios logos por cliente, en grupos y con todos sus formatos
-- Cada logo (horizontal, isotipo, negativo…) tiene sus archivos: SVG, AI, EPS, PDF, PNG, JPG,
-- WEBP o GIF. El logo de siempre (logo_url) sigue siendo la cara del cliente en la app.
-- Supabase → SQL Editor → pegar todo → Run. Se puede correr más de una vez.
-- Va después de migracion-clientes.sql (usa la ficha de brands y su bucket logos).
-- No toca permisos: los logos siguen siendo solo del estudio, como el resto de brands.
-- ============================================================

-- 1. Los logos --------------------------------------------------
-- [{ "id": "k3j2a9", "name": "Horizontal", "group": "p1x0", "bg": "light",
--    "files": [{ "format": "svg", "path": "…", "url": "…", "name": "horizontal.svg", "size": 4120 },
--              { "format": "png", "path": "…", "url": "…", "name": "horizontal.png", "size": 81234, "w": 2048, "h": 1024 }] }]
-- Ver lib/types.ts (BrandLogo). Los archivos van al bucket logos, como el de siempre.
alter table public.brands add column if not exists logos jsonb not null default '[]'::jsonb;
-- Los grupos, en orden: [{ "id": "p1x0", "name": "Principal" }]. Un logo sin grupo tiene "group": null.
alter table public.brands add column if not exists logo_groups jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'brands_logos_is_array') then
    alter table public.brands add constraint brands_logos_is_array
      check (jsonb_typeof(logos) = 'array' and jsonb_array_length(logos) <= 300 and char_length(logos::text) <= 500000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'brands_logo_groups_is_array') then
    alter table public.brands add constraint brands_logo_groups_is_array
      check (jsonb_typeof(logo_groups) = 'array' and jsonb_array_length(logo_groups) <= 40);
  end if;
end $$;

-- 2. El bucket acepta los formatos de imprenta ------------------
-- Además de las imágenes: PDF, y AI y EPS (los dos se suben como application/postscript).
-- Hasta 50 MB por archivo (un AI con imágenes adentro pesa). El logo de arriba sigue
-- limitado a 5 MB e imágenes desde la app.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'logos', 'logos', true, 52428800,
  array['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf', 'application/postscript']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- PostgREST lee las columnas nuevas recién al recargar su esquema.
notify pgrst, 'reload schema';
