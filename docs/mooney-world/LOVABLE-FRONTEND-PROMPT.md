# Paste this into Lovable with the extracted pack and five reference screens
Implement this approved Mooney World private athlete portal redesign in the existing app. Use references/01-locker-room.png through 05-brand-hq.png as the visual target. Match the cinematic dark locker room, glowing collectible displays and shared five-item sidebar, while keeping existing working features.

Start by inspecting current framework, router, auth, UI components, data hooks and current backend endpoints. Keep current integrations and routes where practical; adapt proposed routes in docs/screen-map.md. Do not replace working auth or build a second backend.

Copy public/mooney into your public directory. These are real generated artwork assets with verified alpha. Use asset-manifest.json for dimensions and frontend/destinations.json for corrected number/color mappings. Use actual assets, never generic stock athletes or screenshot crops. Preserve full silhouettes and existing alpha. Do not simulate a 3D rotation.

Import frontend/tokens.css, contracts.ts, cards.tsx and LockerRoom.tsx as a starter; adapt imports to the repository. Components are provided as implementation starting points, not an installed application. Build the five complete screens using docs/screen-map.md and docs/design-system.md. Cards are live DOM components; keep all headings, currency, labels, statuses and buttons editable and responsive. Do not embed the full dashboard screenshot as the UI.

Backend coordination: use frontend/contracts.ts and backend/api-contract.md as the agreed boundary. Tell Claude any required changes before diverging. Connect to existing endpoints through a single adapter layer. Keep loading/error/empty/ready distinct. Null means unknown and renders an em dash; zero means verified zero. Do not seed screenshot balances or demonstration project lists.

Home: four collectible destination lockers, concise KPI strip, quick actions, actionable project feedback and upcoming drops. My Gear: collection filters, approved products, front/back, copy link, bulk orders, package ordering. Studio: project queue, current concept, exact-version approval, brief, attachments and contextual chat. Content: media filters/downloads/captions/product links and drop planner together. Brand HQ: period-qualified revenue, orders, era attribution, community and profile.

General AX Team messages are a global drawer. Credit activity, referral code, order details, filters, and profile editing open contextual panels without adding primary tabs. Existing admin impersonation must remain visible when active.

Ensure every visible control navigates or performs a real action with feedback. Add accessible drawers with focus trap/Escape/focus restoration. Preserve server validation and never calculate trusted prices or credit balances in the browser. Validate authorized downloads and use clipboard with success/error feedback.

Use supplied CSS breakpoint guidance and reduced-motion support. Preview at 1440, 1024, 768 and 390px; no horizontal page overflow. Keep figurines prominent and business controls readable. Only destination artwork and restrained architecture need cinematic treatment; forms and tables remain calm.

Implement and verify one screen at a time, starting with home. Compare against the reference, then wire real data and test owner access, ordering, brief creation, upload, concept feedback, downloads and period reporting. List any missing approved product media or backend blockers explicitly.
