-- ============================================================
-- Clientes: la ficha de cada cliente (logo, colores, tipografías y notas)
-- Los clientes son la tabla brands de siempre (en Tarjetas se llamaban marcas):
-- esto solo le suma columnas y un lugar para los logos.
-- Supabase → SQL Editor → pegar todo → Run. Se puede correr más de una vez,
-- antes o después de migracion-acceso.sql.
-- ============================================================

-- 1. La ficha -------------------------------------------------
alter table public.brands add column if not exists logo_url text;
-- Ruta del archivo en el bucket logos: para borrarlo al cambiarlo o al borrar el cliente.
alter table public.brands add column if not exists logo_path text;
-- Sobre qué fondo se ve bien el logo: light (papel), dark (negro) o brand (su color). Un logo
-- blanco sobre papel no se ve.
alter table public.brands add column if not exists logo_bg text not null default 'light';
-- Los colores de la marca: [{ "hex": "#B61760", "name": "Magenta" }, …]. `color` sigue siendo
-- el que identifica al cliente en las listas (el puntito).
alter table public.brands add column if not exists palette jsonb not null default '[]'::jsonb;
-- Las familias de sus tipografías ("Montserrat"). Por nombre y no por id: una familia puede ser
-- de varios clientes, y se puede anotar una que todavía no se subió.
alter table public.brands add column if not exists font_families text[] not null default '{}';
-- Tono, contactos, links… lo que haga falta tener a mano.
alter table public.brands add column if not exists notes text not null default '';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'brands_palette_is_array') then
    alter table public.brands add constraint brands_palette_is_array check (jsonb_typeof(palette) = 'array');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'brands_logo_bg_valid') then
    alter table public.brands add constraint brands_logo_bg_valid check (logo_bg in ('light', 'dark', 'brand'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'brands_notes_length') then
    alter table public.brands add constraint brands_notes_length check (char_length(notes) <= 20000);
  end if;
end $$;

-- 2. Logos ----------------------------------------------------
-- Público como el de tipografías: los logos se muestran por su URL. Hasta 5 MB y solo imágenes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', true, 5242880, array['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Quién puede subir, cambiar o borrar logos: lo mismo que con el resto de los datos.
-- Con migracion-acceso.sql ya corrida, solo el estudio; si todavía no, como las tipografías
-- (abierto). migracion-acceso.sql también lo cierra, así que el orden no importa.
drop policy if exists "logos del estudio" on storage.objects;
do $$
begin
  if to_regprocedure('public.has_access()') is not null then
    create policy "logos del estudio" on storage.objects
      for all to authenticated
      using (bucket_id = 'logos' and (select public.has_access()))
      with check (bucket_id = 'logos' and (select public.has_access()));
  else
    create policy "logos del estudio" on storage.objects
      for all
      using (bucket_id = 'logos')
      with check (bucket_id = 'logos');
  end if;
end $$;
