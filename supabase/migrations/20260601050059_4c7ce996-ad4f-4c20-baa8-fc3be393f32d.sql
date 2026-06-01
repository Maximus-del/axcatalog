
-- =========================================================
-- Migration A: Platform admin role (prerequisite for org split)
-- =========================================================

-- 1. Column
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS is_platform_admin boolean NOT NULL DEFAULT false;

-- 2. Seed the two existing admins
UPDATE public.user_profiles
   SET is_platform_admin = true
 WHERE id IN (
   '8a24e334-63fb-4ba6-b62c-5e4d218fa282',
   'c034a771-0bdf-432d-9778-6015e460f08d'
 );

-- 3. Helper functions
CREATE OR REPLACE FUNCTION public.current_user_is_platform_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce((SELECT is_platform_admin FROM user_profiles WHERE id = auth.uid()), false)
$$;

CREATE OR REPLACE FUNCTION public.is_org_accessible(_org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _org_id = public.current_user_org_id()
      OR public.current_user_is_platform_admin()
$$;

-- =========================================================
-- 4. Rewrite policies
-- Pattern:
--   org-scoped reads/writes that were
--     (organization_id = current_user_org_id())
--   become
--     (is_org_accessible(organization_id))
--
--   admin-gated rows like
--     (organization_id = current_user_org_id()) AND current_user_is_admin()
--   become
--     ((organization_id = current_user_org_id()) AND current_user_is_admin())
--     OR current_user_is_platform_admin()
-- =========================================================

-- ATHLETES
DROP POLICY IF EXISTS "org read athletes" ON public.athletes;
DROP POLICY IF EXISTS "org write athletes" ON public.athletes;
CREATE POLICY "org read athletes" ON public.athletes
  FOR SELECT USING (public.is_org_accessible(organization_id));
CREATE POLICY "org write athletes" ON public.athletes
  FOR ALL USING (public.is_org_accessible(organization_id))
         WITH CHECK (public.is_org_accessible(organization_id));

-- BLANKS
DROP POLICY IF EXISTS "org read blanks" ON public.blanks;
DROP POLICY IF EXISTS "org write blanks" ON public.blanks;
CREATE POLICY "org read blanks" ON public.blanks
  FOR SELECT USING (public.is_org_accessible(organization_id));
CREATE POLICY "org write blanks" ON public.blanks
  FOR ALL USING (public.is_org_accessible(organization_id))
         WITH CHECK (public.is_org_accessible(organization_id));

-- BLANK_COLORS (parent blanks)
DROP POLICY IF EXISTS "org read blank colors" ON public.blank_colors;
DROP POLICY IF EXISTS "org write blank colors" ON public.blank_colors;
CREATE POLICY "org read blank colors" ON public.blank_colors
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.blanks b
                              WHERE b.id = blank_colors.blank_id
                                AND public.is_org_accessible(b.organization_id)));
CREATE POLICY "org write blank colors" ON public.blank_colors
  FOR ALL USING (EXISTS (SELECT 1 FROM public.blanks b
                           WHERE b.id = blank_colors.blank_id
                             AND public.is_org_accessible(b.organization_id)));

-- BLANK_SIZES
DROP POLICY IF EXISTS "org read blank sizes" ON public.blank_sizes;
DROP POLICY IF EXISTS "org write blank sizes" ON public.blank_sizes;
CREATE POLICY "org read blank sizes" ON public.blank_sizes
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.blanks b
                              WHERE b.id = blank_sizes.blank_id
                                AND public.is_org_accessible(b.organization_id)));
CREATE POLICY "org write blank sizes" ON public.blank_sizes
  FOR ALL USING (EXISTS (SELECT 1 FROM public.blanks b
                           WHERE b.id = blank_sizes.blank_id
                             AND public.is_org_accessible(b.organization_id)));

-- BULK_ORDER_REQUESTS
DROP POLICY IF EXISTS "admin read bulk orders" ON public.bulk_order_requests;
DROP POLICY IF EXISTS "admin write bulk orders" ON public.bulk_order_requests;
DROP POLICY IF EXISTS "client create own bulk orders" ON public.bulk_order_requests;
DROP POLICY IF EXISTS "client read own bulk orders" ON public.bulk_order_requests;
CREATE POLICY "admin read bulk orders" ON public.bulk_order_requests
  FOR SELECT USING (
    ((organization_id = current_user_org_id()) AND current_user_is_admin())
    OR current_user_is_platform_admin()
  );
CREATE POLICY "admin write bulk orders" ON public.bulk_order_requests
  FOR ALL USING (
    ((organization_id = current_user_org_id()) AND current_user_is_admin())
    OR current_user_is_platform_admin()
  ) WITH CHECK (
    ((organization_id = current_user_org_id()) AND current_user_is_admin())
    OR current_user_is_platform_admin()
  );
