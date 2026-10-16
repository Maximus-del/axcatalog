# Current task

- [x] Match the supplied Locker Room composition using existing assets: one desktop wall, aligned cutouts, separate collection captions, mobile bay fallback, and shared glass-panel ground.
- [x] Isolated visual and interaction checks at 375, 390, 768, 1024 and 1440px; 16 navigation tests passed.
- [x] Latest full project validation reports build OK.

- [x] Diagnose admin “View as Darnell” returning to login: the admin button opens a new tab, while embedded preview sign-in can depend on the editor; portal guard already permits authenticated admins.
- [ ] Correct the admin preview entry/sign-in handoff — blocked by separately maintained admin navigation and authentication outside portal presentation scope; live account reproduction unavailable.

- [x] Locker Room presentation with existing artwork and live-hook destinations, summary, projects and drops.
- [x] Five-item shared navigation and global AX Team drawer; preserve View-as context.
- [x] Isolated layout checks at 375, 390, 768, 1024 and 1440px; existing adapter regression tests.
- [ ] Authenticated live data and message-send verification — blocked by externally managed sign-in without a usable session.
- [ ] New gear/brand aliases and old-address redirects — blocked by routing outside the permitted editing area.
- [x] Latest preview validation reports build OK.

## My Gear
- [x] Build world-only My Gear with live/archive catalog, collection chips, existing ordering and DesignsGrid; preserve classic page.
- [x] Isolated presentation checks at 375, 390, 768, 1024 and 1440px: no horizontal page overflow; paging, image sides, archive ordering entry, collection empty states, DesignsGrid entry and View-as controls passed; 43 existing catalog/navigation tests passed.
- [ ] Authenticated My Gear checkout verification — blocked by externally managed sign-in without a usable session; checks used isolated fixture data, not live account data.
- [ ] Full project validation — blocked by the pre-existing IntersectionObserver scrollMargin error in src/test/setup.ts, outside the permitted portal presentation scope.

Stop after My Gear; other screen redesigns are not part of this task.