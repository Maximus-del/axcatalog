# How should an athlete/client user be represented?

**Prepared, not decided. This proposes no model — it states the mechanics, the
blast radius, and the question that has to be answered before the first real
client logs in.**

31 August 2026 · measured against `cuidofxidstqpgypxcop`

---

## The exact current behaviour

Every operator table in V2 is gated the same way. `mockups` is representative:

```sql
"mockups_org_access"  FOR ALL TO authenticated
USING      (is_org_accessible(organization_id))
WITH CHECK (is_org_accessible(organization_id))
```

and

```sql
is_org_accessible(_org_id) =
  _org_id = current_user_org_id()          -- user_profiles.organization_id for auth.uid()
  OR current_user_is_platform_admin()
```

So access is decided by **one scalar**: `user_profiles.organization_id`. There
is no role check, no per-athlete scoping, and no distinction between a member of
staff and anyone else holding a profile in that organisation. `mockups_org_access`
is `FOR ALL`, so it grants **write** as well as read.

## What that means if a client profile receives the AX org id

Measured, not estimated:

| | |
|---|---|
| Tables gated by `is_org_accessible` | **69** |
| Policies using it | **118** |
| Rows in the Athlete Xclusive org: mockups | 42 |
| designs | 84 |
| products | 171 |
| orders | **646** |
| athletes | 7 |

A user whose `user_profiles.organization_id` is the AX org passes
`is_org_accessible` for every one of those. They would read — and, wherever the
policy is `FOR ALL`, write — every other athlete's mockups, every design, every
product and the entire order history.

**The `client_mockups` view would be beside the point.** It is a narrow read
path bolted onto a boundary that, in that configuration, is already open. This
is why it is worth settling before the first client account, not after.

The two portal users that exist today are both `role = 'admin'` in the AX org,
so this has never been exercised. There are three `user_profiles` rows in total
and all three are admins.

## What the portal currently keys off

Separately from the org: `useCurrentAthlete` resolves "who am I" from
`user_athlete_links`, and the portal's own tables (`portal_hidden_products`,
portal views) scope by that link — not by organisation. So the portal already
has a per-athlete identity mechanism that is independent of `organization_id`.

The two mechanisms do not currently agree with each other, and nothing forces
them to.

## The question to answer

**What `organization_id` does a client's `user_profiles` row carry, and what
stops that value from granting operator access?**

Three shapes are consistent with what already exists. I am not choosing between
them — each has a real cost, and the choice is yours.

**A · The athlete's own organisation.** Darnell already owns one
(`Darnell Mooney`, and Steven and Carnell likewise). A client profile carrying
their own athlete's org would fail `is_org_accessible` for AX data, so no
operator access. *Cost:* only entities that own an organisation can have client
logins — 3 of 9 real entities do today — and someone has to decide what happens
for a client who does not own one.

**B · A dedicated non-operator organisation.** All client profiles sit in one
"clients" org that owns no data, and per-client scope comes entirely from
`user_athlete_links`. *Cost:* `is_org_accessible` then returns true for an org
with nothing in it, which is safe but means the org column stops being
meaningful for these users — and anything later filed under that org becomes
visible to all of them.

**C · Make the role part of the gate.** Leave the org as-is and change
`is_org_accessible`, or the policies, to require an operator role. *Cost:* this
is a change to the function 118 policies depend on. It is the most thorough fix
and by far the widest blast radius; it wants its own review and its own test
matrix, exactly like §0 got.

## What I would want to know before recommending one

1. Will every client be an entity that owns an organisation, or not?
2. Should a client ever write anything? (Today `mockups_org_access` is `FOR ALL`;
   the portal writes `portal_hidden_products`, `portal_threads`, `saved_items`.)
3. Is `user_athlete_links` intended to be the single source of "which athlete am
   I", with `organization_id` reduced to an operator-only concept?

## Related, unresolved, and not part of this

`public_athletes`, `public_content` and `public_drops` currently grant
`INSERT, UPDATE, DELETE` to **`anon`** as well as `authenticated` — the Supabase
default privileges on views created in `public`, never revoked. Whether those
views are auto-updatable (and therefore actually writable) has not been tested.
Flagged during the Item 1 review; untouched.