CREATE POLICY "client create own bulk orders" ON public.bulk_order_requests
  FOR INSERT WITH CHECK (
    (organization_id = current_user_org_id())
    AND (requested_by = auth.uid())
    AND (current_user_is_admin() OR (EXISTS (
      SELECT 1 FROM user_athlete_links ual
       WHERE ual.user_id = auth.uid()
         AND ual.athlete_id = bulk_order_requests.athlete_id
    )))
  );
CREATE POLICY "client read own bulk orders" ON public.bulk_order_requests
  FOR SELECT USING (
    (organization_id = current_user_org_id())
    AND (NOT current_user_is_admin())
    AND (EXISTS (
      SELECT 1 FROM user_athlete_links ual
       WHERE ual.user_id = auth.uid()
         AND ual.athlete_id = bulk_order_requests.athlete_id
    ))
  );

-- BULK_ORDER_ITEMS (parent bulk_order_requests)
DROP POLICY IF EXISTS "org read bulk order items" ON public.bulk_order_items;
DROP POLICY IF EXISTS "org write bulk order items" ON public.bulk_order_items;
CREATE POLICY "org read bulk order items" ON public.bulk_order_items
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM bulk_order_requests o
     WHERE o.id = bulk_order_items.order_request_id
       AND public.is_org_accessible(o.organization_id)
       AND (current_user_is_admin()
            OR current_user_is_platform_admin()
            OR EXISTS (SELECT 1 FROM user_athlete_links ual
                        WHERE ual.user_id = auth.uid()
                          AND ual.athlete_id = o.athlete_id))
  ));
CREATE POLICY "org write bulk order items" ON public.bulk_order_items
  FOR ALL USING (EXISTS (
    SELECT 1 FROM bulk_order_requests o
     WHERE o.id = bulk_order_items.order_request_id
       AND public.is_org_accessible(o.organization_id)
       AND (current_user_is_admin()
            OR current_user_is_platform_admin()
            OR (o.requested_by = auth.uid() AND o.status = 'submitted'::bulk_order_status))
  ));

-- COLLECTIONS
DROP POLICY IF EXISTS "org read collections" ON public.collections;
DROP POLICY IF EXISTS "org write collections" ON public.collections;
CREATE POLICY "org read collections" ON public.collections
  FOR SELECT USING (public.is_org_accessible(organization_id));
CREATE POLICY "org write collections" ON public.collections
  FOR ALL USING (public.is_org_accessible(organization_id))
         WITH CHECK (public.is_org_accessible(organization_id));

-- COLLECTION_PRODUCTS / COLLECTION_DESIGNS (parent collections)
DROP POLICY IF EXISTS "org read collection products" ON public.collection_products;
DROP POLICY IF EXISTS "org write collection products" ON public.collection_products;
CREATE POLICY "org read collection products" ON public.collection_products
  FOR SELECT USING (EXISTS (SELECT 1 FROM collections c
                              WHERE c.id = collection_products.collection_id
                                AND public.is_org_accessible(c.organization_id)));
CREATE POLICY "org write collection products" ON public.collection_products
  FOR ALL USING (EXISTS (SELECT 1 FROM collections c
                           WHERE c.id = collection_products.collection_id
                             AND public.is_org_accessible(c.organization_id)));

DROP POLICY IF EXISTS "org read collection designs" ON public.collection_designs;
DROP POLICY IF EXISTS "org write collection designs" ON public.collection_designs;
CREATE POLICY "org read collection designs" ON public.collection_designs
  FOR SELECT USING (EXISTS (SELECT 1 FROM collections c
                              WHERE c.id = collection_designs.collection_id
                                AND public.is_org_accessible(c.organization_id)));
CREATE POLICY "org write collection designs" ON public.collection_designs
  FOR ALL USING (EXISTS (SELECT 1 FROM collections c
                           WHERE c.id = collection_designs.collection_id
                             AND public.is_org_accessible(c.organization_id)));

-- DESIGNS
DROP POLICY IF EXISTS "org read designs" ON public.designs;
DROP POLICY IF EXISTS "org write designs" ON public.designs;
CREATE POLICY "org read designs" ON public.designs
  FOR SELECT USING (public.is_org_accessible(organization_id));
CREATE POLICY "org write designs" ON public.designs
  FOR ALL USING (public.is_org_accessible(organization_id))
         WITH CHECK (public.is_org_accessible(organization_id));

-- DESIGN_COLLECTIONS
DROP POLICY IF EXISTS "org read design_collections" ON public.design_collections;
DROP POLICY IF EXISTS "org write design_collections" ON public.design_collections;
CREATE POLICY "org read design_collections" ON public.design_collections
  FOR SELECT USING (public.is_org_accessible(organization_id));
