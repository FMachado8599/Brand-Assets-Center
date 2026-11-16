-- ============================================================
-- Basecamp: la conexión del estudio es cosa de admins.
--
-- Hay dos cuentas de Basecamp distintas:
--   · la del estudio (integraciones, proveedor 'basecamp'): la autoriza un admin de Basecamp, trae
--     TODO (proyectos, tareas, gente) y mantiene los avisos al instante. Una sola a la vez.
--   · la personal de cada uno: su persona de Basecamp (equipo.bc_persona_id, por su mail). De ahí
--     salen sus tareas y sus notificaciones. No hace falta que cada uno conecte nada.
--
-- Lo que cambia:
--   1. La conexión del estudio, los webhooks y sincronizar son solo de admins de la app.
--   2. Un admin puede generar un link (24 h, un solo uso) para que un admin de Basecamp autorice con
--      su cuenta sin entrar a la app. La conexión se guarda con bc_conectar_con_invitacion.
--   3. Los admins de Basecamp pasan a ser admins de la app al sincronizar. Si un admin le cambia el
--      rol a alguien a mano, queda fijo (equipo.rol_manual) y la sincronización no lo toca más.
--
-- Correr DESPUÉS de migracion-integraciones, -equipo, -actividad y -notificaciones.
-- Supabase → SQL Editor → pegar todo → Run. Se puede correr más de una vez.
-- ============================================================

-- 1. Solo admins ----------------------------------------------------------

-- La conexión con Basecamp, solo admins. Drive (google) sigue siendo de todo el estudio.
drop policy if exists "solo el estudio" on public.integraciones;
drop policy if exists "el estudio; Basecamp solo admins" on public.integraciones;
create policy "el estudio; Basecamp solo admins" on public.integraciones for all to authenticated
  using ((select public.has_access()) and (proveedor <> 'basecamp' or (select public.es_admin())))
  with check ((select public.has_access()) and (proveedor <> 'basecamp' or (select public.es_admin())));

-- El estado de la sincronización lo lee todo el estudio (cuándo fue la última); lo escriben los admins.
drop policy if exists "solo el estudio" on public.bc_sync;
drop policy if exists "el estudio lee" on public.bc_sync;
drop policy if exists "admins escriben" on public.bc_sync;
create policy "el estudio lee" on public.bc_sync for select to authenticated using ((select public.has_access()));
create policy "admins escriben" on public.bc_sync for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

drop policy if exists "solo el estudio" on public.bc_webhooks;
drop policy if exists "solo admins" on public.bc_webhooks;
create policy "solo admins" on public.bc_webhooks for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

-- Sincronizar: el turno solo lo toma un admin.
create or replace function public.bc_tomar_sync()
returns boolean language plpgsql security definer set search_path = '' as $$
declare ok boolean;
begin
  if not public.es_admin() then
    return false;
  end if;
  insert into public.bc_sync (id) values ('basecamp') on conflict (id) do nothing;
  update public.bc_sync
     set corriendo_desde = now()
   where id = 'basecamp'
     and (corriendo_desde is null or corriendo_desde < now() - interval '2 minutes')
  returning true into ok;
  return coalesce(ok, false);
end;
$$;

revoke execute on function public.bc_tomar_sync() from anon;

-- 2. El link para que un admin de Basecamp autorice -------------------------
-- Se guarda solo el hash del link. Uno activo a la vez: generar uno nuevo invalida el anterior.
create table if not exists public.bc_invitaciones (
  hash text primary key,
  creada_por uuid references public.equipo(id) on delete set null,
  creada timestamptz not null default now(),
  vence timestamptz not null,
  usada timestamptz,
  -- Quién autorizó con el link (nombre y mail de Basecamp).
  autorizo text
);

alter table public.bc_invitaciones enable row level security;
drop policy if exists "solo admins" on public.bc_invitaciones;
create policy "solo admins" on public.bc_invitaciones for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

-- Un admin genera el link (la app arma la llave y manda su hash).
create or replace function public.bc_crear_invitacion(p_hash text)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare v_vence timestamptz := now() + interval '24 hours';
begin
  if not public.es_admin() then
    raise exception 'Solo un admin puede generar el link para conectar Basecamp';
  end if;
  delete from public.bc_invitaciones where usada is null;
  insert into public.bc_invitaciones (hash, creada_por, vence) values (p_hash, public.mi_equipo_id(), v_vence);
  return v_vence;
end;
$$;

revoke execute on function public.bc_crear_invitacion(text) from public, anon;
grant execute on function public.bc_crear_invitacion(text) to authenticated;

