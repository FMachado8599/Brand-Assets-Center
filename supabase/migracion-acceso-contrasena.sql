-- ============================================================
-- Logic | Acceso con contraseña (en el historial de migraciones: logic_acceso_contrasena)
-- Quién puede entrar ya no es solo @camaratbwa.com: un admin elige dominios enteros (@agencia.com)
-- y mails sueltos. Y además de Google, se puede entrar con mail y contraseña.
--
-- Las contraseñas NO las guarda Supabase (usa bcrypt y no se puede cambiar): las verifica el servidor
-- de la app con Argon2id (64 MiB, 3 pasadas, paralelismo 1, salt de 16 bytes) sobre un HMAC-SHA-256
-- con un pepper que vive en las variables de entorno (nunca en la base ni en el código). Acá se guarda
-- solo el hash en formato PHC ($argon2id$v=19$m=…,t=…,p=…$salt$hash), que incluye el salt y los
-- parámetros para verificarlo. Nunca la contraseña.
--
-- Las tablas de contraseñas, links y intentos no tienen políticas: desde la app (anon/authenticated) no
-- se leen ni se tocan. Solo el servidor, con la clave de servicio (SUPABASE_SERVICE_ROLE_KEY).
-- Correr DESPUÉS de migracion-acceso.sql y migracion-equipo.sql (usa es_admin()).
-- Supabase → SQL Editor → pegar todo → Run. Se puede correr más de una vez: no mueve datos.
-- ============================================================

do $$
begin
  if to_regclass('public.allowed_emails') is null or to_regprocedure('public.email_allowed(text)') is null then
    raise exception 'Primero corré supabase/migracion-acceso.sql y volvé a correr esto.';
  end if;
  if to_regprocedure('public.es_admin()') is null then
    raise exception 'Primero corré supabase/migracion-equipo.sql (define es_admin()) y volvé a correr esto.';
  end if;
end $$;