CREATE POLICY "org write design_collections" ON public.design_collections
  FOR ALL USING (public.is_org_accessible(organization_id))
         WITH CHECK (public.is_org_accessible(organization_id));

-- DESIGN child tables (parent designs)
DROP POLICY IF EXISTS "org read design athletes" ON public.design_athletes;
DROP POLICY IF EXISTS "org write design athletes" ON public.design_athletes;
CREATE POLICY "org read design athletes" ON public.design_athletes
  FOR SELECT USING (EXISTS (SELECT 1 FROM designs d
                              WHERE d.id = design_athletes.design_id
                                AND public.is_org_accessible(d.organization_id)));
CREATE POLICY "org write design athletes" ON public.design_athletes
  FOR ALL USING (EXISTS (SELECT 1 FROM designs d
                           WHERE d.id = design_athletes.design_id
                             AND public.is_org_accessible(d.organization_id)));

DROP POLICY IF EXISTS "org read design files" ON public.design_files;
DROP POLICY IF EXISTS "org write design files" ON public.design_files;
CREATE POLICY "org read design files" ON public.design_files
  FOR SELECT USING (EXISTS (SELECT 1 FROM designs d
                              WHERE d.id = design_files.design_id
                                AND public.is_org_accessible(d.organization_id)));
CREATE POLICY "org write design files" ON public.design_files
  FOR ALL USING (EXISTS (SELECT 1 FROM designs d
                           WHERE d.id = design_files.design_id
                             AND public.is_org_accessible(d.organization_id)));

DROP POLICY IF EXISTS "org read design tags" ON public.design_tags;
DROP POLICY IF EXISTS "org write design tags" ON public.design_tags;
CREATE POLICY "org read design tags" ON public.design_tags
  FOR SELECT USING (EXISTS (SELECT 1 FROM designs d
                              WHERE d.id = design_tags.design_id
                                AND public.is_org_accessible(d.organization_id)));
CREATE POLICY "org write design tags" ON public.design_tags
  FOR ALL USING (EXISTS (SELECT 1 FROM designs d
                           WHERE d.id = design_tags.design_id
                             AND public.is_org_accessible(d.organization_id)));

DROP POLICY IF EXISTS "org read design teams" ON public.design_teams;
DROP POLICY IF EXISTS "org write design teams" ON public.design_teams;
CREATE POLICY "org read design teams" ON public.design_teams
  FOR SELECT USING (EXISTS (SELECT 1 FROM designs d
                              WHERE d.id = design_teams.design_id
                                AND public.is_org_accessible(d.organization_id)));
CREATE POLICY "org write design teams" ON public.design_teams
  FOR ALL USING (EXISTS (SELECT 1 FROM designs d
                           WHERE d.id = design_teams.design_id
                             AND public.is_org_accessible(d.organization_id)));

-- IMPORT_BATCHES
DROP POLICY IF EXISTS "admin read import batches" ON public.import_batches;
DROP POLICY IF EXISTS "admin write import batches" ON public.import_batches;
CREATE POLICY "admin read import batches" ON public.import_batches
  FOR SELECT TO authenticated USING (
    ((organization_id = current_user_org_id()) AND current_user_is_admin())
    OR current_user_is_platform_admin()
  );
CREATE POLICY "admin write import batches" ON public.import_batches
  FOR ALL TO authenticated USING (
    ((organization_id = current_user_org_id()) AND current_user_is_admin())
    OR current_user_is_platform_admin()
  ) WITH CHECK (
    ((organization_id = current_user_org_id()) AND current_user_is_admin())
    OR current_user_is_platform_admin()
  );

-- INGESTION_JOBS
DROP POLICY IF EXISTS "org read ingestion" ON public.ingestion_jobs;
DROP POLICY IF EXISTS "org write ingestion" ON public.ingestion_jobs;
CREATE POLICY "org read ingestion" ON public.ingestion_jobs
  FOR SELECT USING (public.is_org_accessible(organization_id));
CREATE POLICY "org write ingestion" ON public.ingestion_jobs
  FOR ALL USING (public.is_org_accessible(organization_id))
         WITH CHECK (public.is_org_accessible(organization_id));

-- ORDERS
DROP POLICY IF EXISTS "admin read orders" ON public.orders;
DROP POLICY IF EXISTS "admin write orders" ON public.orders;
DROP POLICY IF EXISTS "athlete read parent orders" ON public.orders;
CREATE POLICY "admin read orders" ON public.orders
  FOR SELECT TO authenticated USING (
    ((organization_id = current_user_org_id()) AND current_user_is_admin())
    OR current_user_is_platform_admin()
  );
