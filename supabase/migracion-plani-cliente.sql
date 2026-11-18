-- ============================================================
-- Planificación para el cliente: la plani se comparte con un link privado (un token largo al
-- azar, uno por plani) y el cliente la ve como presentación, comenta y aprueba o pide cambios
-- pieza por pieza. No necesita cuenta: el link es la llave, y el estudio lo puede cortar o
-- cambiar cuando quiera.
--
-- El cliente nunca toca las tablas: todo pasa por estas funciones (SECURITY DEFINER), que
-- validan el token y devuelven solo lo que el cliente puede ver (sin indicaciones internas,
-- referencias ni comentarios del estudio). Las credenciales del Drive nunca salen hacia el
-- cliente: la base solo confirma que el archivo es de esa plani, y el servidor de la app consigue
-- la conexión con una llave que solo él puede calcular (servidor_llaves, más abajo).
-- Correr DESPUÉS de migracion-planificacion.sql, migracion-integraciones.sql y
-- migracion-equipo.sql (usa es_admin()).
-- Supabase → SQL Editor → pegar todo → Run. Se puede correr más de una vez.
-- ============================================================

alter table public.planificaciones add column if not exists compartida boolean not null default false;
alter table public.planificaciones add column if not exists share_token text;
create unique index if not exists planificaciones_share_token_idx on public.planificaciones (share_token) where share_token is not null;

-- La plani compartida (o null si el link no existe o se dejó de compartir).
create or replace function public.plani_publica(p_token text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'plani', jsonb_build_object(
      'id', p.id, 'brand_id', p.brand_id, 'titulo', p.titulo, 'tipo', p.tipo, 'anio', p.anio, 'mes', p.mes,
      -- La carpeta del Drive es del estudio: el cliente no la necesita.
      'estado', p.estado, 'drive_carpeta_id', null
    ),
    'brand', (
      select jsonb_build_object('name', b.name, 'color', b.color, 'logo_url', b.logo_url, 'logo_bg', b.logo_bg)
      from public.brands b where b.id = p.brand_id
    ),
    'piezas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', x.id, 'plani_id', x.plani_id, 'fecha', x.fecha, 'hora', x.hora, 'orden', x.orden, 'formato', x.formato,
        'proporcion', x.proporcion, 'plataformas', x.plataformas, 'titulo', x.titulo, 'copys', x.copys,
        'medios', x.medios, 'stickers', x.stickers, 'adapta_de', x.adapta_de, 'estado_cliente', x.estado_cliente,
        'programada', x.programada, 'created_at', x.created_at
      ) order by x.fecha, x.orden, x.created_at)
      from public.plani_piezas x where x.plani_id = p.id
    ), '[]'::jsonb),
    'comentarios', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'pieza_id', c.pieza_id, 'autor_nombre', c.autor_nombre, 'texto', c.texto,
        'del_cliente', c.autor_id is null, 'resuelto', c.resuelto, 'created_at', c.created_at
      ) order by c.created_at)
      from public.plani_comentarios c where c.plani_id = p.id and not c.interno
    ), '[]'::jsonb)
  )
  from public.planificaciones p
  where p.share_token = p_token and p.compartida and length(p_token) >= 32;
$$;

