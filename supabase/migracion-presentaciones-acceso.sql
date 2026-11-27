-- ============================================================
-- Feature | Presentaciones acceso (en el historial de migraciones: feature_presentaciones_acceso)
-- El link del cliente ya no alcanza para ver la presentación: hay que entrar con un mail del cliente.
--
--   1. El cliente abre el link y pone su mail. Solo sirven los mails y dominios cargados en la ficha
--      del cliente (cliente_correos, de migracion-correo-contactos.sql).
--   2. Le llega un código de 6 números desde la casilla de quien compartió la presentación (la de
--      Correo). Vence a los 10 minutos y tiene 5 intentos.
--   3. Con el código entra, y ese navegador queda habilitado 30 días (una cookie que solo lee el
--      servidor de la app). Cambiar el link o dejar de compartir corta todas las entradas.
--
-- Si alguien encuentra el link, no ve nada: le falta un mail del cliente. La gente del estudio entra
-- con su sesión de siempre, sin código.
--
-- Los códigos los genera el servidor de la app (que se identifica con su llave, la misma del Drive:
-- servidor_llaves). Las funciones viejas, que daban todo con el link solo, quedan cerradas: ahora
-- las usan solo las de acá adentro.
--
-- Correr DESPUÉS de migracion-presentaciones-cliente.sql, migracion-correo.sql y
-- migracion-correo-contactos.sql.
-- Supabase → SQL Editor → pegar todo → Run. Se puede correr más de una vez. Lo único que borra son
-- entradas y códigos de clientes (al cambiar el link de una presentación o dejar de compartirla).
-- ============================================================

do $$
begin
  if to_regprocedure('public.presentacion_publica(text)') is null or to_regclass('public.servidor_llaves') is null then
    raise exception 'Primero corré supabase/migracion-presentaciones-cliente.sql y volvé a correr esto.';
  end if;
  if to_regclass('public.correo_cuentas') is null then
    raise exception 'Primero corré supabase/migracion-correo.sql (las casillas) y volvé a correr esto.';
  end if;
  if to_regclass('public.cliente_correos') is null then
    raise exception 'Primero corré supabase/migracion-correo-contactos.sql (los mails de cada cliente) y volvé a correr esto.';
  end if;
end $$;

-- 1. Quién compartió (de su casilla sale el código) ------------------
alter table public.presentaciones add column if not exists compartida_por uuid references auth.users(id) on delete set null;

-- Al compartir (o cambiar el link) queda quien lo hizo. Cada uno solo se puede poner a sí mismo
-- ("que el código salga desde mi casilla"). Dejar de compartir o cambiar el link corta las entradas.
create or replace function public.presentacion_compartir()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.compartida then new.compartida_por := auth.uid(); else new.compartida_por := null; end if;
    return new;
  end if;
  if new.compartida_por is distinct from old.compartida_por then
    new.compartida_por := coalesce(auth.uid(), old.compartida_por);
  end if;
  if new.compartida and (not old.compartida or new.share_token is distinct from old.share_token) and auth.uid() is not null then
    new.compartida_por := auth.uid();
  end if;
  if not new.compartida or new.share_token is distinct from old.share_token then
    delete from public.presentacion_accesos where presentacion_id = new.id;
    delete from public.presentacion_codigos where presentacion_id = new.id;
  end if;
  return new;
end;
$$;

-- 2. Códigos y entradas ------------------------------------------
-- Sin políticas para nadie: solo las funciones de abajo los leen y escriben.
create table if not exists public.presentacion_codigos (
  id bigint generated always as identity primary key,
  presentacion_id uuid not null references public.presentaciones(id) on delete cascade,
  email text not null,
  -- HMAC del código, calculado por el servidor de la app: la base nunca ve el código.
  codigo_hash text not null,
  expira timestamptz not null,
  intentos int not null default 0,
  usado timestamptz,
  created_at timestamptz not null default now(),
  constraint presentacion_codigos_hash check (codigo_hash ~ '^[0-9a-f]{64}$')
);
create index if not exists presentacion_codigos_buscar_idx on public.presentacion_codigos (presentacion_id, email, created_at desc);
alter table public.presentacion_codigos enable row level security;