CREATE POLICY "admin write orders" ON public.orders
  FOR ALL TO authenticated USING (
    ((organization_id = current_user_org_id()) AND current_user_is_admin())
    OR current_user_is_platform_admin()
  ) WITH CHECK (
    ((organization_id = current_user_org_id()) AND current_user_is_admin())
    OR current_user_is_platform_admin()
  );
CREATE POLICY "athlete read parent orders" ON public.orders
  FOR SELECT TO authenticated USING (
    (organization_id = current_user_org_id())
    AND (NOT current_user_is_admin())
    AND EXISTS (
      SELECT 1
        FROM order_line_items oli
        JOIN product_athletes pa ON pa.product_id = oli.product_id
        JOIN user_athlete_links ual ON ual.athlete_id = pa.athlete_id
       WHERE oli.order_id = orders.id
         AND ual.user_id = auth.uid()
    )
  );

-- ORDER_LINE_ITEMS
DROP POLICY IF EXISTS "admin read order line items" ON public.order_line_items;
DROP POLICY IF EXISTS "admin write order line items" ON public.order_line_items;
DROP POLICY IF EXISTS "athlete read attributed line items" ON public.order_line_items;
CREATE POLICY "admin read order line items" ON public.order_line_items
  FOR SELECT TO authenticated USING (
    ((organization_id = current_user_org_id()) AND current_user_is_admin())
    OR current_user_is_platform_admin()
  );
CREATE POLICY "admin write order line items" ON public.order_line_items
  FOR ALL TO authenticated USING (
    ((organization_id = current_user_org_id()) AND current_user_is_admin())
    OR current_user_is_platform_admin()
  ) WITH CHECK (
    ((organization_id = current_user_org_id()) AND current_user_is_admin())
    OR current_user_is_platform_admin()
  );
CREATE POLICY "athlete read attributed line items" ON public.order_line_items
  FOR SELECT TO authenticated USING (
    (organization_id = current_user_org_id())
    AND (NOT current_user_is_admin())
    AND EXISTS (
      SELECT 1
        FROM product_athletes pa
        JOIN user_athlete_links ual ON ual.athlete_id = pa.athlete_id
       WHERE pa.product_id = order_line_items.product_id
         AND ual.user_id = auth.uid()
    )
  );

-- ORG_PRICING_CONFIG
DROP POLICY IF EXISTS "org read pricing config" ON public.org_pricing_config;
DROP POLICY IF EXISTS "admin write pricing config" ON public.org_pricing_config;
CREATE POLICY "org read pricing config" ON public.org_pricing_config
  FOR SELECT TO authenticated USING (public.is_org_accessible(organization_id));
CREATE POLICY "admin write pricing config" ON public.org_pricing_config
  FOR ALL TO authenticated USING (
    ((organization_id = current_user_org_id()) AND current_user_is_admin())
    OR current_user_is_platform_admin()
  ) WITH CHECK (
    ((organization_id = current_user_org_id()) AND current_user_is_admin())
    OR current_user_is_platform_admin()
  );

-- ORGANIZATIONS
DROP POLICY IF EXISTS "Admins see full own org" ON public.organizations;
DROP POLICY IF EXISTS "Admins update own org" ON public.organizations;
DROP POLICY IF EXISTS "Members see own org non-sensitive" ON public.organizations;
CREATE POLICY "Admins see full own org" ON public.organizations
  FOR SELECT USING (
    ((id = current_user_org_id()) AND current_user_is_admin())
    OR current_user_is_platform_admin()
  );
CREATE POLICY "Admins update own org" ON public.organizations
  FOR UPDATE USING (
    ((id = current_user_org_id()) AND current_user_is_admin())
    OR current_user_is_platform_admin()
  );
CREATE POLICY "Members see own org non-sensitive" ON public.organizations
  FOR SELECT USING (
    (id = current_user_org_id()) AND (NOT current_user_is_admin())
  );

-- PRODUCTS
DROP POLICY IF EXISTS "org read products" ON public.products;
DROP POLICY IF EXISTS "org write products" ON public.products;
CREATE POLICY "org read products" ON public.products
  FOR SELECT USING (public.is_org_accessible(organization_id));
CREATE POLICY "org write products" ON public.products
  FOR ALL USING (public.is_org_accessible(organization_id))
         WITH CHECK (public.is_org_accessible(organization_id));

-- PRODUCT child tables via products
DROP POLICY IF EXISTS "org read product athletes" ON public.product_athletes;
DROP POLICY IF EXISTS "org write product athletes" ON public.product_athletes;
CREATE POLICY "org read product athletes" ON public.product_athletes
  FOR SELECT USING (EXISTS (SELECT 1 FROM products p
                              WHERE p.id = product_athletes.product_id
                                AND public.is_org_accessible(p.organization_id)));