-- El cliente comenta una pieza (o la plani entera, con p_pieza null).
create or replace function public.plani_publica_comentar(p_token text, p_pieza uuid, p_nombre text, p_texto text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_plani uuid; v_id uuid;
begin
  select id into v_plani from public.planificaciones where share_token = p_token and compartida and length(p_token) >= 32;
  if v_plani is null then raise exception 'Link inválido'; end if;
  if p_pieza is not null and not exists (select 1 from public.plani_piezas where id = p_pieza and plani_id = v_plani) then
    raise exception 'Pieza inválida';
  end if;
  if char_length(trim(coalesce(p_texto, ''))) = 0 then raise exception 'Comentario vacío'; end if;
  insert into public.plani_comentarios (plani_id, pieza_id, autor_id, autor_nombre, texto, interno)
  values (v_plani, p_pieza, null, left(coalesce(nullif(trim(p_nombre), ''), 'Cliente'), 80), left(trim(p_texto), 4000), false)
  returning id into v_id;
  return jsonb_build_object('id', v_id);
end;
$$;

-- El cliente aprueba una pieza o pide cambios.
create or replace function public.plani_publica_aprobar(p_token text, p_pieza uuid, p_estado text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_plani uuid;
begin
  if p_estado not in ('pendiente', 'aprobada', 'cambios') then raise exception 'Estado inválido'; end if;
  select id into v_plani from public.planificaciones where share_token = p_token and compartida and length(p_token) >= 32;
  if v_plani is null then raise exception 'Link inválido'; end if;
  update public.plani_piezas set estado_cliente = p_estado where id = p_pieza and plani_id = v_plani;
end;
$$;

-- Antes, plani_publica_drive le devolvía la conexión del Drive (cifrada) a cualquiera con el link.
drop function if exists public.plani_publica_drive(text, text);

-- Para que la página del cliente muestre el material: si ese archivo es de una pieza de la plani
-- compartida. Solo sí o no; el archivo lo trae el servidor.
create or replace function public.plani_publica_archivo(p_token text, p_drive_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from public.planificaciones p
      join public.plani_piezas x on x.plani_id = p.id
      cross join lateral jsonb_array_elements(x.medios) m
     where p.share_token = p_token and p.compartida and length(p_token) >= 32
       and m ->> 'drive_id' = p_drive_id
  );
$$;

-- Las llaves del servidor de la app: salen de INTEGRACIONES_SECRET (que vive solo en Vercel) y acá
-- queda solo su hash. Sin políticas: nadie la lee ni la escribe desde afuera, solo estas funciones.
create table if not exists public.servidor_llaves (
  uso text primary key,
  hash text not null,
  updated_at timestamptz not null default now(),
  constraint servidor_llaves_uso check (uso in ('drive')),
  constraint servidor_llaves_hash check (hash ~ '^[0-9a-f]{64}$')
);
alter table public.servidor_llaves enable row level security;

-- La anota un admin (al conectar el Drive o al sincronizar Basecamp).
create or replace function public.servidor_guardar_llave(p_uso text, p_hash text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_admin() then
    raise exception 'Solo un admin de la app' using errcode = '42501';
  end if;
  insert into public.servidor_llaves (uso, hash) values (p_uso, p_hash)
  on conflict (uso) do update set hash = excluded.hash, updated_at = now();
end;
$$;

-- La conexión del Drive (cifrada), solo para el servidor de la app: la página del cliente no
-- tiene sesión, así que el servidor se identifica con su llave.
create or replace function public.drive_conexion_servidor(p_llave text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'cuenta_id', i.cuenta_id, 'access_token', i.access_token, 'refresh_token', i.refresh_token,
    'expira', i.expira, 'datos', i.datos
  )
  from public.integraciones i
  where i.proveedor = 'google'
    and exists (
      select 1 from public.servidor_llaves k
       where k.uso = 'drive' and k.hash = encode(sha256(convert_to(coalesce(p_llave, ''), 'UTF8')), 'hex')
    );
$$;

revoke all on function public.plani_publica(text) from public;
revoke all on function public.plani_publica_comentar(text, uuid, text, text) from public;
revoke all on function public.plani_publica_aprobar(text, uuid, text) from public;
revoke all on function public.plani_publica_archivo(text, text) from public;
revoke all on function public.servidor_guardar_llave(text, text) from public, anon;
revoke all on function public.drive_conexion_servidor(text) from public;
grant execute on function public.plani_publica(text) to anon, authenticated;
grant execute on function public.plani_publica_comentar(text, uuid, text, text) to anon, authenticated;
grant execute on function public.plani_publica_aprobar(text, uuid, text) to anon, authenticated;
grant execute on function public.plani_publica_archivo(text, text) to anon, authenticated;
grant execute on function public.servidor_guardar_llave(text, text) to authenticated;
grant execute on function public.drive_conexion_servidor(text) to anon, authenticated;
