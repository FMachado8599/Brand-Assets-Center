-- ============================================================
-- Feature | Correo contactos (en el historial de migraciones: feature_correo_contactos)
-- Quién es cada mail que aparece en el Correo: su foto, su nombre, su cargo y de qué cliente es.
--
--   1. Fotos asignadas a mano (correo_avatares): para los mails que no tienen cuenta en la app ni foto
--      en Basecamp. Las sube cualquiera del estudio (un cuadrado de hasta 150 px) y las ve todo el estudio.
--   2. Los mails y dominios de cada cliente (cliente_correos): "ana@cliente.com" (esa persona) o
--      "cliente.com" (todos los de ahí). Se cargan en la ficha del cliente.
--   3. correo_contactos(mails): para cada mail, la foto (la del perfil de la app, si no la asignada,
--      si no la de Basecamp), el nombre, el cargo de Basecamp y sus clientes.
--
-- La app sigue sin guardar mails: acá solo hay direcciones, fotos y a qué cliente van.
-- Correr DESPUÉS de migracion-correo.sql, migracion-perfil.sql y migracion-integraciones.sql.
-- Supabase → SQL Editor → pegar todo → Run. Se puede correr más de una vez: no mueve datos.
-- ============================================================

do $$
begin
  if to_regprocedure('public.has_access()') is null then
    raise exception 'Primero corré supabase/migracion-acceso.sql (define has_access()) y volvé a correr esto.';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'foto_origen') then
    raise exception 'Primero corré supabase/migracion-perfil.sql (la foto del perfil) y volvé a correr esto.';
  end if;
  if to_regclass('public.bc_personas') is null then
    raise exception 'Primero corré supabase/migracion-integraciones.sql (la gente de Basecamp) y volvé a correr esto.';
  end if;
end $$;

