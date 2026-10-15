# Mooney World — frontend and backend handoff
## Start here
1. Extract the ZIP. Open preview.html to view composited destination cards and the reusable UI card catalogue locally. All artwork is included; no external network needed.
2. Give Lovable LOVABLE-FRONTEND-PROMPT.md, frontend/, public/mooney/, asset-manifest.json and references/.
3. Give Claude CLAUDE-BACKEND-PROMPT.md, backend/, frontend/contracts.ts and docs/.
4. Both agents read docs/screen-map.md. Agree endpoint adapter mappings before wiring data.

## Included
6 original generated PNG artwork files (four transparent collectibles with integrated pedestals + wide room + empty locker bay); 6 approved visual reference images; reusable React/TypeScript cards and LockerRoom composition; responsive design tokens/styles; shared types, destination config, API specification, screen map and acceptance criteria; local working preview; asset manifest and checksums.

No product photography is invented as a production asset. Current approved store media is required. No live application code or credentials were accessed. Prompts tell Claude to inspect the actual repository/schema rather than run speculative migrations. This is a concrete visual/implementation starter pack; integration remains with Claude and Lovable.

## Copying artwork
Move public/mooney/ into the app public/ folder. Existing CSS URLs then resolve at /mooney/assets/. Original PNG alpha is preserved. Local preview rewrites only URL paths for filesystem loading; production CSS uses absolute public URLs.

## Preview versus live data
Preview finance values are dashes. Source mockups retain historical example numbers and illustrative garment/project designs; never seed those as live records. UI buttons in preview demonstrate states only. React card callbacks must be wired to real operations in the existing app.

## Scope
Raster art from built-in image generation; CSS/React creates live cards, not screenshot crops. Figurines are not 3D meshes. Art variants may have small sculpt differences from the concept screenshots. Match the supplied art and CSS for a consistent final composition.

Individual responsive destination HTML cards are in cards/. For production use the equivalent DestinationCard React component so navigation remains live.

Validation scope and environment limits: docs/validation-results.md. React starters were reviewed but must be compiled and tested in your existing application.
