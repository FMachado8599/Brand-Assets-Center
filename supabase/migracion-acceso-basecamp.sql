-- ============================================================
-- Lo de Basecamp lo ven solo las cuentas @camaratbwa.com (y los admins de la app).
--
-- A Herramientas también entran cuentas de afuera que habilita un admin (un freelance con Gmail, otra
-- agencia). Esas siguen usando las herramientas, pero no ven nada de Basecamp: ni las tareas (Status),
-- ni la gente y los proyectos, ni los avisos que vienen de Basecamp, ni "Para arrancar" en
-- Presentaciones. Todo el estudio (@camaratbwa.com) sigue viendo todo, como hasta ahora.
--
-- Cómo: ve_basecamp() dice si quien pide lo puede ver, y cada tabla de Basecamp suma una política
-- RESTRICTIVA con eso. Una restrictiva se suma (AND) a las que ya había: así, si se vuelve a correr una
-- migración vieja (que recrea sus políticas "solo el estudio"), esta regla sigue valiendo.
--
-- De paso: bc_webhooks tenía todavía la política vieja "solo el estudio" (la recreaba
-- migracion-notificaciones.sql al volver a correrla) y cualquiera del estudio podía editar los
-- webhooks. Queda solo para admins, como decía migracion-basecamp-conexion.sql.
--
-- Se corre como query guardada del SQL Editor ("Logic | Accesos"), no como migración.
-- Correr DESPUÉS de migracion-acceso, -equipo, -flujo, -notificaciones, -basecamp-conexion y
-- -presentaciones-board. Supabase → SQL Editor → pegar todo → Run. Se puede correr más de una vez: no
-- mueve datos.
-- ============================================================

-- 1. ¿Puede ver lo de Basecamp? -----------------------------------------
create or replace function public.ve_basecamp()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_access() and (
    lower(split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 2)) = 'camaratbwa.com'
    or public.es_admin()
  );
$$;

revoke execute on function public.ve_basecamp() from public, anon;
grant execute on function public.ve_basecamp() to authenticated;

-- 2. Las tablas de Basecamp (la copia que trae la sincronización) -------------
do $$
declare t text;
begin
  foreach t in array array['bc_proyectos', 'bc_personas', 'bc_tableros', 'bc_columnas', 'bc_tareas', 'bc_proyecto_personas']
  loop
    execute format('drop policy if exists "solo con Basecamp" on public.%I', t);
    execute format(
      'create policy "solo con Basecamp" on public.%I as restrictive for all to authenticated using ((select public.ve_basecamp())) with check ((select public.ve_basecamp()))',
      t
    );
  end loop;

  -- Lo que pasó en Basecamp (comentarios, menciones) y el Board armado con sus tareas: solo se leen.
  foreach t in array array['bc_eventos', 'tarea_flujo', 'tarea_movimientos']
  loop
    execute format('drop policy if exists "solo con Basecamp" on public.%I', t);
    execute format('create policy "solo con Basecamp" on public.%I as restrictive for select to authenticated using ((select public.ve_basecamp()))', t);
  end loop;
end $$;

-- 3. Los avisos: los que vienen de Basecamp, solo con Basecamp (los de la app, como siempre).
drop policy if exists "Basecamp solo con Basecamp" on public.notificaciones;
create policy "Basecamp solo con Basecamp" on public.notificaciones as restrictive for select to authenticated
  using (origen <> 'basecamp' or (select public.ve_basecamp()));

-- 4. Los webhooks, solo admins (se va la política vieja que dejaba a todo el estudio).
drop policy if exists "solo el estudio" on public.bc_webhooks;

-- 5. "Para arrancar" en Presentaciones: lee las tareas sin RLS (por velocidad), así que chequea acá.
-- Sin Basecamp devuelve la lista vacía en vez de un error: la página se ve igual.
create or replace function public.presentaciones_para_arrancar(p_limite int default 6, p_desde int default 0, p_buscar text default null)
returns table (
  id bigint, titulo text, app_url text, vence date, proyecto_id bigint, columna_id bigint, asignados bigint[],
  comentarios int, creada timestamptz, actualizada timestamptz, brand_id uuid, proyecto_nombre text, proyecto_url text,
  tablero_id bigint, columna_nombre text, columna_estado text, sector text, personas jsonb
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_access() then
    raise exception 'Solo el estudio' using errcode = '42501';
  end if;
  if not public.ve_basecamp() then
    return;
  end if;
  return query
  with rx as (
    select '\m(' || string_agg(regexp_replace(w, '([.*+?^${}()|\[\]\\])', '\\\1', 'g'), '|') || ')\M' as patron
      from public.presentacion_tipos t, unnest(t.palabras) w
     where length(btrim(w)) >= 2
  )
  select t.id, t.titulo, t.app_url, t.vence, t.proyecto_id, t.columna_id, t.asignados, t.comentarios, t.creada, t.actualizada,
         pr.brand_id, pr.nombre, pr.app_url, c.tablero_id, c.nombre, c.estado, tb.nombre,
         (select coalesce(jsonb_agg(jsonb_build_object('id', pe.id, 'nombre', pe.nombre, 'email', pe.email, 'avatar_url', pe.avatar_url, 'cargo', pe.cargo)), '[]'::jsonb)
            from public.bc_personas pe where pe.id = any(t.asignados))
    from public.bc_tareas t
    join public.bc_proyectos pr on pr.id = t.proyecto_id and not pr.ignorado
    left join public.bc_columnas c on c.id = t.columna_id
    left join public.bc_tableros tb on tb.id = c.tablero_id
    cross join rx
   where not t.completada
     and coalesce(c.estado, '') not in ('done', 'not_now')
     and rx.patron is not null
     and translate(lower(t.titulo), 'áàäâãéèëêíìïîóòöôõúùüûñç', 'aaaaaeeeeiiiiooooouuuunc') ~ rx.patron
     and not exists (select 1 from public.presentaciones p where p.bc_tarea_id = t.id)
     and (
       nullif(btrim(p_buscar), '') is null
       or translate(lower(t.titulo || ' ' || pr.nombre), 'áàäâãéèëêíìïîóòöôõúùüûñç', 'aaaaaeeeeiiiiooooouuuunc')
          like '%' || translate(lower(btrim(p_buscar)), 'áàäâãéèëêíìïîóòöôõúùüûñç', 'aaaaaeeeeiiiiooooouuuunc') || '%'
     )
   order by t.actualizada desc nulls last, t.id desc
   limit greatest(1, least(coalesce(p_limite, 6), 100))
   offset greatest(0, coalesce(p_desde, 0));
end;
$$;
revoke execute on function public.presentaciones_para_arrancar(int, int, text) from public, anon;
grant execute on function public.presentaciones_para_arrancar(int, int, text) to authenticated;
