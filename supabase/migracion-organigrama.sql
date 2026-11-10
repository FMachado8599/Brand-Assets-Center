-- ============================================================
-- Board: el organigrama del estudio.
-- Quién depende de quién. Una persona puede tener más de un jefe (ej: la coordinadora de redacción
-- y CM depende de los dos directores digitales). Se arma a mano en el Board (Organización):
-- arrastrando a alguien sobre otra persona, o eligiendo sus jefes en su ficha. Arriba de todo quedan
-- los que no dependen de nadie; los que todavía no se ubicaron quedan aparte ("Sin ubicar").
-- También: equipos de un cliente (ej: "Equipo BBVA") con uno o más directores, además de los hubs.
-- Correr DESPUÉS de migracion-equipo.sql.
-- Supabase → SQL Editor → pegar todo → Run. Se puede correr más de una vez (también sobre la versión
-- anterior de esta migración, que tenía un solo jefe por persona).
-- ============================================================

-- 1. Quién está en el organigrama ------------------------------------
-- true = ya está ubicado (aunque no dependa de nadie: los de arriba de todo).
alter table public.equipo add column if not exists en_organigrama boolean not null default false;
-- De la versión anterior (un solo jefe). Ya no se usa: lo que tenía pasa a equipo_jefes.
alter table public.equipo add column if not exists reporta_a uuid references public.equipo(id) on delete set null;
drop trigger if exists equipo_sin_ciclos on public.equipo;

-- 2. Jefes (uno o más por persona) -----------------------------------
create table if not exists public.equipo_jefes (
  persona_id uuid not null references public.equipo(id) on delete cascade,
  jefe_id uuid not null references public.equipo(id) on delete cascade,
  primary key (persona_id, jefe_id)
);
create index if not exists equipo_jefes_jefe_idx on public.equipo_jefes (jefe_id);

insert into public.equipo_jefes (persona_id, jefe_id)
select id, reporta_a from public.equipo where reporta_a is not null and reporta_a <> id
on conflict do nothing;
update public.equipo set reporta_a = null where reporta_a is not null;

-- Nadie puede quedar debajo de sí mismo, ni de alguien que ya depende de él (sería un círculo).
create or replace function public.equipo_jefes_sin_ciclos()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.persona_id = new.jefe_id then
    raise exception 'Nadie puede depender de sí mismo';
  end if;
  if exists (
    with recursive debajo(id) as (
      select ej.persona_id from public.equipo_jefes ej where ej.jefe_id = new.persona_id
      union
      select ej.persona_id from public.equipo_jefes ej join debajo d on ej.jefe_id = d.id
    )
    select 1 from debajo where id = new.jefe_id
  ) then
    raise exception 'Eso armaría un círculo: esa persona ya depende de quien querés poner debajo';
  end if;
  return new;
end;
$$;

drop trigger if exists equipo_jefes_sin_ciclos on public.equipo_jefes;
create trigger equipo_jefes_sin_ciclos before insert or update on public.equipo_jefes
  for each row execute function public.equipo_jefes_sin_ciclos();

-- 3. Hubs y equipos de un cliente ---------------------------------------
-- hub: grupo de marcas (los de diseño digital) · cliente: el equipo de un cliente (ej: BBVA), con su
-- gente propia. Los dos pueden tener uno o más directores.
alter table public.hubs add column if not exists tipo text not null default 'hub';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'hubs_tipo_check') then
    alter table public.hubs add constraint hubs_tipo_check check (tipo in ('hub', 'cliente'));
  end if;
end $$;

create table if not exists public.hub_lideres (
  hub_id uuid not null references public.hubs(id) on delete cascade,
  persona_id uuid not null references public.equipo(id) on delete cascade,
  primary key (hub_id, persona_id)
);
-- El director que tenía cada hub (uno solo) pasa a la tabla.
insert into public.hub_lideres (hub_id, persona_id)
select id, lider_id from public.hubs where lider_id is not null
on conflict do nothing;

-- 4. Lo que hace la app (solo admins) ------------------------------------
-- Los jefes de una persona (reemplaza los que tenía; vacío = arriba de todo). La deja en el organigrama.
create or replace function public.organigrama_jefes(p_persona uuid, p_jefes uuid[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_admin() then
    raise exception 'Solo un admin puede cambiar el organigrama';
  end if;
  delete from public.equipo_jefes where persona_id = p_persona;
  insert into public.equipo_jefes (persona_id, jefe_id)
  select p_persona, j from unnest(coalesce(p_jefes, '{}'::uuid[])) as j
  on conflict do nothing;
  update public.equipo set en_organigrama = true, updated_at = now() where id = p_persona;
end;
$$;

-- Arrastrar a alguien sobre otra persona: queda con ese único jefe (o arriba de todo, p_jefe null).
create or replace function public.organigrama_ubicar(p_persona uuid, p_jefe uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.organigrama_jefes(p_persona, case when p_jefe is null then '{}'::uuid[] else array[p_jefe] end);
end;
$$;

-- Sacarlo del organigrama: su gente pasa a depender de sus jefes (el árbol no se corta).
create or replace function public.organigrama_sacar(p_persona uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_admin() then
    raise exception 'Solo un admin puede cambiar el organigrama';
  end if;
  insert into public.equipo_jefes (persona_id, jefe_id)
  select sub.persona_id, arriba.jefe_id
    from public.equipo_jefes sub
    join public.equipo_jefes arriba on arriba.persona_id = p_persona
   where sub.jefe_id = p_persona and sub.persona_id <> arriba.jefe_id
  on conflict do nothing;
  delete from public.equipo_jefes where jefe_id = p_persona or persona_id = p_persona;
  update public.equipo set en_organigrama = false, updated_at = now() where id = p_persona;
end;
$$;

revoke execute on function public.organigrama_jefes(uuid, uuid[]) from anon;
revoke execute on function public.organigrama_ubicar(uuid, uuid) from anon;
revoke execute on function public.organigrama_sacar(uuid) from anon;

-- 5. Permisos: todo el estudio lee; los admins editan --------------------
alter table public.equipo_jefes enable row level security;
alter table public.hub_lideres enable row level security;

do $$
declare t text;
begin
  foreach t in array array['equipo_jefes', 'hub_lideres']
  loop
    execute format('drop policy if exists "el estudio lee" on public.%I', t);
    execute format('create policy "el estudio lee" on public.%I for select to authenticated using ((select public.has_access()))', t);
    execute format('drop policy if exists "admins editan" on public.%I', t);
    execute format(
      'create policy "admins editan" on public.%I for all to authenticated using ((select public.es_admin())) with check ((select public.es_admin()))',
      t
    );
  end loop;
end $$;
