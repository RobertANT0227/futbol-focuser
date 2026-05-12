ALTER TABLE public.cp_leagues
  ADD COLUMN IF NOT EXISTS normalized_name text,
  ADD COLUMN IF NOT EXISTS has_league_stats boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_matches boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_teams boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS league_stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS matches_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS teams_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coverage jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.cp_leagues
SET normalized_name = lower(trim(regexp_replace(regexp_replace(regexp_replace(coalesce(name, ''), '\\s*\\([0-9]+\\)\\s*', ' ', 'g'), '[^[:alnum:]]+', ' ', 'g'), '\\s+', ' ', 'g')))
WHERE normalized_name IS NULL OR normalized_name = '';

ALTER TABLE public.cp_leagues
  ALTER COLUMN normalized_name SET NOT NULL;

ALTER TABLE public.cp_leagues
  DROP CONSTRAINT IF EXISTS cp_leagues_owner_id_name_season_key;

ALTER TABLE public.cp_leagues
  ADD CONSTRAINT cp_leagues_owner_normalized_season_key UNIQUE (owner_id, normalized_name, season);

CREATE INDEX IF NOT EXISTS cp_leagues_owner_normalized_idx
  ON public.cp_leagues(owner_id, normalized_name, season);

CREATE OR REPLACE FUNCTION public.refresh_cp_league_rollup(_league_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _matches_count integer;
  _teams_count integer;
BEGIN
  SELECT count(*) INTO _matches_count FROM public.cp_matches WHERE league_id = _league_id;
  SELECT count(*) INTO _teams_count FROM public.cp_teams WHERE league_id = _league_id;

  UPDATE public.cp_leagues
  SET matches_count = coalesce(_matches_count, 0),
      teams_count = coalesce(_teams_count, 0),
      has_matches = coalesce(_matches_count, 0) > 0,
      has_teams = coalesce(_teams_count, 0) > 0,
      updated_at = now()
  WHERE id = _league_id;
END;
$$;