-- Social Media Edition ("Who Posted This?") — guest survey add-on
-- Run this in your Supabase project: SQL Editor → New Query → paste → Run
-- (Safe to run once, and safe to re-run. Only needed if you want to let guests
--  submit their OWN posts via a survey link instead of the host digging up
--  every post themselves.)
--
-- This reuses the SAME `survey_responses` table the Bride Edition already uses
-- (created by supabase-migration-bride.sql). For a guest submission:
--   answer  = the guest's name (the correct "who posted this")
--   prompt  = the post text / caption / hot take
--   image   = an optional screenshot of the post (base64 data URL)  ← new column
--   passed  = unused (false)
-- Each guest's rows are keyed by a per-guest id so re-opening the link lets
-- them edit their own submissions without touching anyone else's.

-- Make sure the base survey table exists (no-op if the bride migration ran).
create table if not exists survey_responses (
  game_id text not null,
  question_id text not null,
  answer text,
  updated_at timestamptz default now(),
  primary key (game_id, question_id)
);
alter table survey_responses add column if not exists prompt text;
alter table survey_responses add column if not exists passed boolean default false;

-- The one new thing this add-on needs: an optional screenshot per submission.
alter table survey_responses add column if not exists image text;

-- Public read/write (no auth — same model as the rest of the app: anyone with
-- the private survey link can fill it in). These are idempotent guards in case
-- the bride migration hasn't run in this project yet.
alter table survey_responses enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'survey_responses' and policyname = 'Public read survey_responses') then
    create policy "Public read survey_responses" on survey_responses for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'survey_responses' and policyname = 'Public insert survey_responses') then
    create policy "Public insert survey_responses" on survey_responses for insert with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'survey_responses' and policyname = 'Public update survey_responses') then
    create policy "Public update survey_responses" on survey_responses for update using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'survey_responses' and policyname = 'Public delete survey_responses') then
    create policy "Public delete survey_responses" on survey_responses for delete using (true);
  end if;
end $$;
