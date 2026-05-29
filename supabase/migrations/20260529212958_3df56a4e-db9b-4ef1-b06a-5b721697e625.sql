CREATE TABLE IF NOT EXISTS public.size_distribution_curves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NULL,
  name text NOT NULL DEFAULT 'default',
  curve jsonb NOT NULL,
  is_default boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS size_distribution_curves_org_default_uniq
  ON public.size_distribution_curves (COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE is_default = true;

GRANT SELECT ON public.size_distribution_curves TO authenticated;
GRANT ALL ON public.size_distribution_curves TO service_role;

ALTER TABLE public.size_distribution_curves ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read global or org curves"
  ON public.size_distribution_curves
  FOR SELECT
  TO authenticated
  USING (organization_id IS NULL OR organization_id = current_user_org_id());

CREATE POLICY "admin write own org curves"
  ON public.size_distribution_curves
  FOR ALL
  TO authenticated
  USING (organization_id = current_user_org_id() AND current_user_is_admin())
  WITH CHECK (organization_id = current_user_org_id() AND current_user_is_admin());

INSERT INTO public.size_distribution_curves (organization_id, name, curve, is_default)
SELECT NULL, 'global-default',
  '{"S": 0.10, "M": 0.20, "L": 0.30, "XL": 0.25, "2XL": 0.10, "3XL": 0.05}'::jsonb,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.size_distribution_curves WHERE organization_id IS NULL AND is_default = true
);