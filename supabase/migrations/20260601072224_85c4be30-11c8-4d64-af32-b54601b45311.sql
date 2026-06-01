DO $$
DECLARE
  v_athlete_tier uuid := '9dce7a20-3446-4084-bb19-155c09ccc359';
  v_proactive uuid := '11111111-1111-4111-8111-000000000003';
  v_tua uuid; v_bsc uuid; v_skc uuid; v_rfg uuid; v_scr uuid; v_bay uuid; v_ram uuid;
BEGIN
  INSERT INTO organizations (name, slug, pricing_tier_id) VALUES ('Tua Tagovailoa','tua-tagovailoa',v_athlete_tier) RETURNING id INTO v_tua;
  INSERT INTO organizations (name, slug, pricing_tier_id) VALUES ('Buffalo Strength Club','buffalo-strength-club',v_athlete_tier) RETURNING id INTO v_bsc;
  INSERT INTO organizations (name, slug, pricing_tier_id) VALUES ('Seattle/KC World Tour','seattle-kc-world-tour',v_athlete_tier) RETURNING id INTO v_skc;
  INSERT INTO organizations (name, slug, pricing_tier_id) VALUES ('Ravens Flock Gang','ravens-flock-gang',v_athlete_tier) RETURNING id INTO v_rfg;
  INSERT INTO organizations (name, slug, pricing_tier_id) VALUES ('Sin City Raiders','sin-city-raiders',v_athlete_tier) RETURNING id INTO v_scr;
  INSERT INTO organizations (name, slug, pricing_tier_id) VALUES ('Bay Baller','bay-baller',v_athlete_tier) RETURNING id INTO v_bay;
  INSERT INTO organizations (name, slug, pricing_tier_id) VALUES ('Ramily World Tour','ramily-world-tour',v_athlete_tier) RETURNING id INTO v_ram;

  INSERT INTO product_attribution_rules (organization_id, match_type, match_pattern, priority, is_active) VALUES
    (v_tua,'contains','Fin City',100,true),
    (v_tua,'contains','Tua',100,true),
    (v_bsc,'contains','Buffalo Strength Club',100,true),
    (v_bsc,'contains','Buffalo Strength',90,true),
    (v_skc,'contains','Seattle',90,true),
    (v_skc,'contains','KC World Tour',100,true),
    (v_skc,'contains','Seattle World Tour',100,true),
    (v_rfg,'contains','Flock Gang',100,true),
    (v_rfg,'contains','Ravens Flock',100,true),
    (v_scr,'contains','Sin City Raiders',100,true),
    (v_scr,'contains','Sin City',90,true),
    (v_bay,'contains','Bay Baller',100,true),
    (v_ram,'contains','Ramily',100,true),
    (v_ram,'contains','Ramily World Tour',100,true),
    (v_proactive,'contains','Proactive Performance',100,true),
    (v_proactive,'contains','Test Order Proactive',100,true),
    (v_proactive,'contains','Proactive',80,true);
END $$;