CREATE POLICY "org write product athletes" ON public.product_athletes
  FOR ALL USING (EXISTS (SELECT 1 FROM products p
                           WHERE p.id = product_athletes.product_id
                             AND public.is_org_accessible(p.organization_id)));

DROP POLICY IF EXISTS "org read product collections" ON public.product_collections;
DROP POLICY IF EXISTS "org write product collections" ON public.product_collections;
CREATE POLICY "org read product collections" ON public.product_collections
  FOR SELECT USING (EXISTS (SELECT 1 FROM products p
                              WHERE p.id = product_collections.product_id
                                AND public.is_org_accessible(p.organization_id)));
CREATE POLICY "org write product collections" ON public.product_collections
  FOR ALL USING (EXISTS (SELECT 1 FROM products p
                           WHERE p.id = product_collections.product_id
                             AND public.is_org_accessible(p.organization_id)))
         WITH CHECK (EXISTS (SELECT 1 FROM products p
                              WHERE p.id = product_collections.product_id
                                AND public.is_org_accessible(p.organization_id)));

DROP POLICY IF EXISTS "org read product designs" ON public.product_designs;
DROP POLICY IF EXISTS "org write product designs" ON public.product_designs;
CREATE POLICY "org read product designs" ON public.product_designs
  FOR SELECT USING (EXISTS (SELECT 1 FROM products p
                              WHERE p.id = product_designs.product_id
                                AND public.is_org_accessible(p.organization_id)));
CREATE POLICY "org write product designs" ON public.product_designs
  FOR ALL USING (EXISTS (SELECT 1 FROM products p
                           WHERE p.id = product_designs.product_id
                             AND public.is_org_accessible(p.organization_id)));

DROP POLICY IF EXISTS "org read product images" ON public.product_images;
DROP POLICY IF EXISTS "org write product images" ON public.product_images;
CREATE POLICY "org read product images" ON public.product_images
  FOR SELECT USING (EXISTS (SELECT 1 FROM products p
                              WHERE p.id = product_images.product_id
                                AND public.is_org_accessible(p.organization_id)));
CREATE POLICY "org write product images" ON public.product_images
  FOR ALL USING (EXISTS (SELECT 1 FROM products p
                           WHERE p.id = product_images.product_id
                             AND public.is_org_accessible(p.organization_id)));

DROP POLICY IF EXISTS "org read product tags" ON public.product_tags;
DROP POLICY IF EXISTS "org write product tags" ON public.product_tags;
CREATE POLICY "org read product tags" ON public.product_tags
  FOR SELECT USING (EXISTS (SELECT 1 FROM products p
                              WHERE p.id = product_tags.product_id
                                AND public.is_org_accessible(p.organization_id)));
CREATE POLICY "org write product tags" ON public.product_tags
  FOR ALL USING (EXISTS (SELECT 1 FROM products p
                           WHERE p.id = product_tags.product_id
                             AND public.is_org_accessible(p.organization_id)));

DROP POLICY IF EXISTS "org read product teams" ON public.product_teams;
DROP POLICY IF EXISTS "org write product teams" ON public.product_teams;
CREATE POLICY "org read product teams" ON public.product_teams
  FOR SELECT USING (EXISTS (SELECT 1 FROM products p
                              WHERE p.id = product_teams.product_id
                                AND public.is_org_accessible(p.organization_id)));
CREATE POLICY "org write product teams" ON public.product_teams
  FOR ALL USING (EXISTS (SELECT 1 FROM products p
                           WHERE p.id = product_teams.product_id
                             AND public.is_org_accessible(p.organization_id)));

-- PRODUCT_ATTRIBUTION_RULES
DROP POLICY IF EXISTS "admin read attribution rules" ON public.product_attribution_rules;
DROP POLICY IF EXISTS "admin write attribution rules" ON public.product_attribution_rules;
CREATE POLICY "admin read attribution rules" ON public.product_attribution_rules
  FOR SELECT TO authenticated USING (
    ((organization_id = current_user_org_id()) AND current_user_is_admin())
    OR current_user_is_platform_admin()
  );
CREATE POLICY "admin write attribution rules" ON public.product_attribution_rules
  FOR ALL TO authenticated USING (
    ((organization_id = current_user_org_id()) AND current_user_is_admin())
    OR current_user_is_platform_admin()
  ) WITH CHECK (
    ((organization_id = current_user_org_id()) AND current_user_is_admin())
    OR current_user_is_platform_admin()
  );

