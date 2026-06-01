
-- Part 1: Delete Tua org + rules. Null out any line items attributed to Tua.
UPDATE order_line_items SET attributed_org_id = NULL, attribution_rule_id = NULL, attribution_confidence = 'unattributed'
  WHERE attributed_org_id = '74d3af94-c5a0-4a12-b0c4-2ead9f0e19f5';
UPDATE orders SET attributed_org_id = NULL WHERE attributed_org_id = '74d3af94-c5a0-4a12-b0c4-2ead9f0e19f5';
DELETE FROM product_attribution_rules WHERE organization_id = '74d3af94-c5a0-4a12-b0c4-2ead9f0e19f5';
DELETE FROM organizations WHERE id = '74d3af94-c5a0-4a12-b0c4-2ead9f0e19f5';

-- Part 2: Athlete Xclusive store-brand rules
INSERT INTO product_attribution_rules (organization_id, match_type, match_pattern, priority, is_active) VALUES
  ('2d6f377e-4fe8-448b-84b3-42aed237f3da', 'contains', 'Fin City', 80, true),
  ('2d6f377e-4fe8-448b-84b3-42aed237f3da', 'contains', 'Miami Strength Club', 80, true),
  ('2d6f377e-4fe8-448b-84b3-42aed237f3da', 'contains', 'ND Irish', 80, true),
  ('2d6f377e-4fe8-448b-84b3-42aed237f3da', 'contains', 'O World Tour', 80, true),
  ('2d6f377e-4fe8-448b-84b3-42aed237f3da', 'contains', 'Ohio State', 80, true);

-- Part 3: Extend Mooney, Sin City Raiders, Ramily
INSERT INTO product_attribution_rules (organization_id, match_type, match_pattern, priority, is_active) VALUES
  ('11111111-1111-4111-8111-000000000001', 'contains', 'Chicago World Tour', 95, true),
  ('11111111-1111-4111-8111-000000000001', 'contains', 'Atlanta World Tour', 95, true),
  ('11111111-1111-4111-8111-000000000001', 'contains', 'Atlanta Strength Club', 95, true),
  ('9df9bf42-2775-4477-a9c7-1c61084b7ff1', 'contains', 'Oakland Raiders', 90, true),
  ('02cc7e77-d3d9-4414-a071-ef43ae1595f0', 'contains', 'LA Rams', 90, true);