-- Si un link sirve (para avisar antes de mandar a Basecamp). La llaman sin sesión.
create or replace function public.bc_invitacion_valida(p_llave text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.bc_invitaciones i
     where i.hash = encode(sha256(convert_to(coalesce(p_llave, ''), 'UTF8')), 'hex')
       and i.usada is null and i.vence > now()
  );
$$;

revoke execute on function public.bc_invitacion_valida(text) from public;
grant execute on function public.bc_invitacion_valida(text) to anon, authenticated;

-- Guarda la conexión que autorizó quien abrió el link. La llama la vuelta de Basecamp, sin sesión
-- (quien autoriza no tiene por qué entrar a la app). Los tokens llegan ya cifrados por el servidor.
create or replace function public.bc_conectar_con_invitacion(p_llave text, p_conexion jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_inv public.bc_invitaciones%rowtype;
  v_gestiona text;
begin
  select * into v_inv from public.bc_invitaciones i
   where i.hash = encode(sha256(convert_to(coalesce(p_llave, ''), 'UTF8')), 'hex')
   for update;
  if not found then
    raise exception 'Ese link no existe. Pedile al admin de la app que genere uno nuevo.';
  end if;
  if v_inv.usada is not null then
    raise exception 'Ese link ya se usó. Pedile al admin de la app que genere uno nuevo.';
  end if;
  if v_inv.vence <= now() then
    raise exception 'Ese link venció. Pedile al admin de la app que genere uno nuevo.';
  end if;
  if coalesce(p_conexion ->> 'access_token', '') = '' then
    raise exception 'Faltan los datos de la conexión';
  end if;

  select coalesce(e.email, e.nombre) into v_gestiona from public.equipo e where e.id = v_inv.creada_por;

  insert into public.integraciones (proveedor, cuenta_id, cuenta_nombre, conectada_por, access_token, refresh_token, expira, datos, conectada, updated_at)
  values ('basecamp', p_conexion ->> 'cuenta_id', p_conexion ->> 'cuenta_nombre', v_gestiona,
          p_conexion ->> 'access_token', nullif(p_conexion ->> 'refresh_token', ''),
          (p_conexion ->> 'expira')::timestamptz, coalesce(p_conexion -> 'datos', '{}'::jsonb), now(), now())
  on conflict (proveedor) do update
    set cuenta_id = excluded.cuenta_id,
        cuenta_nombre = excluded.cuenta_nombre,
        conectada_por = excluded.conectada_por,
        access_token = excluded.access_token,
        refresh_token = excluded.refresh_token,
        expira = excluded.expira,
        datos = excluded.datos,
        conectada = excluded.conectada,
        updated_at = excluded.updated_at;

  update public.bc_invitaciones set usada = now(), autorizo = p_conexion -> 'datos' ->> 'persona' where hash = v_inv.hash;
  -- El error de la conexión anterior ("volvé a conectar…") ya no corre.
  update public.bc_sync set ultimo_error = null where id = 'basecamp';
  return 'ok';
end;
$$;

revoke execute on function public.bc_conectar_con_invitacion(text, jsonb) from public;
grant execute on function public.bc_conectar_con_invitacion(text, jsonb) to anon, authenticated;

-- 3. Los admins de Basecamp son admins de la app ------------------------------
-- null = el rol lo maneja la sincronización · true = lo cambió un admin a mano y queda fijo.
alter table public.equipo add column if not exists rol_manual boolean;

-- Cualquier cambio de rol que no venga de la sincronización es a mano.
create or replace function public.equipo_rol_manual()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.rol is distinct from old.rol and coalesce(current_setting('app.rol_automatico', true), '') <> 'si' then
    new.rol_manual := true;
  end if;
  return new;
end;
$$;

drop trigger if exists equipo_rol_manual on public.equipo;
create trigger equipo_rol_manual before update of rol on public.equipo
  for each row execute function public.equipo_rol_manual();

-- Pasa a admin a quien es admin en Basecamp (nunca saca a nadie). Devuelve a quiénes sumó.
create or replace function public.equipo_admins_de_basecamp()
returns text[] language plpgsql security definer set search_path = '' as $$
declare nuevos text[];
begin
  if not public.es_admin() then
    return '{}';
  end if;
  perform set_config('app.rol_automatico', 'si', true);
  with cambios as (
    update public.equipo e
       set rol = 'admin', updated_at = now()
      from public.bc_personas p
     where p.id = e.bc_persona_id
       and p.admin and not p.cliente
       and e.rol <> 'admin'
       and e.rol_manual is not true
    returning e.nombre
  )
  select coalesce(array_agg(nombre order by nombre), '{}') into nuevos from cambios;
  perform set_config('app.rol_automatico', '', true);
  return nuevos;
end;
$$;

revoke execute on function public.equipo_admins_de_basecamp() from public, anon;
grant execute on function public.equipo_admins_de_basecamp() to authenticated;