-- 1. Fotos asignadas a mano --------------------------------------
create table if not exists public.correo_avatares (
  email text primary key,
  -- Dónde quedó en el bucket correo-avatares (para borrarla al cambiarla) y su URL pública.
  foto_path text not null,
  foto_url text not null,
  cargada_por uuid default auth.uid() references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.correo_avatares drop constraint if exists correo_avatares_email_valido;
alter table public.correo_avatares add constraint correo_avatares_email_valido
  check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+$' and char_length(email) <= 200);
alter table public.correo_avatares drop constraint if exists correo_avatares_foto_valida;
alter table public.correo_avatares add constraint correo_avatares_foto_valida
  check (foto_url ~ '^https://' and char_length(foto_url) <= 1000 and char_length(foto_path) <= 300);

alter table public.correo_avatares enable row level security;
drop policy if exists "solo el estudio" on public.correo_avatares;
create policy "solo el estudio" on public.correo_avatares
  for all to authenticated
  using ((select public.has_access()))
  with check ((select public.has_access()));
revoke all on public.correo_avatares from anon;

-- Público (las fotos se muestran por su URL), hasta 300 KB y solo imágenes: la página la recorta a un
-- cuadrado de hasta 150 px antes de subirla. Sube y borra cualquiera del estudio.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('correo-avatares', 'correo-avatares', true, 307200, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "correo-avatares del estudio" on storage.objects;
create policy "correo-avatares del estudio" on storage.objects
  for all to authenticated
  using (bucket_id = 'correo-avatares' and (select public.has_access()))
  with check (bucket_id = 'correo-avatares' and (select public.has_access()));

-- 2. Los mails y dominios de cada cliente ---------------------------
create table if not exists public.cliente_correos (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  -- Un mail ("ana@cliente.com") o un dominio sin @ ("cliente.com": todos los mails de ahí).
  valor text not null,
  -- Quién es, si es un mail ("Ana, marketing"). Opcional.
  nombre text not null default '',
  creado_por uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists cliente_correos_unico_idx on public.cliente_correos (brand_id, valor);
create index if not exists cliente_correos_valor_idx on public.cliente_correos (valor);

-- Los dominios de mail de todo el mundo (gmail, hotmail…) y el del estudio no pueden ser de un cliente
-- entero: de ahí solo se cargan mails sueltos.
create or replace function public.correo_dominio_generico(d text)
returns boolean language sql immutable set search_path = '' as $$
  select lower(d) in (
    'camaratbwa.com', 'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.es', 'outlook.com', 'outlook.es',
    'live.com', 'msn.com', 'yahoo.com', 'yahoo.es', 'yahoo.com.ar', 'icloud.com', 'me.com', 'mac.com',
    'aol.com', 'proton.me', 'protonmail.com', 'adinet.com.uy', 'montevideo.com.uy', 'vera.com.uy', 'netgate.com.uy'
  );
$$;

alter table public.cliente_correos drop constraint if exists cliente_correos_valor_valido;
alter table public.cliente_correos add constraint cliente_correos_valor_valido check (
  valor = lower(valor)
  and char_length(valor) between 4 and 200
  and (
    valor ~ '^[^@\s]+@[a-z0-9-]+(\.[a-z0-9-]+)+$'
    or (valor ~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$' and not public.correo_dominio_generico(valor))
  )
);
alter table public.cliente_correos drop constraint if exists cliente_correos_nombre_largo;
alter table public.cliente_correos add constraint cliente_correos_nombre_largo check (char_length(nombre) <= 120);

alter table public.cliente_correos enable row level security;
drop policy if exists "solo el estudio" on public.cliente_correos;
create policy "solo el estudio" on public.cliente_correos
  for all to authenticated
  using ((select public.has_access()))
  with check ((select public.has_access()));
revoke all on public.cliente_correos from anon;

-- 3. Quién es cada mail ------------------------------------------
-- Hasta 300 mails por pedido (una página de la bandeja trae 50, con sus Para y CC). Corre con los
-- permisos de quien pregunta (security invoker): sin acceso al estudio no devuelve nada.
create or replace function public.correo_contactos(p_emails text[])
returns table (email text, foto text, foto_origen text, nombre text, cargo text, clientes jsonb)
language sql stable security invoker set search_path = '' as $$
  with pedidos as (
    select distinct lower(btrim(e)) as email
    from unnest((coalesce(p_emails, '{}'::text[]))[1:300]) as e
    where e is not null and position('@' in e) > 1 and char_length(e) <= 200
  )
  select
    p.email,
    coalesce(perfil.foto, manual.foto_url, bc.avatar_url) as foto,
    case
      when perfil.foto is not null then 'perfil'
      when manual.foto_url is not null then 'asignada'
      when bc.avatar_url is not null then 'basecamp'
    end as foto_origen,
    coalesce(perfil.nombre, bc.nombre, contacto.nombre) as nombre,
    bc.cargo,
    cl.clientes
  from pedidos p
  left join lateral (
    select
      case when pr.foto_origen in ('subida', 'basecamp') then pr.foto_url else pr.avatar_url end as foto,
      coalesce(nullif(btrim(pr.nombre_visible), ''), nullif(btrim(pr.full_name), '')) as nombre
    from public.profiles pr
    where lower(pr.email) = p.email
    limit 1
  ) perfil on true
  left join public.correo_avatares manual on manual.email = p.email
  left join lateral (
    select b.avatar_url, nullif(btrim(b.nombre), '') as nombre, nullif(btrim(b.cargo), '') as cargo
    from public.bc_personas b
    where lower(b.email) = p.email
    order by b.sincronizado desc
    limit 1
  ) bc on true
  left join lateral (
    select nullif(btrim(cc.nombre), '') as nombre
    from public.cliente_correos cc
    where cc.valor = p.email and btrim(cc.nombre) <> ''
    limit 1
  ) contacto on true
  left join lateral (
    -- El mail exacto gana sobre el dominio; un subdominio (x@uy.cliente.com) también es de cliente.com.
    select jsonb_agg(
             -- logo_from (de migracion-redes.sql) se lee así para no depender de que esté.
             jsonb_build_object('id', br.id, 'name', br.name, 'color', br.color, 'logo_url', br.logo_url, 'logo_bg', br.logo_bg,
                                'logo_from', to_jsonb(br) -> 'logo_from')
             order by m.exacto desc, br.name
           ) as clientes
    from (
      select distinct on (cc.brand_id) cc.brand_id, (cc.valor = p.email) as exacto
      from public.cliente_correos cc
      where cc.valor = p.email
         or cc.valor = split_part(p.email, '@', 2)
         or split_part(p.email, '@', 2) like '%.' || cc.valor
      order by cc.brand_id, (cc.valor = p.email) desc
    ) m
    join public.brands br on br.id = m.brand_id
  ) cl on true
  where coalesce(perfil.foto, manual.foto_url, bc.avatar_url, perfil.nombre, bc.nombre, contacto.nombre) is not null
     or cl.clientes is not null;
$$;

revoke all on function public.correo_contactos(text[]) from public, anon;
grant execute on function public.correo_contactos(text[]) to authenticated;
