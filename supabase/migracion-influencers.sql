-- ============================================================
-- Influencers (Influencity): quién trabajó con cada cliente y cómo rindió.
-- Influencity es la fuente: sus trackings de contenido (las campañas que mide), las publicaciones
-- de cada uno con sus métricas y los perfiles con su audiencia. Acá queda una copia para mirarlo
-- todo junto, cruzarlo con los clientes y vincularlo con el resto de las herramientas
-- (Planificación, Board, la ficha del cliente).
-- Las tablas inf_* se pueden vaciar y volver a traer. Lo propio de la app (a qué cliente va cada
-- campaña cuando se eligió a mano, notas y vínculos) vive en las columnas *_manual, notas e
-- inf_vinculos.
-- Correr DESPUÉS de migracion-integraciones.sql (tabla integraciones, has_access()) y de
-- migracion-redes.sql (brands.socials: así se reconocen las cuentas de cada cliente).
-- Supabase → SQL Editor → pegar todo → Run. Se puede correr más de una vez.
-- ============================================================

-- 1. La conexión: el token de la API de Influencity, cifrado como los de Basecamp y Google.
alter table public.integraciones drop constraint if exists integraciones_proveedor;
alter table public.integraciones
  add constraint integraciones_proveedor check (proveedor in ('basecamp', 'google', 'influencity'));

-- 2. Perfiles: los influencers (y cualquier cuenta que aparezca en una publicación medida).
create table if not exists public.inf_perfiles (
  -- El id de Influencity (24 caracteres hex).
  id text primary key,
  red text not null,
  usuario text not null,
  nombre text,
  foto_url text,
  url text,
  verificado boolean,
  seguidores bigint,
  -- Engagement promedio del perfil, en % (interacciones / seguidores).
  engagement numeric,
  pais text,
  tipo_cuenta text,
  -- Estado del análisis de audiencia en Influencity (ok, new, notAnalyzed, private…).
  estado text,
  analizando boolean not null default false,
  -- Todo lo que devuelve GET /profiles/v1/profiles/{id} (audiencia, precio estimado, CPM…).
  detalle jsonb,
  -- Cuándo se pidió ese detalle (se vuelve a pedir cada 7 días) y si Influencity no lo tenía.
  detalle_leido timestamptz,
  detalle_error text,
  actualizado_en_influencity timestamptz,
  notas text,
  creado timestamptz not null default now(),
  sincronizado timestamptz not null default now()
);
create index if not exists inf_perfiles_usuario_idx on public.inf_perfiles (red, lower(usuario));

-- 3. Trackings: cada campaña que Influencity mide (por hashtags/menciones/palabras o un perfil).
create table if not exists public.inf_trackings (
  id text primary key,
  nombre text not null,
  estado text,
  tipo text,
  inicio timestamptz,
  fin timestamptz,
  origen text,
  -- De qué cliente es. Sin elegirlo a mano (brand_manual), la sincronización lo deduce del nombre.
  brand_id uuid references public.brands(id) on delete set null,
  brand_manual boolean not null default false,
  publicaciones int,
  -- La última vez que se leyeron sus publicaciones.
  leido timestamptz,
  -- false si ya no aparece en Influencity (lo que se trajo queda como registro).
  en_influencity boolean not null default true,
  creado timestamptz not null default now(),
  sincronizado timestamptz not null default now()
);
create index if not exists inf_trackings_brand_idx on public.inf_trackings (brand_id);

-- 4. Los clientes (brandClients) y campañas (campaignsV3) que Influencity anota en cada publicación.
create table if not exists public.inf_grupos (
  tipo text not null check (tipo in ('cliente', 'campana')),
  id text not null,
  nombre text,
  brand_id uuid references public.brands(id) on delete set null,
  brand_manual boolean not null default false,
  primary key (tipo, id)
);

-- 5. Publicaciones, con las métricas principales en columnas (para sumar y ordenar) y todo lo
-- demás en datos (stickers, música, derechos de uso…).
create table if not exists public.inf_publicaciones (
  id text primary key,
  red text,
  tipo text,
  url text,
  imagen text,
  -- El caption o, en YouTube/TikTok, el título.
  texto text,
  fecha timestamptz,
  -- El autor (el primer perfil) y todos los perfiles de la publicación (colaboraciones).
  perfil_id text references public.inf_perfiles(id) on delete set null,
  perfiles text[] not null default '{}',
  trackings text[] not null default '{}',
  grupos_cliente text[] not null default '{}',
  grupos_campana text[] not null default '{}',
  -- Menciones, etiquetados y colaboradores, en minúscula y sin @ (para reconocer al cliente).
  menciones text[] not null default '{}',
  views bigint,
  likes bigint,
  comentarios bigint,
  compartidos bigint,
  guardados bigint,
  impresiones bigint,
  alcance bigint,
  interacciones bigint,
  engagement numeric,
  patrocinada boolean,
  -- live, removed o expired.
  estado_red text,
  -- De qué cliente es y por qué (inf_resolver_clientes). Con brand_manual no se recalcula.
  brand_id uuid references public.brands(id) on delete set null,
  brand_origen text,
  brand_manual boolean not null default false,
  datos jsonb not null default '{}'::jsonb,
  actualizada timestamptz,
  sincronizada timestamptz not null default now()
);
create index if not exists inf_publicaciones_brand_idx on public.inf_publicaciones (brand_id, fecha desc);
create index if not exists inf_publicaciones_perfil_idx on public.inf_publicaciones (perfil_id, fecha desc);
create index if not exists inf_publicaciones_trackings_idx on public.inf_publicaciones using gin (trackings);
create index if not exists inf_publicaciones_perfiles_idx on public.inf_publicaciones using gin (perfiles);

