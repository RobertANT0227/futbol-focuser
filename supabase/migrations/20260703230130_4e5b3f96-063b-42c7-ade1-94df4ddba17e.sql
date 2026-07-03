
-- bankroll_bets
CREATE TABLE public.bankroll_bets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  match TEXT NOT NULL,
  sport TEXT NOT NULL DEFAULT 'Fotbal',
  odds NUMERIC NOT NULL,
  stake NUMERIC NOT NULL DEFAULT 0,
  profit NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','WON','LOST','VOID')),
  confidence TEXT,
  risk TEXT,
  win_rate NUMERIC,
  bankroll_after NUMERIC,
  placed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bankroll_bets TO authenticated;
GRANT ALL ON public.bankroll_bets TO service_role;

ALTER TABLE public.bankroll_bets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own bets"
  ON public.bankroll_bets FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owner reads all bets"
  ON public.bankroll_bets FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'owner'));

CREATE INDEX bankroll_bets_user_idx ON public.bankroll_bets(user_id, placed_at DESC);

CREATE TRIGGER trg_bankroll_bets_updated
  BEFORE UPDATE ON public.bankroll_bets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.bankroll_bets;
ALTER TABLE public.bankroll_bets REPLICA IDENTITY FULL;

-- Allow owner to read all profiles (needed for Owner Dashboard)
CREATE POLICY "Owner reads all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'owner'));
