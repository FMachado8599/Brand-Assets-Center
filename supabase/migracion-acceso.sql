-- ============================================================
-- Acceso: solo se crean cuentas con mail @camaratbwa.com
-- (más las excepciones que se carguen en allowed_emails).
-- Correr DESPUÉS de migracion-usuarios.sql.
-- Supabase → SQL Editor → pegar todo → Run. Se puede correr más de una vez.
--
-- Solo frena cuentas NUEVAS: las que ya existían siguen entrando.
-- Para sacarle el acceso a alguien de afuera, se borra su usuario en
-- Authentication → Users.
-- ============================================================

-- Excepciones: mails de afuera del dominio que igual pueden crear cuenta
-- (ej: un freelance). Se cargan desde el SQL Editor, en minúsculas:
--   insert into public.allowed_emails (email, note) values ('alguien@gmail.com', 'Freelance de diseño');
create table if not exists public.allowed_emails (
  email text primary key check (email = lower(email)),
  note text,
  created_at timestamptz not null default now()
);

-- Sin políticas: desde la app no se puede leer ni tocar, solo desde el panel de Supabase.
alter table public.allowed_emails enable row level security;

-- Corre antes de crear cada usuario. Si el mail no es del dominio ni está en
-- la lista, la cuenta no se crea y la app muestra "Esa cuenta no tiene acceso".
create or replace function public.check_signup_allowed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if lower(split_part(coalesce(new.email, ''), '@', 2)) = 'camaratbwa.com'
     or exists (select 1 from public.allowed_emails a where a.email = lower(new.email)) then
    return new;
  end if;
  raise exception 'Herramientas: % no tiene acceso (solo cuentas @camaratbwa.com)', coalesce(new.email, 'sin mail');
end;
$$;

drop trigger if exists check_signup_allowed on auth.users;
create trigger check_signup_allowed before insert on auth.users
  for each row execute function public.check_signup_allowed();
