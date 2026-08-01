-- Bride Edition survey tables
-- Run this in your Supabase project: SQL Editor → New Query → paste → Run
-- (Safe to run once. Only needed for "Bride Edition" games — the survey flow
--  where the bride fills in her real answers before the host builds the trivia.)

-- One row per survey question the bride answers. She autosaves as she types;
-- she only ever writes here, never the big game blob, and never sees the decoys.
create table if not exists survey_responses (
  game_id text not null,
  question_id text not null,
  answer text,
  updated_at timestamptz default now(),
  primary key (game_id, question_id)
);

-- One row per game: flipped to submitted = true when the bride taps Submit.
-- The host dashboard polls this (plus a response count) to show live status.
create table if not exists survey_meta (
  game_id text primary key,
  submitted boolean default false,
  updated_at timestamptz default now()
);

-- Public read/write (no auth — same model as the rest of the app: anyone with
-- the private survey link can fill it in).
alter table survey_responses enable row level security;
alter table survey_meta enable row level security;

create policy "Public read survey_responses" on survey_responses for select using (true);
create policy "Public insert survey_responses" on survey_responses for insert with check (true);
create policy "Public update survey_responses" on survey_responses for update using (true);
create policy "Public delete survey_responses" on survey_responses for delete using (true);

create policy "Public read survey_meta" on survey_meta for select using (true);
create policy "Public insert survey_meta" on survey_meta for insert with check (true);
create policy "Public update survey_meta" on survey_meta for update using (true);
create policy "Public delete survey_meta" on survey_meta for delete using (true);
