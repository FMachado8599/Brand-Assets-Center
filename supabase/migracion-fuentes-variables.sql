-- Ejecutá esto en Supabase → SQL Editor si YA habías corrido schema.sql.
-- Si todavía no lo corriste, con schema.sql alcanza: ya lo incluye.

alter table fonts add column if not exists is_variable boolean not null default false;
