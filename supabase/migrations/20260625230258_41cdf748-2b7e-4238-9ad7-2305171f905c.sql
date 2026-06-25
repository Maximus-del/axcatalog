
CREATE TABLE public.print_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  garment_category text NOT NULL CHECK (garment_category IN ('apparel','cap')),
  surface text NOT NULL CHECK (surface IN ('front','back')),
  zone_id text NOT NULL,
  label text NOT NULL,
  x numeric NOT NULL,
  y numeric NOT NULL,
  w numeric NOT NULL,
  h numeric NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (garment_category, surface, zone_id)
);

GRANT SELECT ON public.print_zones TO anon, authenticated;
GRANT ALL ON public.print_zones TO service_role;

ALTER TABLE public.print_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Print zones are publicly readable"
  ON public.print_zones FOR SELECT
  USING (true);

CREATE POLICY "Admins manage print zones"
  ON public.print_zones FOR ALL
  USING (public.current_user_is_admin())
  WITH CHECK (public.current_user_is_admin());

CREATE TRIGGER print_zones_set_updated_at
  BEFORE UPDATE ON public.print_zones
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.print_zones (garment_category, surface, zone_id, label, x, y, w, h, sort_order) VALUES
  ('apparel','front','left_chest','Left chest',0.4,0.3,0.16,0.12,10),
  ('apparel','front','center_chest','Center chest',0.34,0.3,0.32,0.22,20),
  ('apparel','back','high_back','High back',0.32,0.22,0.36,0.1,10),
  ('apparel','back','center_back','Center back',0.3,0.3,0.4,0.3,20),
  ('apparel','back','low_back','Low back',0.32,0.55,0.36,0.18,30),
  ('apparel','back','full_16x20','16×20 back',0.28,0.26,0.44,0.55,40),
  ('cap','front','cap_front','Front panel',0.34,0.4,0.32,0.16,10);
