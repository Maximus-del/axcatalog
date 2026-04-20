# Athlete Xclusive

Internal admin + athlete portal for managing merchandise, designs, and revenue.

## Mobile-first rule

**Every UI surface must be designed and tested at 375px (iPhone SE) first.**
The primary user is an NFL athlete on an iPhone — mobile is not an afterthought.

When building or modifying any component:

1. Start at 375px. Verify there is no horizontal scroll, every tap target is ≥44×44px, and form inputs are ≥16px font-size (iOS auto-zooms anything smaller).
2. Then verify 390px (iPhone 14/15), 430px (Pro Max), 768px (iPad), 1024px (iPad landscape), and 1440px (desktop).
3. Replace hover-only interactions with tap-based ones on touch devices.
4. Modals should become bottom sheets on mobile (slide up from the bottom, with a drag handle).
5. Tables should restructure as stacked cards on mobile — never horizontally scroll.
6. Use the `pb-safe`, `pt-safe`, `pb-bottom-nav`, and `bottom-safe` utility classes for iOS safe-area handling.
7. Use the `pressable` class on tappable elements for the slight scale-down active state.
8. For lists with destructive actions, wrap rows in `<Swipeable />` to expose swipe-to-archive on touch devices.
9. Trigger `haptic.tap()` / `haptic.success()` from `@/lib/haptics` after meaningful interactions (no-op on iOS Safari, fires on Android).

## Tech

- React 18, Vite 5, TypeScript, Tailwind 3
- Supabase (Lovable Cloud) for auth, RLS, storage, and edge functions
- Shopify Admin API integration via edge functions