-- PRODUCT_SOCIAL_ASSETS
DROP POLICY IF EXISTS "admin all product_social_assets" ON public.product_social_assets;
DROP POLICY IF EXISTS "athlete read own product_social_assets" ON public.product_social_assets;
DROP POLICY IF EXISTS "athlete insert own product_social_assets" ON public.product_social_assets;
DROP POLICY IF EXISTS "athlete delete own product_social_assets" ON public.product_social_assets;
CREATE POLICY "admin all product_social_assets" ON public.product_social_assets
  FOR ALL TO authenticated USING (
    ((organization_id = current_user_org_id()) AND current_user_is_admin())
    OR current_user_is_platform_admin()
  ) WITH CHECK (
    ((organization_id = current_user_org_id()) AND current_user_is_admin())
    OR current_user_is_platform_admin()
  );
CREATE POLICY "athlete read own product_social_assets" ON public.product_social_assets
  FOR SELECT TO authenticated USING (
    (organization_id = current_user_org_id())
    AND EXISTS (
      SELECT 1 FROM product_athletes pa
        JOIN user_athlete_links ual ON ual.athlete_id = pa.athlete_id
       WHERE pa.product_id = product_social_assets.product_id
         AND ual.user_id = auth.uid()
    )
  );
CREATE POLICY "athlete insert own product_social_assets" ON public.product_social_assets
  FOR INSERT TO authenticated WITH CHECK (
    (organization_id = current_user_org_id())
    AND EXISTS (
      SELECT 1 FROM product_athletes pa
        JOIN user_athlete_links ual ON ual.athlete_id = pa.athlete_id
       WHERE pa.product_id = product_social_assets.product_id
         AND ual.user_id = auth.uid()
    )
  );
CREATE POLICY "athlete delete own product_social_assets" ON public.product_social_assets
  FOR DELETE TO authenticated USING (
    (organization_id = current_user_org_id())
    AND (uploaded_by = auth.uid())
    AND EXISTS (
      SELECT 1 FROM product_athletes pa
        JOIN user_athlete_links ual ON ual.athlete_id = pa.athlete_id
       WHERE pa.product_id = product_social_assets.product_id
         AND ual.user_id = auth.uid()
    )
  );

-- PRODUCT_VIDEOS (admin policy uses user_profiles join — broaden for platform admin)
DROP POLICY IF EXISTS "product_videos_admin_all" ON public.product_videos;
CREATE POLICY "product_videos_admin_all" ON public.product_videos
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
       WHERE up.id = auth.uid()
         AND up.role = 'admin'
         AND (up.organization_id = product_videos.organization_id
              OR up.is_platform_admin)
    )
  );

-- REVENUE_SPLITS
DROP POLICY IF EXISTS "org read splits" ON public.revenue_splits;
DROP POLICY IF EXISTS "admin write splits" ON public.revenue_splits;
CREATE POLICY "org read splits" ON public.revenue_splits
  FOR SELECT USING (public.is_org_accessible(organization_id));
CREATE POLICY "admin write splits" ON public.revenue_splits
  FOR ALL USING (
    ((organization_id = current_user_org_id()) AND current_user_is_admin())
    OR current_user_is_platform_admin()
  ) WITH CHECK (
    ((organization_id = current_user_org_id()) AND current_user_is_admin())
    OR current_user_is_platform_admin()
  );

-- SHOPIFY_MAPPING_QUEUE
DROP POLICY IF EXISTS "admin read mapping queue" ON public.shopify_mapping_queue;
DROP POLICY IF EXISTS "admin write mapping queue" ON public.shopify_mapping_queue;
CREATE POLICY "admin read mapping queue" ON public.shopify_mapping_queue
  FOR SELECT USING (
    ((organization_id = current_user_org_id()) AND current_user_is_admin())
    OR current_user_is_platform_admin()
  );
CREATE POLICY "admin write mapping queue" ON public.shopify_mapping_queue
  FOR ALL USING (
    ((organization_id = current_user_org_id()) AND current_user_is_admin())
    OR current_user_is_platform_admin()
  ) WITH CHECK (
    ((organization_id = current_user_org_id()) AND current_user_is_admin())
    OR current_user_is_platform_admin()
  );

-- SHOPIFY_ORDERS
DROP POLICY IF EXISTS "admin read shopify orders" ON public.shopify_orders;
DROP POLICY IF EXISTS "admin write shopify orders" ON public.shopify_orders;
DROP POLICY IF EXISTS "client read shopify orders via athlete link" ON public.shopify_orders;
CREATE POLICY "admin read shopify orders" ON public.shopify_orders
  FOR SELECT USING (
    ((organization_id = current_user_org_id()) AND current_user_is_admin())
    OR current_user_is_platform_admin()
  );
CREATE POLICY "admin write shopify orders" ON public.shopify_orders
  FOR ALL USING (
    ((organization_id = current_user_org_id()) AND current_user_is_admin())
    OR current_user_is_platform_admin()
  ) WITH CHECK (
    ((organization_id = current_user_org_id()) AND current_user_is_admin())
    OR current_user_is_platform_admin()
  );
