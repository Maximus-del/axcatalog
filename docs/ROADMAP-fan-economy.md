# AX Fan Economy — roadmap

Captured from Chase, Aug 2026. Everything below the first section is **direction, not committed scope** — written down so it isn't re-derived from memory later.

---

## Shipped: fan design submissions

Members of an athlete can send in design ideas. Two doors, one review queue.

| Piece | Where |
|---|---|
| Fan entry point | `/a/:slug?tab=ideas` — `src/components/fan/ui/FanIdeasTab.tsx` |
| Operator queue | Admin athlete page → **Ideas** tab — `src/components/admin/ecosystem/SubmissionsTab.tsx` |
| Domain logic | `src/lib/ecosystem/submissions.ts` |
| Tables | `design_submissions`, `design_submission_files` |
| Survey | reuses `questionnaires` + `questionnaire_responses` + `questionnaire_answers` |
| Storage | `fan-submissions` bucket, public read, writes locked to `<auth.uid()>/…` |

**Design decisions worth not re-litigating:**

- **The subscriber gate is in the database**, not the UI. `is_athlete_member(athlete_id)` is checked in the RLS insert policy, so a hand-rolled request from a non-member fails at Postgres. The UI gate is a courtesy on top.
- **Accepting a submission creates an ordinary product concept** via `createAthleteProduct`. There is no parallel "fan product" table, so collections, approval and Shopify publishing need no special cases.
- **The fan's original file is copied, never moved.** Their submission stays intact and viewable after conversion — this matters the first time credit or terms are questioned.
- **Which questionnaire is the idea survey is a setting** (`questionnaires.purpose = 'fan_design_idea'`), editable in the questionnaire editor. No hardcoded slug.
- **Stage is partly derived.** `review_state` is a stored human decision; "being made" is derived from a converted product existing, so it can't drift.

**Seeded:** an org-wide survey at slug `fan-design-idea` — garment type, vibe, colours, words/numbers, when they'd wear it. Editable at Admin → Questionnaires.

---

## Next: the questionnaire layer

Chase called this out as a focus area in its own right.

- **Fan onboarding questionnaire** already exists (`/welcome` → `FanOnboarding`, writes `fan_profiles.preferences`). The ask is to deepen it, specifically **"what products do you like?"**, and use the answers to filter a product line per fan.
- The matching machinery is already built: `matchVectors()` / `recommendDesignTemplates()` in `src/lib/ecosystem/commerce.ts` does cosine similarity between a preference profile and attribute vectors. Pointing it at `fan_profiles.preferences` is the work, not inventing a recommender.
- Athlete/client onboarding questionnaires would feed profile creation the same way.

---

## Direction: fan-hosted merch

The idea: a subscriber creates or buys a design, pays to unlock it, and features it on **their own** store — using AX blanks and products.

Open questions to settle before building:

- Is the fan store a real storefront, or a section of their profile?
- What does "unlock" buy — exclusivity, a licence, or just the right to list?
- Revenue split, and who is the merchant of record.
- How this interacts with athlete approval. A fan featuring an athlete's design is a different permission question from an athlete featuring it.

The `design_submissions` conversion path is the natural seam: a fan-owned concept is the same object, pointed at a different store.

---

## Direction: heat press program

Subscribers finance a heat press monthly. They then need only:

- **Blanks** — MOQ of 3, so they hold almost no stock.
- **Prints** — bought from AX per design.

They apply prints to whatever product they want. Effectively this turns customers into distributed production capacity that pays AX for the privilege.

What it implies for the app:

- A **prints** product type distinct from finished goods (sell the transfer, not the garment).
- Subscription billing with a financed-hardware line item — the first thing here that needs real payments, unlike the current mock (`subscribeMock` just sets `athlete_follows.state`).
- Low-MOQ blank ordering, which the blanks catalogue mostly supports already.
- Some notion of a licence: what a press owner is allowed to print, for whom, how many.

---

## Standing constraint

Chase, repeatedly and correctly: **do not overbuild**. Each of these is a separate round. Reuse what exists — the questionnaire tables, the recommender, the product board, the versioned prompt system — rather than growing a parallel version of it.
