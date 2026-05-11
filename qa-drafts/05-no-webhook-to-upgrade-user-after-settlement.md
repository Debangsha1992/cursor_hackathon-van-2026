# No webhook handler exists to actually upgrade a user to Pro after AllScale settlement

## What happened

The new billing flow takes a logged-in user from "free" to "Pro" in four
steps:

1. User clicks **Pay $10 USD with AllScale** on `/billing`.
2. Our route creates a checkout intent against AllScale, returns the
   hosted `checkout_url`, and the browser redirects there.
3. User pays on `checkout.allscale.io`.
4. AllScale fires a settlement webhook to our app.

Today, **step 4 has no listener.** There is no route handler registered
to receive AllScale's settlement webhook, no verification of AllScale's
webhook signature, and no code path that flips a user's plan tier in
Supabase from `free` to `pro`. The plan-tier value is referenced by the
usage gate (`free`: 5 audits/month, `pro`: 100), but nothing ever
*writes* `pro` for a user.

The `/billing` page even advertises the missing piece in copy: "If your
payment cleared, **your plan will be updated by the webhook shortly.**"
— that webhook does not exist.

## What I expected

For the payment flow to actually deliver value, the AllScale
settlement-webhook event needs to:

1. Arrive at a known, documented endpoint on our app.
2. Be verified using AllScale's webhook-signing scheme (signature on
   the raw body, replay window, signing-secret rotation supported).
3. Look up the user via the `user_id` we stamp on the checkout intent
   when we create it.
4. Mark that user's plan as Pro in Supabase (the same source the
   usage gate reads from).
5. Be idempotent — AllScale will retry on non-2xx, and the same
   settlement may arrive more than once.

Until at least (3) and (4) exist, the "Upgrade to Pro" button is a
payment-collection-only feature: it bills the user, but they get
nothing in return except the same free-tier limits.

## Steps to reproduce

1. Sign in to PaperPilot as a free-tier user.
2. Visit `/billing`.
3. Pay $10 on AllScale's hosted checkout (real or testnet) and return.
4. Inspect the user's Supabase row (or call any code path that reads
   the user's plan tier): the user is still on `free`.
5. Audit something — the free-tier 5-audit cap still applies despite
   having paid.

## Additional context

- The `user_id` is already attached to every checkout intent we create
  (set in the API route), so the receiver has the join key it needs —
  the matching field will arrive in the AllScale settlement event.
- AllScale publishes a webhook-signing guide at
  `docs.allscale.io/allscale-checkout/api-reference/api-doc-webhook-signing-and-payload-guide`.
  The signing primitive is the same canonical-string + HMAC-SHA256
  pattern our outbound client already uses, so the shared utility can
  be promoted out of the client into a `lib/billing/signing.ts` and
  re-used for verification.
- The user-facing plan-tier write surface needs to live somewhere
  durable — most natural is a `subscriptions` (or `profiles.tier`)
  table in Supabase, gated by RLS so users can read their own tier
  but not write it.
- This is the missing half of the billing feature. Without it,
  shipping the upgrade button to production would take money without
  delivering the upgrade.
