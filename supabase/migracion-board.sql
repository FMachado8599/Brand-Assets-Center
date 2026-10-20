-- ============================================================
-- Board, paso 1: quién está en cada proyecto de Basecamp.
-- Con esto se puede armar "mis marcas" (los proyectos donde está cada persona) sin que cada uno
-- tenga que conectar su propio Basecamp: alcanza con la conexión del estudio.
-- Es una copia de Basecamp (como las otras tablas bc_*): se puede vaciar y volver a sincronizar.
-- Correr DESPUÉS de migracion-integraciones.sql (usa bc_proyectos y has_access()).
-- Supabase → SQL Editor → pegar todo → Run. Se puede correr más de una vez.
-- ============================================================

create table if not exists public.bc_proyecto_personas (
  proyecto_id bigint not null references public.bc_proyectos(id) on delete cascade,
  -- Sin foreign key a bc_personas: un proyecto puede tener gente que la cuenta no lista (clientes invitados).
  persona_id bigint not null,
  sincronizado timestamptz not null default now(),
  primary key (proyecto_id, persona_id)
);
create index if not exists bc_proyecto_personas_persona_idx on public.bc_proyecto_personas (persona_id);

alter table public.bc_proyecto_personas enable row level security;

drop policy if exists "solo el estudio" on public.bc_proyecto_personas;
create policy "solo el estudio" on public.bc_proyecto_personas
  for all to authenticated
  using ((select public.has_access()))
  with check ((select public.has_access()));
