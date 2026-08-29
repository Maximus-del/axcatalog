-- PRODUCTION SPEC ON A PLACEMENT.
--
-- The canvas records where artwork sits as a percentage of the garment photo.
-- That is the right unit for a preview and the wrong one for a printer: nobody
-- sends a press "34% of the width". The physical size is a separate fact that
-- somebody decides, so it is entered rather than derived - deriving inches from
-- a percentage would need a calibrated real-world width for every garment
-- photograph, which does not exist, and a confidently wrong print size is worse
-- than a blank one.
alter table public.product_print_placements
  add column if not exists print_width_in numeric,
  add column if not exists print_height_in numeric,
  add column if not exists notes text;

comment on column public.product_print_placements.print_width_in is
  'AX OS V2. Intended physical print width in inches. Operator-entered, never derived from the preview percentage.';
comment on column public.product_print_placements.notes is
  'AX OS V2. Production notes for this specific placement - ink, technique, anything the press needs.';

-- The composite preview a mockup card shows.
--
-- `mockups` already has storage_bucket / storage_path from its life as a photo
-- table; a rendered composite is exactly that shape, so it reuses those columns
-- rather than adding more. This timestamp records that the file is a generated
-- flatten rather than an uploaded photograph, so nothing later mistakes it for
-- source material.
alter table public.mockups
  add column if not exists preview_generated_at timestamptz;

comment on column public.mockups.preview_generated_at is
  'AX OS V2. When the composite preview in storage_bucket/storage_path was rendered. NULL means the card is still falling back to the bare garment shot.';