CREATE POLICY "client read shopify orders via athlete link" ON public.shopify_orders
  FOR SELECT USING (
    (organization_id = current_user_org_id())
    AND (NOT current_user_is_admin())
    AND EXISTS (
      SELECT 1
        FROM shopify_order_line_items li
        JOIN product_athletes pa ON pa.product_id = li.product_id
        JOIN user_athlete_links ual ON ual.athlete_id = pa.athlete_id
       WHERE li.shopify_order_uuid = shopify_orders.id
         AND ual.user_id = auth.uid()
    )
  );

-- SHOPIFY_ORDER_LINE_ITEMS
DROP POLICY IF EXISTS "admin read order items" ON public.shopify_order_line_items;
DROP POLICY IF EXISTS "admin write order items" ON public.shopify_order_line_items;
DROP POLICY IF EXISTS "client read order items via athlete link" ON public.shopify_order_line_items;
CREATE POLICY "admin read order items" ON public.shopify_order_line_items
  FOR SELECT USING (
    ((organization_id = current_user_org_id()) AND current_user_is_admin())
    OR current_user_is_platform_admin()
  );
CREATE POLICY "admin write order items" ON public.shopify_order_line_items
  FOR ALL USING (
    ((organization_id = current_user_org_id()) AND current_user_is_admin())
    OR current_user_is_platform_admin()
  ) WITH CHECK (
    ((organization_id = current_user_org_id()) AND current_user_is_admin())
    OR current_user_is_platform_admin()
  );
CREATE POLICY "client read order items via athlete link" ON public.shopify_order_line_items
  FOR SELECT USING (
    (organization_id = current_user_org_id())
    AND (NOT current_user_is_admin())
    AND EXISTS (
      SELECT 1 FROM product_athletes pa
        JOIN user_athlete_links ual ON ual.athlete_id = pa.athlete_id
       WHERE pa.product_id = shopify_order_line_items.product_id
         AND ual.user_id = auth.uid()
    )
  );

-- SHOPIFY_SYNC_LOGS
DROP POLICY IF EXISTS "admin read sync logs" ON public.shopify_sync_logs;
DROP POLICY IF EXISTS "admin write sync logs" ON public.shopify_sync_logs;
CREATE POLICY "admin read sync logs" ON public.shopify_sync_logs
  FOR SELECT USING (
    ((organization_id = current_user_org_id()) AND current_user_is_admin())
    OR current_user_is_platform_admin()
  );
CREATE POLICY "admin write sync logs" ON public.shopify_sync_logs
  FOR ALL USING (
    ((organization_id = current_user_org_id()) AND current_user_is_admin())
    OR current_user_is_platform_admin()
  ) WITH CHECK (
    ((organization_id = current_user_org_id()) AND current_user_is_admin())
    OR current_user_is_platform_admin()
  );

-- SHOPIFY_SYNC_QUEUE
DROP POLICY IF EXISTS "admin read sync queue" ON public.shopify_sync_queue;
DROP POLICY IF EXISTS "admin write sync queue" ON public.shopify_sync_queue;
CREATE POLICY "admin read sync queue" ON public.shopify_sync_queue
  FOR SELECT USING (
    ((organization_id = current_user_org_id()) AND current_user_is_admin())
    OR current_user_is_platform_admin()
  );
CREATE POLICY "admin write sync queue" ON public.shopify_sync_queue
  FOR ALL USING (
    ((organization_id = current_user_org_id()) AND current_user_is_admin())
    OR current_user_is_platform_admin()
  ) WITH CHECK (
    ((organization_id = current_user_org_id()) AND current_user_is_admin())
    OR current_user_is_platform_admin()
  );

-- SHOPIFY_WEBHOOKS
DROP POLICY IF EXISTS "admin read webhooks" ON public.shopify_webhooks;
DROP POLICY IF EXISTS "admin write webhooks" ON public.shopify_webhooks;
CREATE POLICY "admin read webhooks" ON public.shopify_webhooks
  FOR SELECT USING (
    ((organization_id = current_user_org_id()) AND current_user_is_admin())
    OR current_user_is_platform_admin()
  );
CREATE POLICY "admin write webhooks" ON public.shopify_webhooks
  FOR ALL USING (
    ((organization_id = current_user_org_id()) AND current_user_is_admin())
    OR current_user_is_platform_admin()
  ) WITH CHECK (
    ((organization_id = current_user_org_id()) AND current_user_is_admin())
    OR current_user_is_platform_admin()
  );

