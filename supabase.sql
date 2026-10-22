-- «Призрачная пятёрка»: схема базы для Supabase (версия 2: аккаунты, друзья, приглашения).
-- Вставьте весь файл в SQL Editor проекта и нажмите Run.
-- Повторный запуск безопасен. Если вы уже запускали первую версию, файл её обновит.

-- ---------- Профили ----------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null,
  updated_at timestamptz not null default now()
);

alter table public.profiles drop constraint if exists profiles_nickname_check;
alter table public.profiles drop constraint if exists profiles_nickname_format;
alter table public.profiles add constraint profiles_nickname_format
  check (nickname ~ '^[A-Za-zА-Яа-яЁё0-9_.-]{3,20}$') not valid;
create unique index if not exists profiles_nickname_unique on public.profiles (lower(nickname));

-- Свободен ли ник (для формы регистрации, работает и до входа).
create or replace function public.nickname_available(n text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (select 1 from public.profiles where lower(nickname) = lower(trim(n)))
$$;

-- Профиль создаётся сам при регистрации; ник берётся из формы, при совпадении к нему добавляется число.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base text;
  nick text;
  k int := 0;
begin
  base := coalesce(nullif(trim(new.raw_user_meta_data ->> 'nickname'), ''), split_part(new.email, '@', 1));
  base := left(regexp_replace(base, '[^A-Za-zА-Яа-яЁё0-9_.-]', '', 'g'), 20);
  if char_length(base) < 3 then
    base := 'player';
  end if;
  nick := base;
  while exists (select 1 from public.profiles where lower(nickname) = lower(nick)) loop
    k := k + 1;
    nick := left(base, 20 - char_length(k::text)) || k::text;
  end loop;
  insert into public.profiles (id, nickname) values (new.id, nick)
  on conflict (id) do nothing;
  return new;
end
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Рейтинг и счёт партий. Новый игрок начинает с 1000.
alter table public.profiles add column if not exists rating int not null default 1000;
alter table public.profiles add column if not exists wins int not null default 0;
alter table public.profiles add column if not exists losses int not null default 0;
alter table public.profiles add column if not exists draws int not null default 0;
create index if not exists profiles_rating_idx on public.profiles (rating desc);

-- ---------- Друзья ----------

create table if not exists public.friendships (
  requester uuid not null references auth.users (id) on delete cascade,
  addressee uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (requester, addressee),
  check (requester <> addressee)
);
create index if not exists friendships_addressee_idx on public.friendships (addressee);

create or replace function public.are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.friendships
    where status = 'accepted'
      and ((requester = a and addressee = b) or (requester = b and addressee = a))
  )
$$;

