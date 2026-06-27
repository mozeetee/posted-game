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