-- SIZE_DISTRIBUTION_CURVES
DROP POLICY IF EXISTS "read global or org curves" ON public.size_distribution_curves;
DROP POLICY IF EXISTS "admin write own org curves" ON public.size_distribution_curves;
CREATE POLICY "read global or org curves" ON public.size_distribution_curves
  FOR SELECT USING (
    organization_id IS NULL
    OR public.is_org_accessible(organization_id)
  );
CREATE POLICY "admin write own org curves" ON public.size_distribution_curves
  FOR ALL USING (
    ((organization_id = current_user_org_id()) AND current_user_is_admin())
    OR current_user_is_platform_admin()
  ) WITH CHECK (
    ((organization_id = current_user_org_id()) AND current_user_is_admin())
    OR current_user_is_platform_admin()
  );

-- TAGS
DROP POLICY IF EXISTS "org read tags" ON public.tags;
DROP POLICY IF EXISTS "org write tags" ON public.tags;
CREATE POLICY "org read tags" ON public.tags
  FOR SELECT USING (public.is_org_accessible(organization_id));
CREATE POLICY "org write tags" ON public.tags
  FOR ALL USING (public.is_org_accessible(organization_id))
         WITH CHECK (public.is_org_accessible(organization_id));

-- TEAMS / TEAM_MEMBERSHIPS
DROP POLICY IF EXISTS "org read teams" ON public.teams;
DROP POLICY IF EXISTS "org write teams" ON public.teams;
CREATE POLICY "org read teams" ON public.teams
  FOR SELECT USING (public.is_org_accessible(organization_id));
CREATE POLICY "org write teams" ON public.teams
  FOR ALL USING (public.is_org_accessible(organization_id))
         WITH CHECK (public.is_org_accessible(organization_id));

DROP POLICY IF EXISTS "org read memberships" ON public.team_memberships;
DROP POLICY IF EXISTS "org write memberships" ON public.team_memberships;
CREATE POLICY "org read memberships" ON public.team_memberships
  FOR SELECT USING (public.is_org_accessible(organization_id));
CREATE POLICY "org write memberships" ON public.team_memberships
  FOR ALL USING (public.is_org_accessible(organization_id))
         WITH CHECK (public.is_org_accessible(organization_id));

-- USER_ATHLETE_LINKS (parent user_profiles)
DROP POLICY IF EXISTS "org read user athlete links" ON public.user_athlete_links;
DROP POLICY IF EXISTS "org write user athlete links" ON public.user_athlete_links;
CREATE POLICY "org read user athlete links" ON public.user_athlete_links
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM user_profiles up
     WHERE up.id = user_athlete_links.user_id
       AND public.is_org_accessible(up.organization_id)
  ));
CREATE POLICY "org write user athlete links" ON public.user_athlete_links
  FOR ALL USING (EXISTS (
    SELECT 1 FROM user_profiles up
     WHERE up.id = user_athlete_links.user_id
       AND public.is_org_accessible(up.organization_id)
  ));

-- USER_PROFILES
DROP POLICY IF EXISTS "Users see profiles in own org" ON public.user_profiles;
DROP POLICY IF EXISTS "Admins insert profiles in own org" ON public.user_profiles;
DROP POLICY IF EXISTS "Admins update profiles in own org" ON public.user_profiles;
CREATE POLICY "Users see profiles in own org" ON public.user_profiles
  FOR SELECT USING (
    public.is_org_accessible(organization_id)
    OR id = auth.uid()
  );
CREATE POLICY "Admins insert profiles in own org" ON public.user_profiles
  FOR INSERT WITH CHECK (
    ((organization_id = current_user_org_id()) AND current_user_is_admin())
    OR current_user_is_platform_admin()
  );
CREATE POLICY "Admins update profiles in own org" ON public.user_profiles
  FOR UPDATE USING (
    (current_user_is_admin() AND organization_id = current_user_org_id())
    OR current_user_is_platform_admin()
  ) WITH CHECK (
    (current_user_is_admin() AND organization_id = current_user_org_id())
    OR current_user_is_platform_admin()
  );

-- VOLUME_DISCOUNT_TIERS
DROP POLICY IF EXISTS "org read tiers" ON public.volume_discount_tiers;
DROP POLICY IF EXISTS "admin write tiers" ON public.volume_discount_tiers;
CREATE POLICY "org read tiers" ON public.volume_discount_tiers
  FOR SELECT USING (public.is_org_accessible(organization_id));
CREATE POLICY "admin write tiers" ON public.volume_discount_tiers
  FOR ALL USING (
    ((organization_id = current_user_org_id()) AND current_user_is_admin())
    OR current_user_is_platform_admin()
  ) WITH CHECK (
    ((organization_id = current_user_org_id()) AND current_user_is_admin())
    OR current_user_is_platform_admin()
  );