-- La gente del estudio ve quién entró y cuándo (no la llave de la entrada: esa es solo un hash).
create table if not exists public.presentacion_accesos (
  id bigint generated always as identity primary key,
  presentacion_id uuid not null references public.presentaciones(id) on delete cascade,
  email text not null,
  sesion_hash text not null unique,
  creado timestamptz not null default now(),
  expira timestamptz not null,
  ultimo_uso timestamptz not null default now(),
  constraint presentacion_accesos_hash check (sesion_hash ~ '^[0-9a-f]{64}$')
);
create index if not exists presentacion_accesos_presentacion_idx on public.presentacion_accesos (presentacion_id, ultimo_uso desc);
alter table public.presentacion_accesos enable row level security;
drop policy if exists "el estudio ve quién entró" on public.presentacion_accesos;
create policy "el estudio ve quién entró" on public.presentacion_accesos
  for select to authenticated using ((select public.has_access()));
-- Y puede sacar una entrada (cortarle el acceso a ese navegador).
drop policy if exists "el estudio corta entradas" on public.presentacion_accesos;
create policy "el estudio corta entradas" on public.presentacion_accesos
  for delete to authenticated using ((select public.has_access()));
revoke all on public.presentacion_codigos from anon, authenticated;
revoke all on public.presentacion_accesos from anon;
revoke insert, update on public.presentacion_accesos from authenticated;

-- El trigger va después de las tablas (las borra al cortar).
drop trigger if exists presentacion_compartir on public.presentaciones;
create trigger presentacion_compartir
  before insert or update of compartida, share_token, compartida_por on public.presentaciones
  for each row execute function public.presentacion_compartir();

-- 3. Ayudantes (solo para las funciones de acá) ------------------------
create or replace function public.es_llave_servidor(p_llave text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.servidor_llaves k
     where k.uso = 'drive'
       and k.hash = encode(sha256(convert_to(coalesce(p_llave, ''), 'UTF8')), 'hex')
  );
$$;

create or replace function public.presentacion_por_token(p_token text)
returns public.presentaciones language sql stable security definer set search_path = '' as $$
  select p.* from public.presentaciones p
   where p.share_token = p_token and p.compartida and length(coalesce(p_token, '')) >= 32
   limit 1;
$$;

-- ¿Ese mail es del cliente? Un mail cargado tal cual, o su dominio (o un subdominio de él).
create or replace function public.mail_del_cliente(p_brand uuid, p_email text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.cliente_correos cc
     where cc.brand_id = p_brand
       and (cc.valor = p_email
            or cc.valor = split_part(p_email, '@', 2)
            or split_part(p_email, '@', 2) like '%.' || cc.valor)
  );
$$;

