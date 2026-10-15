# Proposed adapter contract v1
Not an assertion about existing APIs. Claude should map or adapt these operations to current infrastructure; Lovable consumes one normalized interface. Prefix below: /api/portal. Authenticated JSON unless download endpoint. Every operation is tenant scoped on server. shared types: ../frontend/contracts.ts.

## Common semantics
Money uses integer minor units + ISO currency. Do not sum mixed currencies. All timestamps ISO 8601 UTC; report windows include explicit timezone and use [from,to) boundaries. Counts are nonnegative integers or null if unknown. Null is unavailable, zero is known zero. List responses Page<T>; opaque nextCursor, limit default 24 maximum 100. Error body ApiError with useful field errors and requestId. HTTP 401 unauthenticated, 403 unauthorized, 404 missing/not visible, 409 concurrency/state conflict, 422 validation, 429 rate limit. Do not leak another athlete's resource existence.

## Operations
| Method/path | Request | Response/behavior |
|---|---|---|
| GET /summary?from=&to=&timeZone= | Server validates period/timezone | Summary; lifetime and period metrics distinct, asOf and revenueBasis required |
| GET /collections | None | Destination[]; catalog-to-collection mapping is server maintained |
| GET /products?collection=&hidden=&cursor= | Valid destination, filters | Page<Product>; images current approved assets; price validated again on ordering |
| GET /products/:id | None | Product plus available variants/sizes; current stock authority from Shopify |
| POST /order-requests | {package:game_day/camp/vip/standard,items:[{variantId,quantity}],useCredit:boolean,shippingAddressId?,quoteVersion?}; Idempotency-Key header | Validated server quote or existing workflow order-request result; no automatic payment capture in this contract |
| GET /bulk-order-sheet | collection filter | Authorized current sheet download, reuse existing format |
| GET /credit/activity | cursor | Ledger activity according to existing credit rules; never inferred from revenue |
| GET /projects | cursor,status? | Page<Project> |
| POST /projects | {title,kind,idea,vibes:[],details?,destinationId?,inspirationIds:[]} | Project; kind new_merch/game_day/football_camp/personal_brand/collection/other |
| GET /projects/:id | None | Project including current version/concepts |
| POST /projects/:id/decision | {conceptId,conceptVersion,expectedProjectVersion,decision:approve/request_changes,feedback?} | Updated Project; atomic version compare; 409 when stale; approve exact asset version |
| GET /messages?projectId= | Omit projectId for general AX Team | Page<Message> |
| POST /messages | {projectId:null|string,body,attachmentIds:[]} | Message; attachments must belong to same authorized scope |
| POST /uploads | {name,mime,size,purpose,projectId?} | {uploadId,url,expiresAt}; constrain allowed MIME/bytes per existing policy |
| POST /uploads/:id/complete | Storage/object confirmation | Authorized finalized attachment metadata; verify bytes/type, do not trust browser MIME alone |
| GET /assets?kind=&collection=&cursor= | approved usable media | Page<MediaAsset>; private download URLs short-lived |
| POST /assets/:id/download | None | {url,expiresAt}; authenticate again; log only if existing policy permits |
| GET /drops | cursor,status? | Page<Drop> |
| POST /drops | {title,destinationId?,scheduledAt:null|string,timeZone} | Draft Drop; UTC conversion validated |
| PATCH /drops/:id | expectedVersion + intended state/change | Authorized workflow; schedule/publish requires existing publish permission, never arbitrary browser state |
| GET /analytics?from=&to=&timeZone= | Period | {period,revenueBasis,asOf,attributedRevenue,monthly:[{month,value:Money}],byDestination:[{destinationId,value:Money|null}],topProducts:[]} |
| GET /orders | cursor | Page<Order> |
| GET /profile | None | Authorized editable profile, membership metrics, progression and approved referral code/url |
| PATCH /profile | Allowlisted profile fields | Server-validated updated profile; financial totals/roles never editable here |

## Ownership and storage model to map (not executable DDL)
athlete/account <- verified member <- auth user.
collections belong to athlete and reference approved destination/art mapping.
products and orders reference Shopify identities; collection attribution explicit, nullable.
projects belong to athlete; concept assets belong to project; decisions retain asset version and decision author.
messages belong to athlete and optional project. Validate child-parent consistency in every mutation.
uploads/media belong to athlete plus optional project; validate storage path against ownership; finalized status required before attachments are visible.
drops belong to athlete and optionally collection; scheduling uses timezone.
credit activity and financial reporting use existing authoritative services. Never expose a service-role client to frontend.

## Reporting and ordering rules
$3,000 lifetime and $135 attributed last-12-month revenue in screenshots are different scopes. No equation should force them to match. Define whether revenue is gross/net/athlete share from existing business rules; return it explicitly.
Missing destination attribution stays null, displayed 'Revenue not attributed', never fabricated city totals. Chicago #11, Atlanta #1, New York #17 map to collection identities, not changing athlete identity.
Preserve refund/cancellation/currency handling and existing attribution semantics. Do not infer current team from old screenshot 'current era'.
Order submission must validate variant, quantity, eligibility, stock, pricing, shipping, and credit. Credit reservation/debit and order processing must reuse existing atomic/idempotent workflow, compensating failed requests according to current rules. UI disabling a button does not replace server idempotency.
