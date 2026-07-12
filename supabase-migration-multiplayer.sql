-- MULTIPLAYER FIX MIGRATION
-- Run this in your Supabase project: SQL Editor → New Query → paste → Run
-- (Safe to run more than once.)
--
-- Why: player joins and answers used to be saved by rewriting the game's
-- entire JSON blob (3+ MB with images). Two players writing at once wiped
-- out each other's answers and could even undo the host advancing to the
-- next question. These small tables give every join and every answer its
-- own row, so nothing can clobber anything else — and gameplay traffic
-- drops from megabytes to bytes.

-- One row per player who joined a game
create table if not exists game_players (
  game_id text not null,
  player_name text not null,
  joined_at timestamptz default now(),
  primary key (game_id, player_name)
);

-- One row per answer a player submits
create table if not exists answers (
  game_id text not null,
  player_name text not null,
  question_idx integer not null,
  answer text not null,
  created_at timestamptz default now(),
  primary key (game_id, player_name, question_idx)
);

alter table game_players enable row level security;
alter table answers enable row level security;

drop policy if exists "Public read game_players" on game_players;
drop policy if exists "Public insert game_players" on game_players;
drop policy if exists "Public delete game_players" on game_players;
create policy "Public read game_players" on game_players for select using (true);
create policy "Public insert game_players" on game_players for insert with check (true);
create policy "Public delete game_players" on game_players for delete using (true);

drop policy if exists "Public read answers" on answers;
drop policy if exists "Public insert answers" on answers;
drop policy if exists "Public update answers" on answers;
drop policy if exists "Public delete answers" on answers;
create policy "Public read answers" on answers for select using (true);
create policy "Public insert answers" on answers for insert with check (true);
create policy "Public update answers" on answers for update using (true);
create policy "Public delete answers" on answers for delete using (true);

-- Atomic one-line game-state change, so "Next Question" no longer uploads
-- the whole multi-megabyte game blob (and can't be clobbered mid-flight).
create or replace function advance_game(gid text, new_status text, new_q integer)
returns void
language sql
as $$
  update games
  set data = jsonb_set(jsonb_set(data, '{status}', to_jsonb(new_status)), '{currentQuestion}', to_jsonb(new_q))
  where game_id = gid;
$$;

-- Lightweight game list for the admin home screen (titles and counts only,
-- instead of downloading every game's full blob with all its images).
create or replace function list_games()
returns table (game_id text, title text, status text, question_count integer, player_count integer, created_at timestamptz)
language sql
stable
as $$
  select g.game_id,
         g.data->>'title',
         g.data->>'status',
         jsonb_array_length(coalesce(g.data->'questions', '[]'::jsonb)),
         (select count(*)::integer from game_players p where p.game_id = g.game_id),
         g.created_at
  from games g
  order by g.created_at desc;
$$;
