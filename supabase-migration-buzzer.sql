-- ============================================================================
-- Buzzer game-show edition ("Buzzed In", working title) — server-authoritative.
--
-- Unlike the first two editions (wide-open RLS, client-side trust), every
-- fairness- or score-critical action here goes through a SECURITY DEFINER
-- function that validates a key server-side. The base tables take NO direct
-- writes from the browser. Buzz order is decided by the database, not the
-- client, so the fastest phone/connection can't cheat.
--
-- Static config (board, categories, clues, settings) lives in the existing
-- `games` table with data->>'gameType' = 'buzzer', so this edition reuses the
-- host dashboard's create / host-link / list flows. Only the LIVE state gets
-- new tables below.
-- ============================================================================

-- ── Live per-game state (one row per game) ─────────────────────────────────
create table if not exists buzzer_state (
  game_id     text primary key references games(game_id) on delete cascade,
  phase       text not null default 'select',
              -- select   : board up, controller picks a clue
              -- reading  : clue live; buzzers unlock once open_at passes
              -- buzzed   : someone claimed it; host judges
              -- dd_assign/dd_wager/dd_answer : Daily Double flow
              -- reveal   : answer shown, then host advances
              -- over     : board cleared
  control     text not null default 'host',   -- 'host' or a player_id
  cur_cat     int,
  cur_idx     int,
  seq         int  not null default 0,         -- bumps each time buzzers (re)open
  winner      text,                            -- player_id who buzzed first, or null
  missed      jsonb not null default '[]',     -- player_ids locked out this clue
  done        jsonb not null default '[]',     -- "cat-idx" of finished clues
  open_at     timestamptz,                     -- when buzzers unlock (now + lockout)
  lockout_ms  int  not null default 1000,
  dd_player   text,                            -- Daily Double: who's answering
  dd_wager    int,
  reveal      jsonb,                            -- {answer, who, delta} for the reveal beat
  updated_at  timestamptz not null default now()
);

-- ── Roster + running score (public-readable; no secrets here) ──────────────
create table if not exists buzzer_players (
  game_id      text not null references games(game_id) on delete cascade,
  player_id    text not null,
  name         text not null,
  team         text,                           -- null = playing as an individual
  score        int  not null default 0,
  avatar       text,
  final_wager  int,
  final_answer text,
  joined_at    timestamptz not null default now(),
  primary key (game_id, player_id)
);

-- ── Per-player secret, used to authenticate a player's own actions ─────────
-- (kept out of buzzer_players so it's never selectable by the browser).
create table if not exists buzzer_player_keys (
  game_id   text not null references games(game_id) on delete cascade,
  player_id text not null,
  player_key text not null,
  primary key (game_id, player_id)
);

-- ── Buzz log (server-timestamped; winner is decided atomically below) ──────
create table if not exists buzz_events (
  id        bigserial primary key,
  game_id   text not null,
  seq       int  not null,
  player_id text not null,
  buzzed_at timestamptz not null default clock_timestamp()
);
create index if not exists buzz_events_game_seq on buzz_events (game_id, seq);

-- ── Row-level security ─────────────────────────────────────────────────────
-- State + roster are readable by anyone (needed for the three screens to
-- subscribe via realtime) but hold no secrets. Keys + buzz log are fully
-- locked — only the SECURITY DEFINER functions below touch them. NO table
-- has a write policy, so the browser can never write directly.
alter table buzzer_state       enable row level security;
alter table buzzer_players     enable row level security;
alter table buzzer_player_keys enable row level security;
alter table buzz_events        enable row level security;

drop policy if exists buzzer_state_read   on buzzer_state;
drop policy if exists buzzer_players_read  on buzzer_players;
create policy buzzer_state_read   on buzzer_state   for select using (true);
create policy buzzer_players_read on buzzer_players for select using (true);
-- (buzzer_player_keys and buzz_events intentionally get no policies)

-- Live updates for the three screens.
alter publication supabase_realtime add table buzzer_state;
alter publication supabase_realtime add table buzzer_players;

-- ── Auth helpers ───────────────────────────────────────────────────────────
create or replace function _buzzer_is_host(p_game text, p_key text)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from games
    where game_id = p_game and (data->>'hostKey') = p_key
  );
$$;

create or replace function _buzzer_is_player(p_game text, p_player text, p_key text)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from buzzer_player_keys
    where game_id = p_game and player_id = p_player and player_key = p_key
  );
$$;

-- ── Join: create a roster row + issue a private player key ─────────────────
create or replace function buzzer_join(
  p_game text, p_name text, p_team text default null, p_avatar text default null
) returns json language plpgsql security definer as $$
declare v_pid text; v_key text;
begin
  v_pid := replace(gen_random_uuid()::text, '-', '');
  v_key := replace(gen_random_uuid()::text, '-', '');
  insert into buzzer_players (game_id, player_id, name, team, avatar)
    values (p_game, v_pid, p_name, p_team, p_avatar);
  insert into buzzer_player_keys (game_id, player_id, player_key)
    values (p_game, v_pid, v_key);
  insert into buzzer_state (game_id) values (p_game)
    on conflict (game_id) do nothing;
  -- first player to join gets first board control if the host hasn't set it
  update buzzer_state set control = v_pid
    where game_id = p_game and control = 'host'
      and (select count(*) from buzzer_players where game_id = p_game) = 1;
  return json_build_object('player_id', v_pid, 'player_key', v_key);
