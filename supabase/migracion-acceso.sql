-- ============================================================
-- Acceso: Herramientas es solo para el estudio.
--  - Solo se crean cuentas con mail @camaratbwa.com (más las excepciones de allowed_emails).
--  - Tarjetas, marcas, productos, categorías y fuentes: solo se leen y editan con
--    sesión de alguien del estudio (antes cualquiera con la clave pública podía).
-- Correr DESPUÉS de schema.sql y de las migraciones anteriores.
-- Supabase → SQL Editor → pegar todo → Run. Se puede correr más de una vez.
--
-- Una cuenta de afuera que ya existía no puede usar nada (la app le cierra la sesión).
-- Para que alguien de afuera entre, agregalo a la lista de excepciones (en minúsculas):
--   insert into public.allowed_emails (email, note) values ('alguien@gmail.com', 'Freelance de diseño');
-- Para sacarle el acceso: borrarlo de allowed_emails (y si querés, su usuario en Authentication → Users).
-- ============================================================

-- 1. Excepciones ------------------------------------------------
create table if not exists public.allowed_emails (
  email text primary key check (email = lower(email)),
  note text,
  created_at timestamptz not null default now()
);

-- Sin políticas: desde la app no se puede leer ni tocar, solo desde el panel de Supabase.
alter table public.allowed_emails enable row level security;

-- 2. ¿Este mail es del estudio? --------------------------------
-- El parámetro no se llama "email" a propósito: chocaría con la columna de allowed_emails.
create or replace function public.email_allowed(addr text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(
    lower(split_part(addr, '@', 2)) = 'camaratbwa.com'
      or exists (select 1 from public.allowed_emails a where a.email = lower(addr)),
    false
  );
$$;

-- La sesión del pedido actual es del estudio. La usan las políticas de abajo y la app.
create or replace function public.has_access()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.email_allowed(auth.jwt() ->> 'email');
$$;

-- 3. Solo el estudio crea cuentas -------------------------------
-- Corre antes de crear cada usuario: si el mail no está habilitado, la cuenta no se crea
-- y la app muestra "Esa cuenta no tiene acceso".
create or replace function public.check_signup_allowed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if public.email_allowed(new.email) then
    return new;
  end if;
  raise exception 'Herramientas: % no tiene acceso (solo cuentas @camaratbwa.com)', coalesce(new.email, 'sin mail');
end;
$$;

drop trigger if exists check_signup_allowed on auth.users;
create trigger check_signup_allowed before insert on auth.users
  for each row execute function public.check_signup_allowed();

-- 4. Datos compartidos: solo con sesión del estudio -------------
-- Reemplaza a las políticas "acceso abierto" de schema.sql.
-- El (select …) hace que la función se evalúe una vez por consulta, no una por fila.
drop policy if exists "acceso abierto" on public.brands;
drop policy if exists "acceso abierto" on public.products;
drop policy if exists "acceso abierto" on public.categories;
drop policy if exists "acceso abierto" on public.fonts;
drop policy if exists "acceso abierto" on public.cards;

-- Las que se crearon a mano en producción el 2026-10-12 ("cualquiera con sesión"): sin
-- borrarlas, se sumarían a "solo el estudio" y una cuenta de afuera seguiría entrando.
drop policy if exists "equipo con sesion" on public.brands;
drop policy if exists "equipo con sesion" on public.products;
drop policy if exists "equipo con sesion" on public.categories;
drop policy if exists "equipo con sesion" on public.fonts;
drop policy if exists "equipo con sesion" on public.cards;

drop policy if exists "solo el estudio" on public.brands;
drop policy if exists "solo el estudio" on public.products;
drop policy if exists "solo el estudio" on public.categories;
drop policy if exists "solo el estudio" on public.fonts;
drop policy if exists "solo el estudio" on public.cards;

create policy "solo el estudio" on public.brands
  for all to authenticated using ((select public.has_access())) with check ((select public.has_access()));
create policy "solo el estudio" on public.products
  for all to authenticated using ((select public.has_access())) with check ((select public.has_access()));
create policy "solo el estudio" on public.categories
  for all to authenticated using ((select public.has_access())) with check ((select public.has_access()));
create policy "solo el estudio" on public.fonts
  for all to authenticated using ((select public.has_access())) with check ((select public.has_access()));
create policy "solo el estudio" on public.cards
  for all to authenticated using ((select public.has_access())) with check ((select public.has_access()));

-- 5. Archivos de tipografías ------------------------------------
-- Se siguen mostrando por su URL pública (el bucket es público y así las carga el navegador),
-- pero solo el estudio puede listarlos, subirlos, cambiarlos o borrarlos.
drop policy if exists "fonts lectura" on storage.objects;
drop policy if exists "fonts escritura" on storage.objects;
drop policy if exists "fonts subir" on storage.objects;
drop policy if exists "fonts actualizar" on storage.objects;
drop policy if exists "fonts borrar" on storage.objects;
drop policy if exists "fonts del estudio" on storage.objects;
create policy "fonts del estudio" on storage.objects
  for all to authenticated
  using (bucket_id = 'fonts' and (select public.has_access()))
  with check (bucket_id = 'fonts' and (select public.has_access()));

-- 6. Logos de los clientes --------------------------------------
-- Igual que las tipografías. El bucket lo crea migracion-clientes.sql; la política
-- se puede crear antes (solo nombra al bucket), así el orden de las dos no importa.
drop policy if exists "logos leer" on storage.objects;
drop policy if exists "logos subir" on storage.objects;
drop policy if exists "logos actualizar" on storage.objects;
drop policy if exists "logos borrar" on storage.objects;
drop policy if exists "logos del estudio" on storage.objects;
create policy "logos del estudio" on storage.objects
  for all to authenticated
  using (bucket_id = 'logos' and (select public.has_access()))
  with check (bucket_id = 'logos' and (select public.has_access()));
