-- ============================================================
-- Retoque: donde espera cada imagen mientras Magnific le quita el fondo
--  - Magnific solo recibe imágenes por URL: el navegador sube la imagen a este bucket privado, el
--    servidor le pasa a Magnific un link firmado que vence a los 10 minutos y la borra apenas termina.
--  - El resultado no se guarda acá: la página lo baja directo (a través de /api/retoque/archivo).
--  - Cada persona solo puede subir, leer y borrar en su carpeta (<id de su cuenta>/…).
-- Correr DESPUÉS de migracion-acceso.sql (usa has_access()).
-- Supabase → SQL Editor → pegar todo → Run. Se puede correr más de una vez.
-- ============================================================

do $$
begin
  if to_regprocedure('public.has_access()') is null then
    raise exception 'Primero corré supabase/migracion-acceso.sql (define has_access()) y volvé a correr esto.';
  end if;
end $$;

-- 1. El bucket ------------------------------------------------
-- Privado (nadie lo lee por URL pública), hasta 20 MB y solo JPG o PNG: lo que acepta Magnific.
-- La página pasa lo demás a JPG antes de subirlo.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('retoque', 'retoque', false, 20971520, array['image/jpeg', 'image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2. Quién puede usarlo -----------------------------------------
-- Solo el estudio, y cada uno en su carpeta: la primera parte de la ruta es el id de su cuenta.
drop policy if exists "retoque de cada uno" on storage.objects;
create policy "retoque de cada uno" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'retoque'
    and (select public.has_access())
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'retoque'
    and (select public.has_access())
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