end $$;

-- ── Pick a clue (by whoever currently controls the board) ──────────────────
create or replace function buzzer_pick(
  p_game text, p_actor text, p_key text, p_cat int, p_idx int
) returns void language plpgsql security definer as $$
declare st buzzer_state; is_dd boolean; ok boolean;
begin
  select * into st from buzzer_state where game_id = p_game for update;
  if st.phase <> 'select' then return; end if;
  if st.control = 'host'
    then ok := _buzzer_is_host(p_game, p_key);
    else ok := (p_actor = st.control) and _buzzer_is_player(p_game, p_actor, p_key);
  end if;
  if not ok then raise exception 'not your turn to pick'; end if;
  if st.done @> to_jsonb(p_cat || '-' || p_idx) then return; end if;

  select coalesce((data->'board'->'categories'->p_cat->'clues'->p_idx->>'dd')::boolean, false)
    into is_dd from games where game_id = p_game;

  update buzzer_state set
    cur_cat = p_cat, cur_idx = p_idx, winner = null, missed = '[]'::jsonb, reveal = null,
    seq = seq + 1,
    phase = case when is_dd then (case when st.control = 'host' then 'dd_assign' else 'dd_wager' end)
                 else 'reading' end,
    dd_player = case when is_dd and st.control <> 'host' then st.control else null end,
    dd_wager = null,
    open_at = case when is_dd then null else now() + (lockout_ms || ' milliseconds')::interval end,
    updated_at = now()
  where game_id = p_game;
end $$;

-- ── Buzz: the database decides who's first ─────────────────────────────────
-- Returns true only to the one caller whose atomic winner-claim succeeded.
create or replace function buzzer_buzz(
  p_game text, p_player text, p_key text
) returns boolean language plpgsql security definer as $$
declare st buzzer_state;
begin
  if not _buzzer_is_player(p_game, p_player, p_key) then return false; end if;
  select * into st from buzzer_state where game_id = p_game;
  if st.phase <> 'reading' then return false; end if;         -- clue not live
  if clock_timestamp() < st.open_at then return false; end if; -- buzzed during lockout
  if st.missed @> to_jsonb(p_player) then return false; end if; -- already missed this clue

  update buzzer_state set winner = p_player, phase = 'buzzed', updated_at = now()
    where game_id = p_game and phase = 'reading' and winner is null;

  if found then
    insert into buzz_events (game_id, seq, player_id) values (p_game, st.seq, p_player);
    return true;
  end if;
  return false;
end $$;

-- ── Host assigns a Daily Double to a player (when the host controlled the board) ──
create or replace function buzzer_assign_dd(
  p_game text, p_key text, p_player text
) returns void language plpgsql security definer as $$
begin
  if not _buzzer_is_host(p_game, p_key) then raise exception 'host only'; end if;
  update buzzer_state set dd_player = p_player, control = p_player, phase = 'dd_wager', updated_at = now()
    where game_id = p_game and phase = 'dd_assign';
end $$;

-- ── Daily Double wager (private, by the player who landed on it) ───────────
create or replace function buzzer_wager(
  p_game text, p_player text, p_key text, p_amount int
) returns void language plpgsql security definer as $$
declare st buzzer_state; v_score int; v_max int; v_amt int;
begin
  if not _buzzer_is_player(p_game, p_player, p_key) then raise exception 'bad key'; end if;
  select * into st from buzzer_state where game_id = p_game for update;
  if st.phase <> 'dd_wager' or st.dd_player <> p_player then return; end if;
  select score into v_score from buzzer_players where game_id = p_game and player_id = p_player;
  v_max := greatest(v_score, 1000);                 -- "true daily double" floor of the top clue value
  v_amt := least(greatest(p_amount, 200), v_max);
  update buzzer_state set dd_wager = v_amt, phase = 'dd_answer', updated_at = now()
    where game_id = p_game;
end $$;

