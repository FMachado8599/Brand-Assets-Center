-- ============================================================
-- Clientes: sus cuentas de redes, y de cuál salió el logo
-- Supabase → SQL Editor → pegar todo → Run. Se puede correr más de una vez.
-- Va después de migracion-clientes.sql (usa la tabla brands con su ficha).
-- ============================================================

-- Las cuentas: [{ "network": "instagram", "handle": "camaratbwa" }, …]. El link se arma en la app.
alter table public.brands add column if not exists socials jsonb not null default '[]'::jsonb;
-- Si el logo es la foto de perfil de una de sus cuentas, cuál ("instagram:camaratbwa"). La foto
-- se guarda en el bucket logos como cualquier logo: esto es para mostrarla como foto (redonda,
-- sin aire alrededor) y para marcar la cuenta elegida en la ficha.
alter table public.brands add column if not exists logo_from text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'brands_socials_is_array') then
    alter table public.brands add constraint brands_socials_is_array check (jsonb_typeof(socials) = 'array' and jsonb_array_length(socials) <= 20);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'brands_logo_from_length') then
    alter table public.brands add constraint brands_logo_from_length check (logo_from is null or char_length(logo_from) <= 140);
  end if;
end $$;

-- PostgREST lee las columnas nuevas recién al recargar su esquema.
notify pgrst, 'reload schema';
