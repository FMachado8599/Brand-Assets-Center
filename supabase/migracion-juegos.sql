-- ============================================================
-- Rest: los juegos del estudio y sus rankings
--  - Cada partida se abre en la base cuando arranca (empezar_partida) y se cierra con el
--    puntaje (terminar_partida). La base anota la hora en las dos puntas: un puntaje que no
--    da con el tiempo que pasó de verdad no entra al ranking.
--  - Ranking por juego (y por dificultad en el buscaminas): el mejor puntaje de cada persona,
--    de esta semana (arranca el lunes, hora de Montevideo) o de siempre.
--  - Dino: gana el puntaje más alto. Buscaminas: el menor tiempo (en milisegundos), y solo
--    cuentan las partidas ganadas.
-- Correr DESPUÉS de migracion-acceso.sql (usa has_access()) y migracion-usuarios.sql (profiles).
-- Supabase → SQL Editor → pegar todo → Run. Se puede correr más de una vez.
-- ============================================================

-- 1. Partidas ---------------------------------------------------
create table if not exists public.juego_partidas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  juego text not null check (juego in ('dino', 'buscaminas')),
  -- '' en el dino; la dificultad en el buscaminas.
  modo text not null default '' check (modo in ('', 'principiante', 'intermedio', 'experto')),
  empezada timestamptz not null default now(),
  terminada timestamptz,
  puntaje integer check (puntaje >= 0)
);

create index if not exists juego_partidas_ranking_idx
  on public.juego_partidas (juego, modo, terminada desc) where puntaje is not null;
create index if not exists juego_partidas_user_idx
  on public.juego_partidas (user_id, empezada desc);

-- Nada se lee ni se escribe directo: todo pasa por las funciones de abajo.
alter table public.juego_partidas enable row level security;

-- 2. Reglas de cada juego ------------------------------------------
-- El dino suma como mucho ~20 puntos por segundo (a velocidad máxima, ver lib/rest/dino/motor.ts):
-- con margen, más de 21 por segundo jugado no es posible.
-- El buscaminas no puede durar menos de lo que la base vio pasar entre el primer click y el
-- último (con 3 s de margen por la red), ni menos que un piso por dificultad.
create or replace function public.juego_puntaje_valido(p_juego text, p_modo text, p_ms numeric, p_puntaje integer)
returns boolean language sql immutable set search_path = '' as $$
  select case p_juego
    when 'dino' then p_puntaje <= ((p_ms / 1000.0) + 3) * 21 + 20
    when 'buscaminas' then
      p_puntaje >= p_ms - 3000
      and p_puntaje >= case p_modo when 'principiante' then 500 when 'intermedio' then 3000 else 10000 end
    else false
  end;
$$;

