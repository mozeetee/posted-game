-- Player avatars ("pick your character")
-- Run this in your Supabase project: SQL Editor → New Query → paste → Run.
-- Safe to run once and safe to re-run. Additive only — existing games are
-- unaffected (players with no avatar just show a lettered chip).
--
-- Each player picks a little field-creature when they join; we store its id
-- (e.g. 'fox', 'owl') on their game_players row so it can show on the lobby,
-- the scoreboards, the results screen, the host's live view, and the big screen.

alter table game_players add column if not exists avatar text;
