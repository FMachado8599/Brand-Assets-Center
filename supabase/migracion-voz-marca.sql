-- El "kit de voz de marca" de cada cliente: un puñado de frases de referencia, vocabulario propio,
-- qué evitar y el tono, a mano (sin IA). Lo completa el equipo y alimenta el autocompletado de
-- Redacción (ver lib/redaccion). Re-ejecutable: solo agrega lo que falte.
-- Correr después de migracion-clientes.sql. No toca permisos: usa la misma política "solo el
-- estudio" que ya tiene brands (todo el estudio lee y edita, como notes o palette).

alter table public.brands add column if not exists voz_marca jsonb not null default '{}'::jsonb;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'brands_voz_marca_is_object') then
    alter table public.brands add constraint brands_voz_marca_is_object check (jsonb_typeof(voz_marca) = 'object');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'brands_voz_marca_length') then
    alter table public.brands add constraint brands_voz_marca_length check (char_length(voz_marca::text) <= 20000);
  end if;
end $$;

comment on column public.brands.voz_marca is
  'Kit de voz: { tono?: string, vocabulario?: string[], evitar?: string[], frases?: string[] }. Ver lib/types.ts VozMarca.';
