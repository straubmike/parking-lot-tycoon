-- Parking Lot Tycoon leaderboard schema.
--
-- Run this once against a fresh Supabase project (SQL Editor ->
-- "New query" -> paste + Run). Re-running is safe: statements are
-- idempotent where possible.
--
-- The browser client uses the project's anon key. Row Level Security is
-- enabled so the anon role can only insert rows that satisfy the bounds
-- below and select rows for reading. No other mutations are allowed.

-- =====================================================================
-- Table
-- =====================================================================

create table if not exists public.scores (
  id bigserial primary key,
  challenge_id text not null,
  player_name text not null,
  profit integer not null,
  rating integer not null,
  completion_day integer not null,
  created_at timestamptz not null default now(),
  -- Plausibility checks. Tune these if balance changes make them tight.
  constraint scores_player_name_length check (char_length(player_name) between 1 and 24),
  constraint scores_challenge_id_allowed check (
    challenge_id in (
      'learning-lot',
      'pizza-parking-problem',
      'rush-hour-roundabout',
      'drive-in-disaster',
      'airport-arrivals'
    )
  ),
  constraint scores_profit_range check (profit between -1000000 and 10000000),
  constraint scores_rating_range check (rating between 0 and 1000),
  constraint scores_completion_day_range check (completion_day between 1 and 365)
);

-- Fast filtered/sorted reads per challenge.
create index if not exists scores_by_challenge_leaderboard
  on public.scores (challenge_id, profit desc, rating desc, completion_day asc);

-- =====================================================================
-- Row Level Security
-- =====================================================================

alter table public.scores enable row level security;

-- Anyone can read the leaderboard.
drop policy if exists "scores read" on public.scores;
create policy "scores read"
  on public.scores
  for select
  to anon, authenticated
  using (true);

-- Anyone can submit a score. The CHECK constraints above keep the shape
-- plausible; add an Edge Function or rate limiting later if spam becomes a
-- problem.
drop policy if exists "scores insert" on public.scores;
create policy "scores insert"
  on public.scores
  for insert
  to anon, authenticated
  with check (true);

-- No update or delete policies are granted, so PostgREST will reject both
-- from the anon/authenticated roles by default.
