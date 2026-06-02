ALTER TABLE public.order_line_items
  ADD CONSTRAINT order_line_items_order_id_fkey
  FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;

ALTER TABLE public.order_line_items
  ADD CONSTRAINT order_line_items_attributed_org_id_fkey
  FOREIGN KEY (attributed_org_id) REFERENCES public.organizations(id) ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';