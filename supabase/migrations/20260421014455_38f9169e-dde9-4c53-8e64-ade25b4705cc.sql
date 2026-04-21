-- Create design_collections table for organizing designs into folders (e.g. "Rams", "Falcons")
CREATE TABLE public.design_collections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_design_collections_org ON public.design_collections(organization_id);
CREATE UNIQUE INDEX idx_design_collections_org_name ON public.design_collections(organization_id, lower(name));

ALTER TABLE public.design_collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org read design_collections"
ON public.design_collections FOR SELECT
USING (organization_id = current_user_org_id());

CREATE POLICY "org write design_collections"
ON public.design_collections FOR ALL
USING (organization_id = current_user_org_id())
WITH CHECK (organization_id = current_user_org_id());

CREATE TRIGGER trg_design_collections_updated_at
BEFORE UPDATE ON public.design_collections
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Add collection_id to designs (nullable so existing 14 design files / designs continue working)
ALTER TABLE public.designs
ADD COLUMN design_collection_id UUID REFERENCES public.design_collections(id) ON DELETE SET NULL;

CREATE INDEX idx_designs_design_collection_id ON public.designs(design_collection_id);