-- ============================================================
-- Feature | Perfil (en el historial de migraciones: feature_perfil)
-- El perfil de cada cuenta, pensado para que el estudio se conozca y se encuentre:
--   - Foto: la de Google (la de siempre), la de Basecamp o una subida.
--   - Nombre para mostrar ("Facu" en vez de "Facundo Machado").
--   - Estado: emoji + texto ("🎧 Concentrado"), que se puede borrar solo, y "fuera de oficina hasta…".
--   - Color de acento.
-- Lo del Board (puesto, sector, hub, marcas designadas) no se guarda acá: sale de las tablas del
-- equipo (migracion-equipo.sql) y se cruza por el mail de la cuenta.
-- Todo el estudio lee los perfiles; cada uno edita solo el suyo.
-- Correr DESPUÉS de migracion-usuarios.sql y migracion-acceso.sql (usa has_access()).
-- Supabase → SQL Editor → pegar todo → Run. Se puede correr más de una vez: no mueve datos.
-- ============================================================

do $$
begin
  if to_regclass('public.profiles') is null then
    raise exception 'Primero corré supabase/migracion-usuarios.sql (crea profiles) y volvé a correr esto.';
  end if;
  if to_regprocedure('public.has_access()') is null then
    raise exception 'Primero corré supabase/migracion-acceso.sql (define has_access()) y volvé a correr esto.';
  end if;
end $$;

-- 1. Lo nuevo del perfil ----------------------------------------
alter table public.profiles add column if not exists nombre_visible text;
-- De dónde sale la foto: null o 'google' = la de Google (avatar_url) · 'basecamp' · 'subida'.
alter table public.profiles add column if not exists foto_origen text;
-- La foto elegida (Basecamp o subida). Con 'google' queda vacía y se usa avatar_url.
alter table public.profiles add column if not exists foto_url text;
-- Dónde quedó la subida en el bucket avatares (para borrarla al cambiarla).
alter table public.profiles add column if not exists foto_path text;
alter table public.profiles add column if not exists estado_emoji text;
alter table public.profiles add column if not exists estado_texto text;
-- Cuándo se borra solo el estado (null: queda hasta que lo cambies).
alter table public.profiles add column if not exists estado_vence timestamptz;
-- Fuera de oficina hasta ese día inclusive (null: en la oficina).
alter table public.profiles add column if not exists fuera_hasta date;
alter table public.profiles add column if not exists acento text;
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

alter table public.profiles drop constraint if exists profiles_nombre_visible_largo;
alter table public.profiles add constraint profiles_nombre_visible_largo check (char_length(nombre_visible) <= 60);
alter table public.profiles drop constraint if exists profiles_foto_origen_valido;
alter table public.profiles add constraint profiles_foto_origen_valido check (foto_origen in ('google', 'basecamp', 'subida'));
-- Solo links https (nada de javascript: ni data:), y no muy largos.
alter table public.profiles drop constraint if exists profiles_foto_url_valida;
alter table public.profiles add constraint profiles_foto_url_valida check (foto_url ~ '^https://' and char_length(foto_url) <= 1000);
alter table public.profiles drop constraint if exists profiles_estado_largo;
alter table public.profiles add constraint profiles_estado_largo check (char_length(estado_emoji) <= 16 and char_length(estado_texto) <= 80);
alter table public.profiles drop constraint if exists profiles_acento_hex;
alter table public.profiles add constraint profiles_acento_hex check (acento ~ '^#[0-9A-F]{6}$');

-- 2. Lo que viene de Google no se toca desde la app ---------------
-- El mail es lo que cruza el perfil con el equipo del Board: si se pudiera cambiar, cualquiera podría
-- "ser" otra persona en el Board. El nombre y la foto de Google tampoco: se actualizan solos (punto 3).
-- Solo frena a la app (rol authenticated); el trigger de Google sí puede actualizarlos.
create or replace function public.perfil_proteger()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.id := old.id;
    new.email := old.email;
    new.full_name := old.full_name;
    new.avatar_url := old.avatar_url;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists perfil_proteger on public.profiles;
create trigger perfil_proteger before update on public.profiles
  for each row execute function public.perfil_proteger();

-- 3. La foto y el nombre de Google, siempre al día ----------------
-- Supabase actualiza los datos de Google en cada ingreso: se copian al perfil. Si algo falla, el
-- ingreso sigue igual (nunca se frena un login por esto).
create or replace function public.perfil_desde_google()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  begin
    update public.profiles
       set email = new.email,
           full_name = coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', full_name),
           avatar_url = coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture', avatar_url)
     where id = new.id;
  exception when others then
    null;
  end;
  return new;
end;
$$;

drop trigger if exists on_auth_user_updated_perfil on auth.users;
create trigger on_auth_user_updated_perfil
  after update of raw_user_meta_data, email on auth.users
  for each row
  when (old.raw_user_meta_data is distinct from new.raw_user_meta_data or old.email is distinct from new.email)
  execute function public.perfil_desde_google();

-- 4. Todo el estudio ve los perfiles ------------------------------
-- (Cada uno sigue editando solo el suyo: "perfil propio: editar", de migracion-usuarios.sql.)
drop policy if exists "el estudio lee los perfiles" on public.profiles;
create policy "el estudio lee los perfiles" on public.profiles
  for select to authenticated using ((select public.has_access()));

-- 5. Las fotos subidas ---------------------------------------------
-- Público (las fotos se muestran por su URL), hasta 2 MB y solo imágenes: la página la recorta a un
-- cuadrado chico antes de subirla. Cada uno sube y borra solo en su carpeta (<id de su cuenta>/…).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatares', 'avatares', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatar de cada uno" on storage.objects;
create policy "avatar de cada uno" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'avatares'
    and (select public.has_access())
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatares'
    and (select public.has_access())
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
