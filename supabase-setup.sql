-- Run this in your Supabase project: SQL Editor → New Query → paste → Run

-- Games table: stores all game state as a JSON blob
create table if not exists games (
  game_id text primary key,
  data jsonb not null,
  created_at timestamptz default now()
);

-- Reveals table: tracks which questions have had their reveal image shown
create table if not exists reveals (
  game_id text not null,
  question_idx integer not null,
  created_at timestamptz default now(),
  primary key (game_id, question_idx)
);

-- Enable real-time for both tables
-- (Do this in Supabase Dashboard: Database → Replication → enable for games + reveals)

-- Allow public read/write access (no auth needed — anyone with your link can play)
alter table games enable row level security;
alter table reveals enable row level security;

create policy "Public read games" on games for select using (true);
create policy "Public insert games" on games for insert with check (true);
create policy "Public update games" on games for update using (true);
create policy "Public delete games" on games for delete using (true);

create policy "Public read reveals" on reveals for select using (true);
create policy "Public insert reveals" on reveals for insert with check (true);
create policy "Public delete reveals" on reveals for delete using (true);

-- ── Multiplayer tables (one row per join / per answer — see supabase-migration-multiplayer.sql) ──

create table if not exists game_players (
  game_id text not null,
  player_name text not null,
  joined_at timestamptz default now(),
  primary key (game_id, player_name)
);

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

create policy "Public read game_players" on game_players for select using (true);
create policy "Public insert game_players" on game_players for insert with check (true);
create policy "Public delete game_players" on game_players for delete using (true);

create policy "Public read answers" on answers for select using (true);
create policy "Public insert answers" on answers for insert with check (true);
create policy "Public update answers" on answers for update using (true);
create policy "Public delete answers" on answers for delete using (true);

create or replace function advance_game(gid text, new_status text, new_q integer)
returns void
language sql
as $$
  update games
  set data = jsonb_set(jsonb_set(data, '{status}', to_jsonb(new_status)), '{currentQuestion}', to_jsonb(new_q))
  where game_id = gid;
$$;

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

-- ── Scale support (see supabase-migration-scale.sql) ──

alter table answers add column if not exists correct boolean;

create or replace function round_state(gid text, qidx integer)
returns table (player_name text, total integer, round_answer text)
language sql
stable
as $$
  select p.player_name,
         coalesce((select count(*)::integer from answers a
                   where a.game_id = gid and a.player_name = p.player_name and a.correct), 0),
         (select a2.answer from answers a2
          where a2.game_id = gid and a2.player_name = p.player_name and a2.question_idx = qidx)
  from game_players p
  where p.game_id = gid
  order by 2 desc, 1 asc;
$$;