-- 3. Empezar ------------------------------------------------------
-- Devuelve el id de la partida, que después se manda con el puntaje.
create or replace function public.empezar_partida(p_juego text, p_modo text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  v_modo text := coalesce(p_modo, '');
  new_id uuid;
begin
  if uid is null or not coalesce(public.has_access(), false) then
    raise exception 'Iniciá sesión con tu cuenta del estudio';
  end if;
  if not (
    (p_juego = 'dino' and v_modo = '')
    or (p_juego = 'buscaminas' and v_modo in ('principiante', 'intermedio', 'experto'))
  ) then
    raise exception 'Juego o dificultad inválidos';
  end if;
  -- Una partida de dino puede durar dos segundos, pero 60 por minuto ya no es jugar.
  if (select count(*) from public.juego_partidas p
      where p.user_id = uid and p.empezada > now() - interval '1 minute') >= 60 then
    raise exception 'Demasiadas partidas seguidas: esperá un minuto';
  end if;

  -- Las que quedaron sin terminar (se cerró la pestaña, se perdió en el buscaminas) no sirven.
  delete from public.juego_partidas p
  where p.user_id = uid and p.terminada is null and p.empezada < now() - interval '1 day';

  insert into public.juego_partidas (user_id, juego, modo) values (uid, p_juego, v_modo)
  returning id into new_id;
  return new_id;
end;
$$;

-- 4. Terminar -------------------------------------------------------
-- Guarda el puntaje si es posible para el tiempo jugado y cuenta cómo quedó:
-- si es tu mejor marca y en qué puesto estás esta semana y desde siempre.
create or replace function public.terminar_partida(p_id uuid, p_puntaje integer)
returns table (es_record boolean, puesto_semana bigint, puesto_siempre bigint)
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  v public.juego_partidas;
  v_ms numeric;
  anterior integer;
begin
  if uid is null or not coalesce(public.has_access(), false) then
    raise exception 'Iniciá sesión con tu cuenta del estudio';
  end if;

  select * into v from public.juego_partidas p where p.id = p_id and p.user_id = uid for update;
  if not found then
    raise exception 'Esa partida no existe';
  end if;
  if v.terminada is not null then
    raise exception 'Esa partida ya terminó';
  end if;

  v_ms := extract(epoch from now() - v.empezada) * 1000;
  if v_ms > 3 * 3600 * 1000 then
    raise exception 'La partida venció';
  end if;
  if p_puntaje is null or p_puntaje < 0 or not public.juego_puntaje_valido(v.juego, v.modo, v_ms, p_puntaje) then
    raise exception 'Ese puntaje no da con el tiempo jugado';
  end if;

  -- La mejor marca de antes, para saber si esta la supera.
  select case when v.juego = 'dino' then max(p.puntaje) else min(p.puntaje) end into anterior
  from public.juego_partidas p
  where p.user_id = uid and p.juego = v.juego and p.modo = v.modo and p.puntaje is not null;

  update public.juego_partidas set terminada = now(), puntaje = p_puntaje where id = v.id;

  es_record := anterior is null or (case when v.juego = 'dino' then p_puntaje > anterior else p_puntaje < anterior end);
  select r.puesto into puesto_semana from public.ranking_juego(v.juego, v.modo, 'semana', 1000) r where r.yo;
  select r.puesto into puesto_siempre from public.ranking_juego(v.juego, v.modo, 'siempre', 1000) r where r.yo;
  return next;
end;
$$;

-- 5. Ranking ---------------------------------------------------------
-- El mejor puntaje de cada persona (con su nombre y foto de Google), de esta semana o de siempre.
-- Devuelve los primeros p_limite y, si estás más abajo, también tu fila. Solo para el estudio.
create or replace function public.ranking_juego(
  p_juego text,
  p_modo text default '',
  p_periodo text default 'semana',
  p_limite integer default 20
)
returns table (
  puesto bigint,
  nombre text,
  avatar text,
  puntaje integer,
  logrado timestamptz,
  jugadas bigint,
  yo boolean
)
language sql stable security definer set search_path = '' as $$
  with desde as (
    select case when p_periodo = 'siempre' then '-infinity'::timestamptz
      else (date_trunc('week', now() at time zone 'America/Montevideo')) at time zone 'America/Montevideo'
    end as t
  ),
  terminadas as (
    select p.user_id, p.puntaje, p.terminada
    from public.juego_partidas p, desde d
    where public.has_access()
      and p.juego = p_juego and p.modo = coalesce(p_modo, '')
      and p.puntaje is not null and p.terminada >= d.t
  ),
  mejores as (
    -- La mejor de cada persona; con dos iguales vale la primera que lo logró.
    select distinct on (t.user_id) t.user_id, t.puntaje, t.terminada,
      count(*) over (partition by t.user_id) as jugadas
    from terminadas t
    order by t.user_id,
      case when p_juego = 'dino' then -t.puntaje else t.puntaje end,
      t.terminada
  ),
  ranking as (
    select m.*,
      rank() over (order by case when p_juego = 'dino' then -m.puntaje else m.puntaje end) as puesto,
      row_number() over (order by case when p_juego = 'dino' then -m.puntaje else m.puntaje end, m.terminada) as orden
    from mejores m
  )
  select r.puesto,
    coalesce(nullif(trim(pr.full_name), ''), split_part(pr.email, '@', 1), 'Alguien'),
    pr.avatar_url,
    r.puntaje,
    r.terminada,
    r.jugadas,
    r.user_id = auth.uid()
  from ranking r
  left join public.profiles pr on pr.id = r.user_id
  where r.orden <= greatest(1, least(coalesce(p_limite, 20), 1000)) or r.user_id = auth.uid()
  order by r.orden;
$$;

-- Quién puede llamar a cada función.
revoke all on function public.juego_puntaje_valido(text, text, numeric, integer) from public, anon;
revoke all on function public.empezar_partida(text, text) from public, anon;
grant execute on function public.empezar_partida(text, text) to authenticated;
revoke all on function public.terminar_partida(uuid, integer) from public, anon;
grant execute on function public.terminar_partida(uuid, integer) to authenticated;
revoke all on function public.ranking_juego(text, text, text, integer) from public, anon;
grant execute on function public.ranking_juego(text, text, text, integer) to authenticated;
