
DELETE FROM product_attribution_rules
WHERE organization_id = '11111111-1111-4111-8111-000000000001';

INSERT INTO product_attribution_rules (organization_id, match_type, match_pattern, priority, is_active)
VALUES
  ('11111111-1111-4111-8111-000000000001', 'contains', 'Mooney World',    100, true),
  ('11111111-1111-4111-8111-000000000001', 'contains', 'MooneyWorld',     100, true),
  ('11111111-1111-4111-8111-000000000001', 'contains', 'Mooney WRLD',     100, true),
  ('11111111-1111-4111-8111-000000000001', 'contains', 'MWRLD',           100, true),
  ('11111111-1111-4111-8111-000000000001', 'contains', 'ATL Arrival',      90, true),
  ('11111111-1111-4111-8111-000000000001', 'contains', 'Rise Up',          90, true),
  ('11111111-1111-4111-8111-000000000001', 'contains', 'WR 11',            90, true),
  ('11111111-1111-4111-8111-000000000001', 'contains', 'Darnell Mooney',   95, true);