-- 6. Vínculos con el resto de las herramientas: "trabajó con este cliente" (tipo cliente, cargado a
-- mano, sirve también para lo que no midió Influencity), una pieza o plani de Planificación, una
-- tarea del Board… Cada módulo guarda su id (ref) y cómo mostrarse (titulo, href), así la ficha
-- del influencer los lista sin conocer las tablas de cada uno.
create table if not exists public.inf_vinculos (
  id uuid primary key default gen_random_uuid(),
  perfil_id text not null references public.inf_perfiles(id) on delete cascade,
  -- cliente · plani · pieza · tarea (o el que agregue otro módulo).
  tipo text not null,
  ref text not null,
  brand_id uuid references public.brands(id) on delete cascade,
  titulo text,
  href text,
  nota text,
  creado_por text default (auth.jwt() ->> 'email'),
  creado timestamptz not null default now(),
  unique (perfil_id, tipo, ref)
);
create index if not exists inf_vinculos_brand_idx on public.inf_vinculos (brand_id);
create index if not exists inf_vinculos_ref_idx on public.inf_vinculos (tipo, ref);

-- 7. Estado de la sincronización.
create table if not exists public.inf_sync (
  id text primary key default 'influencity',
  ultimo timestamptz,
  ultimo_error text,
  -- Lo que se trajo la última vez y, mientras corre, por dónde va.
  resumen jsonb not null default '{}'::jsonb,
  -- Lo que queda del plan: lugares para perfiles en trackings y análisis de audiencia.
  cuotas jsonb,
  corriendo_desde timestamptz,
  constraint inf_sync_unica check (id = 'influencity')
);

-- Toma el turno de sincronizar: si otro lo está haciendo (hace menos de 2 minutos), devuelve false.
create or replace function public.inf_tomar_sync()
returns boolean language plpgsql security definer set search_path = '' as $$
declare ok boolean;
begin
  if not public.has_access() then
    return false;
  end if;
  insert into public.inf_sync (id) values ('influencity') on conflict (id) do nothing;
  update public.inf_sync
     set corriendo_desde = now()
   where id = 'influencity'
     and (corriendo_desde is null or corriendo_desde < now() - interval '2 minutes')
  returning true into ok;
  return coalesce(ok, false);
end;
$$;

-- 8. A qué cliente va cada publicación. En orden: lo elegido a mano en la publicación; el cliente
-- de Influencity (brandClient) ya asignado a un cliente de acá; la campaña de Influencity; el
-- tracking; que la haya publicado una cuenta del cliente; que mencione o etiquete a una cuenta del
-- cliente (brands.socials). Devuelve cuántas cambiaron.
create or replace function public.inf_resolver_clientes()
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not public.has_access() then
    raise exception 'Sin acceso';
  end if;

  with cuentas as (
    select b.id as brand_id, lower(s ->> 'handle') as usuario, s ->> 'network' as red
      from public.brands b
     cross join lateral jsonb_array_elements(coalesce(b.socials, '[]'::jsonb)) s
     where jsonb_typeof(coalesce(b.socials, '[]'::jsonb)) = 'array' and coalesce(s ->> 'handle', '') <> ''
  ),
  r as (
    select p.id, x.brand_id, x.origen
      from public.inf_publicaciones p
      left join public.inf_perfiles autor on autor.id = p.perfil_id
      left join lateral (
        select c.brand_id, c.origen
          from (
            select g.brand_id, 'cliente'::text as origen, 1 as prioridad, g.id as orden
              from public.inf_grupos g
             where g.tipo = 'cliente' and g.id = any (p.grupos_cliente) and g.brand_id is not null
            union all
            select g.brand_id, 'campana', 2, g.id
              from public.inf_grupos g
             where g.tipo = 'campana' and g.id = any (p.grupos_campana) and g.brand_id is not null
            union all
            select t.brand_id, 'tracking', 3, t.id
              from public.inf_trackings t
             where t.id = any (p.trackings) and t.brand_id is not null
            union all
            select k.brand_id, 'propia', 4, k.brand_id::text
              from cuentas k
             where autor.id is not null
               and k.usuario = lower(autor.usuario)
               and (k.red = autor.red or (k.red = 'x' and autor.red = 'twitter'))
            union all
            select k.brand_id, 'mencion', 5, k.brand_id::text
              from cuentas k
             where k.usuario = any (p.menciones)
          ) c
         order by c.prioridad, c.orden
         limit 1
      ) x on true
     where not p.brand_manual
  )
  update public.inf_publicaciones p
     set brand_id = r.brand_id, brand_origen = r.origen
    from r
   where p.id = r.id
     and (p.brand_id is distinct from r.brand_id or p.brand_origen is distinct from r.origen);
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Elegir a mano de qué cliente es un tracking, un cliente/campaña de Influencity o una publicación.
-- p_brand null = de ningún cliente. p_auto = volver a lo automático. Recalcula las publicaciones.
create or replace function public.inf_asignar(p_tipo text, p_id text, p_brand uuid, p_auto boolean default false)
returns int language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_access() then
    raise exception 'Sin acceso';
  end if;
  if p_tipo = 'tracking' then
    update public.inf_trackings
       set brand_id = case when p_auto then brand_id else p_brand end, brand_manual = not p_auto
     where id = p_id;
  elsif p_tipo in ('cliente', 'campana') then
    update public.inf_grupos
       set brand_id = case when p_auto then brand_id else p_brand end, brand_manual = not p_auto
     where tipo = p_tipo and id = p_id;
  elsif p_tipo = 'publicacion' then
    update public.inf_publicaciones
       set brand_id = case when p_auto then brand_id else p_brand end,
           brand_origen = case when p_auto then brand_origen else 'manual' end,
           brand_manual = not p_auto
     where id = p_id;
  else
    raise exception 'Tipo desconocido: %', p_tipo;
  end if;
  return public.inf_resolver_clientes();
