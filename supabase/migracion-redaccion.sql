-- ============================================================
-- Redacción: las redacciones de cada persona, guardadas en su cuenta
-- Correr DESPUÉS de migracion-usuarios.sql (los emojis y hashtags de cada
-- cliente viajan en user_prefs, que crea esa migración).
-- Supabase → SQL Editor → pegar todo → Run. Se puede correr más de una vez.
-- ============================================================

-- Sin sesión, las redacciones quedan solo en el navegador. Con sesión, el
-- navegador sube cada cambio acá y al entrar desde otra computadora las trae.
-- El id lo genera el navegador (así se puede escribir sin conexión).
create table if not exists public.redacciones (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default '' check (char_length(title) <= 200),
  -- false: el nombre sigue a la primera línea del texto hasta que la persona lo cambie.
  title_edited boolean not null default false,
  -- Texto plano: para buscar y para pegar donde no hay formato.
  body text not null default '' check (char_length(body) <= 100000),
  -- El mismo texto con formato (negrita, cursiva, listas), como lo guarda el editor.
  html text not null default '' check (char_length(html) <= 300000),
  -- El cliente (una fila de brands: en Tarjetas se llaman marcas).
  -- Sin clave foránea a propósito: si se borra el cliente, la redacción queda (sin cliente) en vez de fallar al guardarse.
  brand_id uuid,
  created_at timestamptz not null default now(),
  -- La hora del cambio en el navegador: entre dos computadoras gana la edición más nueva.
  updated_at timestamptz not null default now(),
  -- Borrada: queda la marca para que las otras computadoras también la borren.
  deleted_at timestamptz
);

-- Si la tabla se creó antes de que el editor tuviera formato.
alter table public.redacciones add column if not exists html text not null default '';

create index if not exists redacciones_user_idx on public.redacciones(user_id, updated_at desc);

alter table public.redacciones enable row level security;

-- Cada persona ve y toca solo las suyas.
drop policy if exists "redacciones propias" on public.redacciones;
create policy "redacciones propias" on public.redacciones
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Una versión más vieja nunca pisa a una más nueva (ej: una computadora que
-- estuvo sin conexión y sube tarde). Tampoco se puede pasar una redacción a otra cuenta.
create or replace function public.redacciones_keep_newest()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.updated_at < old.updated_at then
    return null;
  end if;
  new.user_id := old.user_id;
  return new;
end;
$$;

drop trigger if exists redacciones_newest on public.redacciones;
create trigger redacciones_newest before update on public.redacciones
  for each row execute function public.redacciones_keep_newest();