-- Заявка в друзья по нику. Возвращает: 'sent', 'accepted' (встречная заявка), 'already', 'pending'.
create or replace function public.send_friend_request(nick text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  them uuid;
  row_ public.friendships;
begin
  if me is null then raise exception 'Нужно войти'; end if;
  select id into them from public.profiles where lower(nickname) = lower(trim(nick));
  if them is null then raise exception 'Игрок с ником % не найден', trim(nick); end if;
  if them = me then raise exception 'Это ваш собственный ник'; end if;

  select * into row_ from public.friendships where requester = them and addressee = me;
  if found then
    if row_.status = 'pending' then
      update public.friendships set status = 'accepted' where requester = them and addressee = me;
      return 'accepted';
    end if;
    return 'already';
  end if;

  select * into row_ from public.friendships where requester = me and addressee = them;
  if found then
    return case when row_.status = 'accepted' then 'already' else 'pending' end;
  end if;

  insert into public.friendships (requester, addressee) values (me, them);
  return 'sent';
end
$$;

-- Ответ на заявку: принять или отклонить.
create or replace function public.respond_friend_request(other uuid, accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if accept then
    update public.friendships set status = 'accepted'
     where requester = other and addressee = auth.uid() and status = 'pending';
  else
    delete from public.friendships
     where requester = other and addressee = auth.uid() and status = 'pending';
  end if;
end
$$;

-- Удалить из друзей или отменить свою заявку.
create or replace function public.remove_friend(other uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.friendships
   where (requester = auth.uid() and addressee = other)
      or (requester = other and addressee = auth.uid());
$$;

-- ---------- Партии ----------

create table if not exists public.games (
  code text primary key,
  p1 uuid not null references auth.users (id) on delete cascade,
  p2 uuid references auth.users (id) on delete set null,
  status text not null default 'waiting',
  cfg jsonb not null,
  looks jsonb not null,
  state jsonb not null,
  score jsonb not null default '{"1": 0, "2": 0, "d": 0}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.games add column if not exists invitee uuid references auth.users (id) on delete set null;

alter table public.games drop constraint if exists games_code_check;
alter table public.games add constraint games_code_check check (code ~ '^[A-Z0-9]{4,8}$');
alter table public.games drop constraint if exists games_status_check;
alter table public.games add constraint games_status_check check (status in ('waiting', 'playing', 'declined'));

create index if not exists games_updated_idx on public.games (updated_at desc);
create index if not exists games_p1_idx on public.games (p1);
create index if not exists games_p2_idx on public.games (p2);
create index if not exists games_invitee_idx on public.games (invitee);

-- Тайные ходы: в таблице лежит только хеш хода (commit), сам ход (reveal)
-- появляется, когда сходили оба игрока.
create table if not exists public.moves (
  game_code text not null references public.games (code) on delete cascade,
  seat smallint not null check (seat in (1, 2)),
  game_no int not null,
  round int not null,
  commit text not null,
  reveal jsonb,
  updated_at timestamptz not null default now(),
  primary key (game_code, seat)
);

-- Место текущего игрока в партии: 1, 2 или null.
create or replace function public.seat_of(g text)
returns smallint
language sql
stable
security definer
set search_path = public
as $$
  select (case when p1 = auth.uid() then 1 when p2 = auth.uid() then 2 end)::smallint
  from public.games
  where code = g
$$;

-- Защита партии от подмены игроков.
create or replace function public.games_guard()
returns trigger
language plpgsql
as $$
begin
  if new.code <> old.code or new.p1 <> old.p1 then
    raise exception 'Нельзя менять код партии и её создателя';
  end if;
  if old.p2 is not null and new.p2 is distinct from old.p2 then
    raise exception 'Второй игрок уже сидит за столом';
  end if;
  if old.p2 is null and new.p2 is not null and new.p2 <> auth.uid() then
    raise exception 'Сесть за стол можно только самому';
  end if;
  if new.invitee is distinct from old.invitee
     and auth.uid() <> old.p1
     and not (old.invitee = auth.uid() and new.invitee is null) then
    raise exception 'Менять приглашённого может только создатель партии';
  end if;
  new.updated_at := now();
  return new;
end
$$;

drop trigger if exists games_guard on public.games;
create trigger games_guard
before update on public.games
for each row execute function public.games_guard();

-- Приглашать можно только друзей.
create or replace function public.games_invite_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.invitee is not null
     and (tg_op = 'INSERT' or new.invitee is distinct from old.invitee)
     and not public.are_friends(new.p1, new.invitee) then
    raise exception 'Пригласить можно только друга';
  end if;
  return new;
end
$$;

drop trigger if exists games_invite_check on public.games;
create trigger games_invite_check
before insert or update on public.games
for each row execute function public.games_invite_check();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

drop trigger if exists moves_touch on public.moves;
create trigger moves_touch
before update on public.moves
for each row execute function public.touch_updated_at();

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch
before update on public.profiles
for each row execute function public.touch_updated_at();

-- Сесть за стол вторым игроком: приглашённому другу или по ссылке, если партия без приглашения.
drop function if exists public.join_game(text, jsonb);
create or replace function public.join_game(g text, my_look jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  joined text;
begin
  if auth.uid() is null then
    raise exception 'Нужно войти';
  end if;
  update public.games
     set p2 = auth.uid(),
         status = 'playing',
         looks = jsonb_set(looks, '{2}', my_look, true)
   where code = g
     and p2 is null
     and status = 'waiting'
     and p1 <> auth.uid()
     and (invitee is null or invitee = auth.uid())
  returning code into joined;
  return joined;
end
$$;

-- Итог партии: рейтинг считает сама база по сохранённому состоянию,
-- клиент только сообщает, что партия окончена. Флаг rated не даёт засчитать её дважды.
alter table public.games add column if not exists rated boolean not null default false;

create or replace function public.report_result(g text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.games;
  w int;
  r1 int;
  r2 int;
  exp1 numeric;
  s1 numeric;
  k constant int := 24;
begin
  select * into rec from public.games where code = g for update;
  if not found then return null; end if;
  if auth.uid() is null or auth.uid() not in (rec.p1, rec.p2) then
    raise exception 'Считать можно только свою партию';
  end if;
  if rec.rated or rec.p2 is null then return null; end if;
  -- Признак на время транзакции: только с ним сторож пропускает правку рейтинга.
  perform set_config('app.rating', 'on', true);
  if coalesce((rec.state ->> 'over')::boolean, false) is not true then return null; end if;

  w := coalesce((rec.state ->> 'winner')::int, 0);
  select rating into r1 from public.profiles where id = rec.p1;
  select rating into r2 from public.profiles where id = rec.p2;
  if r1 is null or r2 is null then return null; end if;

  exp1 := 1.0 / (1.0 + power(10.0, (r2 - r1) / 400.0));
  s1 := case w when 1 then 1.0 when 2 then 0.0 else 0.5 end;

  update public.profiles
     set rating = greatest(100, rating + round(k * (s1 - exp1))::int),
         wins = wins + (case when w = 1 then 1 else 0 end),
         losses = losses + (case when w = 2 then 1 else 0 end),
         draws = draws + (case when w = 0 then 1 else 0 end)
   where id = rec.p1;

  update public.profiles
     set rating = greatest(100, rating + round(k * ((1.0 - s1) - (1.0 - exp1)))::int),
         wins = wins + (case when w = 2 then 1 else 0 end),
         losses = losses + (case when w = 1 then 1 else 0 end),
         draws = draws + (case when w = 0 then 1 else 0 end)
   where id = rec.p2;

  update public.games set rated = true where code = g;
  return w;
end
$$;

-- Отказаться от приглашения в партию.
create or replace function public.decline_game(g text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.games
     set status = 'declined'
   where code = g and invitee = auth.uid() and p2 is null and status = 'waiting';
$$;

-- Права на функции.
revoke all on function public.join_game(text, jsonb) from public, anon;
revoke all on function public.decline_game(text) from public, anon;
revoke all on function public.report_result(text) from public, anon;
revoke all on function public.seat_of(text) from public, anon;
revoke all on function public.send_friend_request(text) from public, anon;
revoke all on function public.respond_friend_request(uuid, boolean) from public, anon;
revoke all on function public.remove_friend(uuid) from public, anon;
revoke all on function public.are_friends(uuid, uuid) from public, anon;
grant execute on function public.join_game(text, jsonb) to authenticated;
grant execute on function public.decline_game(text) to authenticated;
grant execute on function public.report_result(text) to authenticated;
grant execute on function public.seat_of(text) to authenticated;
grant execute on function public.send_friend_request(text) to authenticated;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;
grant execute on function public.are_friends(uuid, uuid) to authenticated;
grant execute on function public.nickname_available(text) to anon, authenticated;

-- ---------- Доступ (Row Level Security) ----------

alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.games enable row level security;
alter table public.moves enable row level security;

grant select, insert, update on public.profiles to authenticated;
grant select on public.friendships to authenticated;
grant select, insert, update, delete on public.games to authenticated;
grant select, insert, update on public.moves to authenticated;

-- Ники видны всем, кто вошёл (нужно для поиска друзей). Email не хранится в профиле.
drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles
  for select to authenticated using (true);
drop policy if exists "profiles insert own" on public.profiles;
create policy "profiles insert own" on public.profiles
  for insert to authenticated with check (id = auth.uid());
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Рейтинг и счётчики игрок себе не правит: их меняет только report_result.
create or replace function public.profiles_guard()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('app.rating', true), '') <> 'on'
     and (new.rating, new.wins, new.losses, new.draws) is distinct from (old.rating, old.wins, old.losses, old.draws) then
    new.rating := old.rating;
    new.wins := old.wins;
    new.losses := old.losses;
    new.draws := old.draws;
  end if;
  return new;
end
$$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard
before update on public.profiles
for each row execute function public.profiles_guard();

-- Дружбу видят только её участники; меняется она только через функции выше.
drop policy if exists "friendships read own" on public.friendships;
create policy "friendships read own" on public.friendships
  for select to authenticated using (auth.uid() in (requester, addressee));

-- Партию видят её игроки, приглашённый друг и (пока стол свободен) те, у кого есть ссылка.
drop policy if exists "games read" on public.games;
create policy "games read" on public.games
  for select to authenticated
  using (
    auth.uid() in (p1, p2)
    or auth.uid() = invitee
    or (p2 is null and invitee is null and status = 'waiting')
  );
drop policy if exists "games create" on public.games;
create policy "games create" on public.games
  for insert to authenticated with check (p1 = auth.uid() and p2 is null);
drop policy if exists "games update by players" on public.games;
create policy "games update by players" on public.games
  for update to authenticated
  using (auth.uid() in (p1, p2))
  with check (auth.uid() in (p1, p2));
-- Создатель удаляет свою партию всегда; второй игрок — пока в ней не сделано ни одного хода.
drop policy if exists "games delete by host" on public.games;
drop policy if exists "games delete" on public.games;
create policy "games delete" on public.games
  for delete to authenticated using (
    p1 = auth.uid()
    or (
      p2 = auth.uid()
      and coalesce((state ->> 'round')::int, 1) = 1
      and coalesce((state ->> 'moves')::int, 0) = 0
    )
  );

drop policy if exists "moves read" on public.moves;
create policy "moves read" on public.moves
  for select to authenticated using (public.seat_of(game_code) is not null);
drop policy if exists "moves write own seat" on public.moves;
create policy "moves write own seat" on public.moves
  for insert to authenticated with check (seat = public.seat_of(game_code));
drop policy if exists "moves update own seat" on public.moves;
create policy "moves update own seat" on public.moves
  for update to authenticated
  using (seat = public.seat_of(game_code))
  with check (seat = public.seat_of(game_code));

-- ---------- Обновления в реальном времени ----------

do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['games', 'moves', 'friendships'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end
$$;