end;
$$;

-- 9. Vistas -----------------------------------------------------------

-- Los perfiles, sin el detalle pesado y con cuenta_de: el cliente al que pertenece la cuenta, si es
-- de un cliente (esas no cuentan como influencers).
create or replace view public.inf_perfiles_lista with (security_invoker = true) as
select p.id, p.red, p.usuario, p.nombre, p.foto_url, p.url, p.verificado, p.seguidores, p.engagement,
       p.pais, p.tipo_cuenta, p.estado, p.analizando, p.detalle_leido, p.detalle_error, p.notas, p.creado,
       (select b.id
          from public.brands b
         cross join lateral jsonb_array_elements(coalesce(b.socials, '[]'::jsonb)) s
         where jsonb_typeof(coalesce(b.socials, '[]'::jsonb)) = 'array'
           and lower(s ->> 'handle') = lower(p.usuario)
           and (s ->> 'network' = p.red or (s ->> 'network' = 'x' and p.red = 'twitter'))
         limit 1) as cuenta_de
  from public.inf_perfiles p;

-- Rendimiento por influencer, cliente, mes y red. Una colaboración cuenta para cada perfil que la
-- firmó; principal marca la fila del autor, para sumar totales sin contar dos veces.
create or replace view public.inf_rendimiento with (security_invoker = true) as
select pid as perfil_id,
       p.brand_id,
       date_trunc('month', p.fecha)::date as mes,
       p.red,
       bool_or(pid = p.perfil_id) as principal,
       count(*)::int as publicaciones,
       coalesce(sum(p.views), 0)::bigint as views,
       coalesce(sum(p.likes), 0)::bigint as likes,
       coalesce(sum(p.comentarios), 0)::bigint as comentarios,
       coalesce(sum(p.compartidos), 0)::bigint as compartidos,
       coalesce(sum(p.guardados), 0)::bigint as guardados,
       coalesce(sum(p.impresiones), 0)::bigint as impresiones,
       coalesce(sum(p.alcance), 0)::bigint as alcance,
       coalesce(sum(p.interacciones), 0)::bigint as interacciones,
       coalesce(sum(p.engagement), 0)::float8 as engagement_suma,
       count(p.engagement)::int as engagement_n,
       (count(*) filter (where p.patrocinada))::int as patrocinadas,
       min(p.fecha) as primera,
       max(p.fecha) as ultima
  from public.inf_publicaciones p
 cross join lateral unnest(case when cardinality(p.perfiles) > 0 then p.perfiles else array[p.perfil_id] end) as pid
 where pid is not null
 group by pid, p.brand_id, date_trunc('month', p.fecha), p.red, (pid = p.perfil_id);

-- 10. Permisos: solo el estudio -------------------------------------------
alter table public.inf_perfiles enable row level security;
alter table public.inf_trackings enable row level security;
alter table public.inf_grupos enable row level security;
alter table public.inf_publicaciones enable row level security;
alter table public.inf_vinculos enable row level security;
alter table public.inf_sync enable row level security;

do $$
declare t text;
begin
  foreach t in array array['inf_perfiles', 'inf_trackings', 'inf_grupos', 'inf_publicaciones', 'inf_vinculos', 'inf_sync']
  loop
    execute format('drop policy if exists "solo el estudio" on public.%I', t);
    execute format(
      'create policy "solo el estudio" on public.%I for all to authenticated using ((select public.has_access())) with check ((select public.has_access()))',
      t
    );
  end loop;
end $$;

revoke execute on function public.inf_tomar_sync() from anon;
revoke execute on function public.inf_resolver_clientes() from anon;
revoke execute on function public.inf_asignar(text, text, uuid, boolean) from anon;
