-- ============================================================
-- Planificación para el cliente: la plani se comparte con un link privado (un token largo al
-- azar, uno por plani) y el cliente la ve como presentación, comenta y aprueba o pide cambios
-- pieza por pieza. No necesita cuenta: el link es la llave, y el estudio lo puede cortar o
-- cambiar cuando quiera.
--
-- El cliente nunca toca las tablas: todo pasa por estas funciones (SECURITY DEFINER), que
-- validan el token y devuelven solo lo que el cliente puede ver (sin indicaciones internas,
-- referencias ni comentarios del estudio).
-- Correr DESPUÉS de migracion-planificacion.sql y migracion-integraciones.sql.
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
      'estado', p.estado, 'drive_carpeta_id', p.drive_carpeta_id
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

-- Para que la página del cliente muestre el material: la conexión del Drive (cifrada; la clave
-- para descifrarla vive solo en el servidor), si ese archivo es de una pieza de la plani.
create or replace function public.plani_publica_drive(p_token text, p_drive_id text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'cuenta_id', i.cuenta_id, 'access_token', i.access_token, 'refresh_token', i.refresh_token,
    'expira', i.expira, 'datos', i.datos
  )
  from public.integraciones i
  where i.proveedor = 'google'
    and exists (
      select 1
      from public.planificaciones p
      join public.plani_piezas x on x.plani_id = p.id
      cross join lateral jsonb_array_elements(x.medios) m
      where p.share_token = p_token and p.compartida and length(p_token) >= 32
        and m ->> 'drive_id' = p_drive_id
    );
$$;

revoke all on function public.plani_publica(text) from public;
revoke all on function public.plani_publica_comentar(text, uuid, text, text) from public;
revoke all on function public.plani_publica_aprobar(text, uuid, text) from public;
revoke all on function public.plani_publica_drive(text, text) from public;
grant execute on function public.plani_publica(text) to anon, authenticated;
grant execute on function public.plani_publica_comentar(text, uuid, text, text) to anon, authenticated;
grant execute on function public.plani_publica_aprobar(text, uuid, text) to anon, authenticated;
grant execute on function public.plani_publica_drive(text, text) to anon, authenticated;
