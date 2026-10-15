# Approved design system
Cinematic premium football locker room. Dark espresso wood, black metal, warm overhead light, restrained destination glow. Match references/01-locker-room.png first.

Destinations: Atlanta #1 red; Chicago #11 orange; New York #17 blue; Moon’s House warm gold. No duplicated #17 uniforms.

Use 6 supplied PNG artwork layers. Figures include their own platforms; do not draw another platform underneath. Keep object-fit:contain and bottom alignment. Coffee is wider; scale it down to 79% of the common stage height. The full-body figures are raster collectibles, not rotatable 3D models. Slight CSS lift is appropriate; orbiting would require actual 3D files.

Each destination uses locker-bay.png as background + CSS accent glow + transparent collectible + real HTML label + real CTA. The wide locker-room.png is optional atmospheric hero backing; individual bays handle responsive composition more predictably. Never stretch the four-bay background to match every viewport.

Typography: current system uses local Arial Black/Impact and Inter/Arial fallbacks so the kit makes no external font requests. Lovable may use an approved licensed squared display face and Inter after reviewing the current project fonts.

Desktop: 224px sidebar, four destination columns; <=1100px two columns, smaller sidebar; <=640px stacked shell and two destination columns, one-column functional panels; <=360px one destination column. Minimum 44px interactive targets, keyboard-visible focus, no hover-only functionality, reduced motion support.

Component library: DestinationCard, StatCard, QuickActionCard, ProductCard, ProjectCard, ContentAssetCard, DropCard, EmptyState, ErrorState, SkeletonCard, Panel. All text/data/action components stay live.

Source screenshots contain credit $2,500, lifetime $3,000, 31 orders, 20 live products and separately $135 attributed revenue. Those are historical screenshot examples, not production seed data. Kit preview uses dashes for live financial values. No fabricated projects/products/orders go into production.

Mockup artwork in references is visual guidance, not approved sellable merchandise. Use current approved product/media images from existing store. No fonts, product photography or official standalone team logo files are included. Use the project’s already approved icon/logo system; the supplied crescent is a simple provisional code-native mark.
