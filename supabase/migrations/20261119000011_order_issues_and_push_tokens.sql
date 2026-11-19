-- Migration: 20261119000011_order_issues_and_push_tokens.sql
-- Adds buyer return/problem reporting (`order_issues`) and Expo push token registration
-- (`order_push_tokens`) for shipment notifications on guest checkout orders.

CREATE TABLE IF NOT EXISTS public.order_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  suborder_id UUID REFERENCES public.order_suborders(id) ON DELETE SET NULL,
  issue_type TEXT NOT NULL CHECK (
    issue_type IN (
      'DEFECTIVE_PART',
      'WRONG_OR_INCOMPATIBLE',
      'SHIPPING_DAMAGE',
      'WITHDRAWAL_14D',
      'NOT_RECEIVED',
      'OTHER'
    )
  ),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 10 AND 2000),
  contact_phone TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_REVIEW', 'RESOLVED', 'CLOSED')),
  ops_notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_issues_order_id ON public.order_issues(order_id);
CREATE INDEX IF NOT EXISTS idx_order_issues_status ON public.order_issues(status);

ALTER TABLE public.order_issues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_issues_service_role_all" ON public.order_issues;
CREATE POLICY "order_issues_service_role_all"
  ON public.order_issues
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE public.order_issues FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- Push notification tokens bound to guest orders (verified via access_token)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.order_push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  expo_push_token TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'ios' CHECK (platform IN ('ios', 'android', 'web')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (order_id, expo_push_token)
);

CREATE INDEX IF NOT EXISTS idx_order_push_tokens_order_id ON public.order_push_tokens(order_id);

ALTER TABLE public.order_push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_push_tokens_service_role_all" ON public.order_push_tokens;
CREATE POLICY "order_push_tokens_service_role_all"
  ON public.order_push_tokens
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE public.order_push_tokens FROM anon, authenticated;

-- Guest buyer registers their Expo Push Token for an order using the order's access_token.
CREATE OR REPLACE FUNCTION public.register_order_push_token(
  p_access_token TEXT,
  p_expo_push_token TEXT,
  p_platform TEXT DEFAULT 'ios'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id UUID;
  v_platform TEXT;
BEGIN
  IF p_access_token IS NULL OR char_length(trim(p_access_token)) < 16 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_TOKEN');
  END IF;

  IF p_expo_push_token IS NULL OR p_expo_push_token !~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,128}\]$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_PUSH_TOKEN');
  END IF;

  v_platform := CASE
    WHEN lower(coalesce(p_platform, 'ios')) IN ('ios', 'android', 'web') THEN lower(p_platform)
    ELSE 'ios'
  END;

  SELECT id INTO v_order_id
  FROM public.orders
  WHERE access_token = trim(p_access_token)
  LIMIT 1;

  IF v_order_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ORDER_NOT_FOUND');
  END IF;

  INSERT INTO public.order_push_tokens (order_id, expo_push_token, platform, updated_at)
  VALUES (v_order_id, trim(p_expo_push_token), v_platform, now())
  ON CONFLICT (order_id, expo_push_token)
  DO UPDATE SET platform = EXCLUDED.platform, updated_at = now();

  RETURN jsonb_build_object('ok', true, 'orderId', v_order_id);
END;
$$;

REVOKE ALL ON FUNCTION public.register_order_push_token(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_order_push_token(TEXT, TEXT, TEXT) TO anon, authenticated, service_role;
