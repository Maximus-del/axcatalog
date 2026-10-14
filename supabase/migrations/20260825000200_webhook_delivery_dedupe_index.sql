-- Deduplication must be enforced by the database, not by a SELECT-then-INSERT
-- in the handler: two concurrent retries of one delivery would both find
-- nothing and both insert.
create unique index if not exists shopify_webhooks_delivery_id_key
  on public.shopify_webhooks (shopify_webhook_id)
  where shopify_webhook_id is not null;
