-- ============================================================
-- Feature | Correo (en el historial de migraciones: feature_correo)
-- La casilla @camaratbwa.com de cada uno, adentro de la app: leer, responder y mandar.
--
-- El correo vive en el servidor de ProLinux (mail.camaratbwa.com, IMAP 993 y SMTP 465, los mismos
-- datos que usa Outlook). La app no copia los mails: cada vez que abrís la bandeja se conecta a ese
-- servidor con tu usuario y tu contraseña del correo, así que lo que hacés acá se ve en Outlook y al revés.
--
-- Acá se guarda solo qué casilla conectó cada uno y su contraseña, cifrada (AES-256-GCM, la clave vive
-- solo en el servidor, en INTEGRACIONES_SECRET): leer esta tabla no alcanza para entrar al correo.
-- Cada uno ve y toca solo su fila, y solo puede conectar el mail con el que entró a la app.
--
-- Correr DESPUÉS de migracion-acceso.sql (usa has_access()).
-- Supabase → SQL Editor → pegar todo → Run. Se puede correr más de una vez: no mueve datos.
-- ============================================================

do $$
begin
  if to_regprocedure('public.has_access()') is null then
    raise exception 'Primero corré supabase/migracion-acceso.sql (define has_access()) y volvé a correr esto.';
  end if;
end $$;

-- 1. La casilla de cada uno -------------------------------------
create table if not exists public.correo_cuentas (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  -- El mail de la casilla: siempre el mismo con el que entró a la app (lo frena la política de abajo).
  email text not null,
  -- La contraseña del correo, cifrada por el servidor ("v1.<iv>.<tag>.<cifrado>").
  password text not null,
  conectada timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.correo_cuentas drop constraint if exists correo_cuentas_email_valido;
alter table public.correo_cuentas add constraint correo_cuentas_email_valido
  check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+$' and char_length(email) <= 200);
alter table public.correo_cuentas drop constraint if exists correo_cuentas_password_cifrada;
alter table public.correo_cuentas add constraint correo_cuentas_password_cifrada
  check (password like 'v1.%' and char_length(password) <= 2000);

-- 2. Cada uno, solo lo suyo ---------------------------------------
alter table public.correo_cuentas enable row level security;

drop policy if exists "correo_cuentas propia" on public.correo_cuentas;
create policy "correo_cuentas propia" on public.correo_cuentas
  for all to authenticated
  using (user_id = (select auth.uid()) and (select public.has_access()))
  with check (
    user_id = (select auth.uid())
    and email = lower((select auth.jwt()) ->> 'email')
    and (select public.has_access())
  );

-- Sin sesión no hay nada que ver.
revoke all on public.correo_cuentas from anon;