-- La entrada de ese navegador (o null). Marca cuándo se usó por última vez.
create or replace function public.presentacion_entrada(p_token text, p_sesion text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_p public.presentaciones;
  v_email text;
begin
  v_p := public.presentacion_por_token(p_token);
  if v_p.id is null or coalesce(p_sesion, '') = '' then return null; end if;
  update public.presentacion_accesos a
     set ultimo_uso = now()
   where a.presentacion_id = v_p.id
     and a.sesion_hash = encode(sha256(convert_to(p_sesion, 'UTF8')), 'hex')
     and a.expira > now()
  returning a.email into v_email;
  return v_email;
end;
$$;

-- Puede ver la presentación: con una entrada válida, o porque es del estudio.
create or replace function public.presentacion_puede_ver(p_token text, p_sesion text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if (select public.has_access()) then
    return (public.presentacion_por_token(p_token)).id is not null;
  end if;
  return public.presentacion_entrada(p_token, p_sesion) is not null;
end;
$$;

-- 4. Lo que usa la página del cliente ------------------------------
-- La portada (antes de entrar): solo el nombre y el logo del cliente, para que sepa dónde está.
create or replace function public.presentacion_portada(p_token text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('cliente', b.name, 'color', b.color, 'logo_url', b.logo_url, 'logo_bg', b.logo_bg)
    from public.presentaciones p
    join public.brands b on b.id = p.brand_id
   where p.share_token = p_token and p.compartida and length(coalesce(p_token, '')) >= 32;
$$;

-- Pedir un código (solo el servidor de la app, que después lo manda por mail). Devuelve si el mail
-- está habilitado y, si sí, la casilla de quien compartió (con la contraseña cifrada: solo el
-- servidor la puede abrir) y lo que va en el mail.
create or replace function public.presentacion_pedir_codigo(p_llave text, p_token text, p_email text, p_codigo_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_p public.presentaciones;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_remitente jsonb;
begin
  if not public.es_llave_servidor(p_llave) then
    raise exception 'Solo el servidor de la app' using errcode = '42501';
  end if;
  v_p := public.presentacion_por_token(p_token);
  if v_p.id is null then return jsonb_build_object('estado', 'invalido'); end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 200 then
    return jsonb_build_object('estado', 'no_habilitado');
  end if;
  if not public.mail_del_cliente(v_p.brand_id, v_email) then
    return jsonb_build_object('estado', 'no_habilitado');
  end if;
  -- Como mucho 5 códigos por mail y 30 por presentación en una hora.
  if (select count(*) from public.presentacion_codigos c
       where c.presentacion_id = v_p.id and c.email = v_email and c.created_at > now() - interval '1 hour') >= 5
     or (select count(*) from public.presentacion_codigos c
          where c.presentacion_id = v_p.id and c.created_at > now() - interval '1 hour') >= 30 then
    return jsonb_build_object('estado', 'espera');
  end if;

  select jsonb_build_object(
           'email', cc.email,
           'password', cc.password,
           'nombre', coalesce(nullif(btrim(pr.nombre_visible), ''), nullif(btrim(pr.full_name), ''))
         )
    into v_remitente
    from public.correo_cuentas cc
    left join public.profiles pr on pr.id = cc.user_id
   where cc.user_id = v_p.compartida_por;
  if v_remitente is null then return jsonb_build_object('estado', 'sin_remitente'); end if;

  -- Un código nuevo deja sin efecto los anteriores de ese mail.
  update public.presentacion_codigos set usado = now()
   where presentacion_id = v_p.id and email = v_email and usado is null;
  insert into public.presentacion_codigos (presentacion_id, email, codigo_hash, expira)
  values (v_p.id, v_email, p_codigo_hash, now() + interval '10 minutes');

  return jsonb_build_object(
    'estado', 'ok',
    'remitente', v_remitente,
    'cliente', (select b.name from public.brands b where b.id = v_p.brand_id),
    'titulo', v_p.titulo,
    'tipo', (select t.nombre from public.presentacion_tipos t where t.id = v_p.tipo),
    'mes', v_p.mes,
    'anio', v_p.anio
  );
end;
$$;

-- Canjear el código por una entrada de 30 días (solo el servidor de la app).
create or replace function public.presentacion_canjear_codigo(p_llave text, p_token text, p_email text, p_codigo_hash text, p_sesion_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_p public.presentaciones;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_c public.presentacion_codigos;
begin
  if not public.es_llave_servidor(p_llave) then
    raise exception 'Solo el servidor de la app' using errcode = '42501';
  end if;
  v_p := public.presentacion_por_token(p_token);
  if v_p.id is null then return jsonb_build_object('estado', 'invalido'); end if;
  select * into v_c from public.presentacion_codigos c
   where c.presentacion_id = v_p.id and c.email = v_email and c.usado is null and c.expira > now()
   order by c.created_at desc limit 1
   for update;
  if v_c.id is null then return jsonb_build_object('estado', 'vencido'); end if;
  if v_c.intentos >= 5 then return jsonb_build_object('estado', 'bloqueado'); end if;
  if v_c.codigo_hash <> coalesce(p_codigo_hash, '') then
    update public.presentacion_codigos set intentos = intentos + 1 where id = v_c.id;
    return jsonb_build_object('estado', case when v_c.intentos + 1 >= 5 then 'bloqueado' else 'incorrecto' end, 'quedan', greatest(0, 4 - v_c.intentos));
  end if;
  update public.presentacion_codigos set usado = now() where id = v_c.id;
  insert into public.presentacion_accesos (presentacion_id, email, sesion_hash, expira)
  values (v_p.id, v_email, p_sesion_hash, now() + interval '30 days');
  return jsonb_build_object('estado', 'ok', 'email', v_email);
end;
$$;

-- Salir: se borra esa entrada.
create or replace function public.presentacion_salir(p_token text, p_sesion text)
returns void language sql security definer set search_path = '' as $$
  delete from public.presentacion_accesos a
   using public.presentaciones p
   where a.presentacion_id = p.id and p.share_token = p_token
     and a.sesion_hash = encode(sha256(convert_to(coalesce(p_sesion, ''), 'UTF8')), 'hex');
$$;

-- Ver, comentar, aprobar y bajar un archivo: lo mismo que antes, pero con la entrada (o siendo del estudio).
create or replace function public.presentacion_ver(p_token text, p_sesion text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_email text;
begin
  if (select public.has_access()) then
    return public.presentacion_publica(p_token) || jsonb_build_object('entrada', jsonb_build_object('estudio', true));
  end if;
  v_email := public.presentacion_entrada(p_token, p_sesion);
  if v_email is null then return null; end if;
  return public.presentacion_publica(p_token) || jsonb_build_object('entrada', jsonb_build_object('email', v_email));
end;
$$;

create or replace function public.presentacion_ver_comentar(p_token text, p_sesion text, p_pieza uuid, p_nombre text, p_texto text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.presentacion_puede_ver(p_token, p_sesion) then
    raise exception 'Sin entrada' using errcode = '42501';
  end if;
  perform public.presentacion_publica_comentar(p_token, p_pieza, p_nombre, p_texto);
end;
$$;

create or replace function public.presentacion_ver_aprobar(p_token text, p_sesion text, p_pieza uuid, p_estado text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.presentacion_puede_ver(p_token, p_sesion) then
    raise exception 'Sin entrada' using errcode = '42501';
  end if;
  perform public.presentacion_publica_aprobar(p_token, p_pieza, p_estado);
end;
$$;

create or replace function public.presentacion_ver_archivo(p_token text, p_sesion text, p_drive_id text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not public.presentacion_puede_ver(p_token, p_sesion) then return false; end if;
  return coalesce(public.presentacion_publica_archivo(p_token, p_drive_id), false);
end;
$$;

-- 5. Permisos -----------------------------------------------------
-- Las viejas (el link solo alcanzaba) quedan cerradas para todos: las usan las de arriba.
revoke all on function public.presentacion_publica(text) from public, anon, authenticated;
revoke all on function public.presentacion_publica_comentar(text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.presentacion_publica_aprobar(text, uuid, text) from public, anon, authenticated;
revoke all on function public.presentacion_publica_archivo(text, text) from public, anon, authenticated;

revoke all on function public.presentacion_compartir() from public, anon, authenticated;
revoke all on function public.es_llave_servidor(text) from public, anon, authenticated;
revoke all on function public.presentacion_por_token(text) from public, anon, authenticated;
revoke all on function public.mail_del_cliente(uuid, text) from public, anon, authenticated;
revoke all on function public.presentacion_entrada(text, text) from public, anon, authenticated;
revoke all on function public.presentacion_puede_ver(text, text) from public, anon, authenticated;

revoke all on function public.presentacion_portada(text) from public;
revoke all on function public.presentacion_pedir_codigo(text, text, text, text) from public;
revoke all on function public.presentacion_canjear_codigo(text, text, text, text, text) from public;
revoke all on function public.presentacion_salir(text, text) from public;
revoke all on function public.presentacion_ver(text, text) from public;
revoke all on function public.presentacion_ver_comentar(text, text, uuid, text, text) from public;
revoke all on function public.presentacion_ver_aprobar(text, text, uuid, text) from public;
revoke all on function public.presentacion_ver_archivo(text, text, text) from public;
grant execute on function public.presentacion_portada(text) to anon, authenticated;
grant execute on function public.presentacion_pedir_codigo(text, text, text, text) to anon, authenticated;
grant execute on function public.presentacion_canjear_codigo(text, text, text, text, text) to anon, authenticated;
grant execute on function public.presentacion_salir(text, text) to anon, authenticated;
grant execute on function public.presentacion_ver(text, text) to anon, authenticated;
grant execute on function public.presentacion_ver_comentar(text, text, uuid, text, text) to anon, authenticated;
grant execute on function public.presentacion_ver_aprobar(text, text, uuid, text) to anon, authenticated;
grant execute on function public.presentacion_ver_archivo(text, text, text) to anon, authenticated;
