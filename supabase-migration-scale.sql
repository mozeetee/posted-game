-- SCALE MIGRATION (20+ players)
-- Run in Supabase SQL Editor. Safe to run more than once.
--
-- Why: with many players, every phone re-downloading the full answers list
-- every 2.5s adds up to gigabytes per game night. Storing correctness at
-- answer time and computing the scoreboard server-side shrinks each poll
-- from ~22KB to ~1KB at 20 players.

-- Whether the answer matched the correct author, recorded at submit time
alter table answers add column if not exists correct boolean;

-- One tiny call returning everything a client needs each poll:
-- every joined player, their running total, and their answer for one round.
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