-- ── Host marks the buzzed-in (or Daily Double) answer right or wrong ───────
create or replace function buzzer_judge(
  p_game text, p_key text, p_correct boolean
) returns void language plpgsql security definer as $$
declare st buzzer_state; clue jsonb; val int; ans text; k text; remaining int;
begin
  if not _buzzer_is_host(p_game, p_key) then raise exception 'host only'; end if;
  select * into st from buzzer_state where game_id = p_game for update;
  select data->'board'->'categories'->st.cur_cat->'clues'->st.cur_idx
    into clue from games where game_id = p_game;
  val := (clue->>'v')::int; ans := clue->>'answer';
  k := st.cur_cat || '-' || st.cur_idx;

  if st.phase = 'dd_answer' then
    update buzzer_players set score = score + (case when p_correct then st.dd_wager else -st.dd_wager end)
      where game_id = p_game and player_id = st.dd_player;
    update buzzer_state set
      control = st.dd_player,          -- the DD player keeps the board
      reveal  = json_build_object('answer', ans, 'who', case when p_correct then st.dd_player end,
                                  'delta', (case when p_correct then 1 else -1 end) * st.dd_wager),
      phase = 'reveal', done = done || to_jsonb(k), updated_at = now()
    where game_id = p_game;
    return;
  end if;

  if st.phase <> 'buzzed' then return; end if;

  if p_correct then
    update buzzer_players set score = score + val
      where game_id = p_game and player_id = st.winner;
    update buzzer_state set
      control = st.winner, reveal = json_build_object('answer', ans, 'who', st.winner, 'delta', val),
      phase = 'reveal', done = done || to_jsonb(k), updated_at = now()
    where game_id = p_game;
  else
    update buzzer_players set score = score - val
      where game_id = p_game and player_id = st.winner;
    -- anyone left who hasn't missed this clue?
    select count(*) into remaining from buzzer_players bp
      where bp.game_id = p_game
        and not ((st.missed || to_jsonb(st.winner)) @> to_jsonb(bp.player_id));
    if remaining = 0 then
      update buzzer_state set
        missed = missed || to_jsonb(st.winner), winner = null, control = 'host',
        reveal = json_build_object('answer', ans, 'who', null, 'delta', 0),
        phase = 'reveal', done = done || to_jsonb(k), updated_at = now()
      where game_id = p_game;
    else
      update buzzer_state set
        missed = missed || to_jsonb(st.winner), winner = null, phase = 'reading',
        open_at = now(), seq = seq + 1, updated_at = now()
      where game_id = p_game;   -- reopen for everyone else (no lockout on a reopen)
    end if;
  end if;
end $$;

-- ── Host: nobody buzzed / timed out → reveal and take control back ─────────
create or replace function buzzer_pass(
  p_game text, p_key text
) returns void language plpgsql security definer as $$
declare st buzzer_state; clue jsonb; k text;
begin
  if not _buzzer_is_host(p_game, p_key) then raise exception 'host only'; end if;
  select * into st from buzzer_state where game_id = p_game for update;
  if st.phase <> 'reading' then return; end if;
  select data->'board'->'categories'->st.cur_cat->'clues'->st.cur_idx
    into clue from games where game_id = p_game;
  k := st.cur_cat || '-' || st.cur_idx;
  update buzzer_state set
    control = 'host', winner = null,
    reveal = json_build_object('answer', clue->>'answer', 'who', null, 'delta', 0),
    phase = 'reveal', done = done || to_jsonb(k), updated_at = now()
  where game_id = p_game;
end $$;

-- ── Host: dismiss the reveal and go back to the board ──────────────────────
create or replace function buzzer_next(
  p_game text, p_key text
) returns void language plpgsql security definer as $$
declare st buzzer_state; total int;
begin
  if not _buzzer_is_host(p_game, p_key) then raise exception 'host only'; end if;
  select * into st from buzzer_state where game_id = p_game for update;
  select coalesce(sum(jsonb_array_length(c->'clues')), 0) into total
    from games g, lateral jsonb_array_elements(g.data->'board'->'categories') c
    where g.game_id = p_game;
  update buzzer_state set
    cur_cat = null, cur_idx = null, winner = null, missed = '[]'::jsonb,
    dd_player = null, dd_wager = null, reveal = null,
    phase = case when jsonb_array_length(done) >= total then 'over' else 'select' end,
    updated_at = now()
  where game_id = p_game;
end $$;

-- ── Host: reset the whole game (scores + board) for a replay ───────────────
create or replace function buzzer_reset(
  p_game text, p_key text
) returns void language plpgsql security definer as $$
begin
  if not _buzzer_is_host(p_game, p_key) then raise exception 'host only'; end if;
  update buzzer_players set score = 0, final_wager = null, final_answer = null
    where game_id = p_game;
  update buzzer_state set
    phase = 'select', control = coalesce(
      (select player_id from buzzer_players where game_id = p_game order by joined_at limit 1), 'host'),
    cur_cat = null, cur_idx = null, seq = 0, winner = null,
    missed = '[]'::jsonb, done = '[]'::jsonb, open_at = null,
    dd_player = null, dd_wager = null, reveal = null, updated_at = now()
  where game_id = p_game;
end $$;

-- ── Ensure a state row exists when the host creates a buzzer game (so the TV
-- and host controller work before any player has joined). Harmless if it runs
-- twice; exposes no secrets.
create or replace function buzzer_init(p_game text)
returns void language sql security definer as $$
  insert into buzzer_state (game_id) values (p_game) on conflict (game_id) do nothing;
$$;
grant execute on function buzzer_init(text) to anon, authenticated;