-- 1. Dominios permitidos ------------------------------------------
-- Todo el que tenga un mail de estos dominios puede entrar (con Google o creando su contraseña).
-- camaratbwa.com está siempre (también en email_allowed): no se puede sacar desde la app.
create table if not exists public.allowed_domains (
  domain text primary key check (domain = lower(domain) and domain ~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$'),
  note text check (char_length(note) <= 120),
  created_at timestamptz not null default now()
);
alter table public.allowed_domains enable row level security;

insert into public.allowed_domains (domain, note) values ('camaratbwa.com', 'El estudio')
on conflict (domain) do nothing;

alter table public.allowed_emails add column if not exists created_at timestamptz not null default now();
alter table public.allowed_emails drop constraint if exists allowed_emails_note_largo;
alter table public.allowed_emails add constraint allowed_emails_note_largo check (char_length(note) <= 120);

-- ¿Este mail puede entrar? Su dominio está permitido o el mail está en la lista.
create or replace function public.email_allowed(addr text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(
    lower(split_part(addr, '@', 2)) = 'camaratbwa.com'
      or exists (select 1 from public.allowed_domains d where d.domain = lower(split_part(addr, '@', 2)))
      or exists (select 1 from public.allowed_emails a where a.email = lower(addr)),
    false
  );
$$;

-- El aviso cuando alguien sin acceso intenta crearse una cuenta (antes nombraba solo @camaratbwa.com).
create or replace function public.check_signup_allowed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if public.email_allowed(new.email) then
    return new;
  end if;
  raise exception 'Herramientas: % no tiene acceso (pedile a un admin que lo habilite)', coalesce(new.email, 'sin mail');
end;
$$;

-- 2. Contraseñas (solo el servidor) ----------------------------------
create table if not exists public.credenciales (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- Formato PHC: algoritmo, versión, parámetros, salt y hash. Nada más.
  hash text not null check (hash like '$argon2id$%' and char_length(hash) <= 300),
  -- Con qué pepper se calculó (para poder rotarlo sin dejar a nadie afuera).
  pepper_version smallint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.credenciales enable row level security;

-- Links de un solo uso para crear o recuperar la contraseña. Se guarda el SHA-256 del link, no el link.
create table if not exists public.credencial_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  email text not null check (email = lower(email)),
  motivo text not null check (motivo in ('invitacion', 'recuperar')),
  creado_por uuid references auth.users(id) on delete set null,
  expira timestamptz not null,
  usado timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists credencial_tokens_email_idx on public.credencial_tokens (email);
alter table public.credencial_tokens enable row level security;

-- Intentos (para frenar la fuerza bruta). La clave es un hash: ni el mail ni la IP quedan en claro.
create table if not exists public.credencial_intentos (
  id bigint generated always as identity primary key,
  clave text not null check (char_length(clave) <= 100),
  exito boolean not null,
  creado timestamptz not null default now()
);
create index if not exists credencial_intentos_clave_idx on public.credencial_intentos (clave, creado desc);
alter table public.credencial_intentos enable row level security;

revoke all on public.credenciales, public.credencial_tokens, public.credencial_intentos from anon, authenticated;

-- 3. La única contraseña es la nuestra ---------------------------------
-- Supabase también tiene su propio ingreso con contraseña (bcrypt). Para que nadie lo use como puerta
-- lateral (ej: registrarse directo contra la API de Supabase con un mail permitido), su contraseña
-- queda siempre vacía: ese ingreso nunca valida.
create or replace function public.auth_sin_contrasena_de_supabase()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.encrypted_password := '';
  return new;
end;
$$;

drop trigger if exists auth_sin_contrasena_de_supabase on auth.users;
create trigger auth_sin_contrasena_de_supabase
  before insert or update of encrypted_password on auth.users
  for each row execute function public.auth_sin_contrasena_de_supabase();

update auth.users set encrypted_password = '' where coalesce(encrypted_password, '') <> '';

-- 4. Lo que hace un admin desde la app ----------------------------------
-- Ver quién puede entrar: dominios, mails sueltos y, de cada mail, si ya tiene cuenta y contraseña.
create or replace function public.accesos_listar()
returns json language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.es_admin() then
    raise exception 'Solo un admin puede ver los accesos';
  end if;
  return json_build_object(
    'dominios', coalesce((select json_agg(json_build_object('domain', d.domain, 'note', d.note, 'fijo', d.domain = 'camaratbwa.com') order by d.domain)
      from public.allowed_domains d), '[]'::json),
    'mails', coalesce((select json_agg(json_build_object(
        'email', a.email, 'note', a.note,
        'tiene_cuenta', p.id is not null,
        'tiene_contrasena', c.user_id is not null
      ) order by a.email)
      from public.allowed_emails a
      left join public.profiles p on lower(p.email) = a.email
      left join public.credenciales c on c.user_id = p.id), '[]'::json),
    -- Quién tiene contraseña (de cualquier dominio permitido), para saber quién entra sin Google.
    'con_contrasena', coalesce((select json_agg(lower(p.email) order by p.email)
      from public.credenciales c join public.profiles p on p.id = c.user_id), '[]'::json)
  );
end;
$$;

create or replace function public.accesos_poner_dominio(p_domain text, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare d text := lower(trim(both '@ ' from p_domain));
begin
  if not public.es_admin() then
    raise exception 'Solo un admin puede cambiar los accesos';
  end if;
  insert into public.allowed_domains (domain, note) values (d, nullif(trim(p_note), ''))
  on conflict (domain) do update set note = excluded.note;
end;
$$;

create or replace function public.accesos_quitar_dominio(p_domain text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_admin() then
    raise exception 'Solo un admin puede cambiar los accesos';
  end if;
  if lower(p_domain) = 'camaratbwa.com' then
    raise exception 'El dominio del estudio no se puede sacar';
  end if;
  delete from public.allowed_domains where domain = lower(p_domain);
end;
$$;

create or replace function public.accesos_poner_mail(p_email text, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare e text := lower(trim(p_email));
begin
  if not public.es_admin() then
    raise exception 'Solo un admin puede cambiar los accesos';
  end if;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Ese mail no es válido';
  end if;
  insert into public.allowed_emails (email, note) values (e, nullif(trim(p_note), ''))
  on conflict (email) do update set note = excluded.note;
end;
$$;

-- Sacar un mail de la lista también le borra los links pendientes. Si su dominio sigue permitido, sigue entrando.
create or replace function public.accesos_quitar_mail(p_email text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_admin() then
    raise exception 'Solo un admin puede cambiar los accesos';
  end if;
  delete from public.allowed_emails where email = lower(p_email);
  if not public.email_allowed(lower(p_email)) then
    delete from public.credencial_tokens where email = lower(p_email) and usado is null;
  end if;
end;
$$;

revoke execute on function public.accesos_listar() from anon;
revoke execute on function public.accesos_poner_dominio(text, text) from anon;
revoke execute on function public.accesos_quitar_dominio(text) from anon;
revoke execute on function public.accesos_poner_mail(text, text) from anon;
revoke execute on function public.accesos_quitar_mail(text) from anon;
revoke execute on function public.auth_sin_contrasena_de_supabase() from anon, authenticated;
