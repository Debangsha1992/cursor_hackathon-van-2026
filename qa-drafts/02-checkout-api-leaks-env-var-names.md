# Checkout API leaks internal env-var names to the end user when misconfigured

## What happened

`POST /api/billing/checkout` (with a valid logged-in session) returns the
following 500 response body when AllScale credentials haven't been
configured in the deployment:

```json
{
  "error": "Missing environment variable ALLSCALE_API_KEY. Set it in .env.local. AllScale credentials live in app.allscale.io → Settings → Commerce."
}
```

This message is forwarded verbatim to the browser, which then displays it
inside the red error panel under the **Pay $10 USD with AllScale** button
on `/billing`.

## What I expected

The end user should see a neutral, user-facing failure message — something
like "Checkout is temporarily unavailable. Please try again in a few
minutes." — while the underlying error (with the env var name, deploy
hint, and stack) stays in the server log only.

Leaking the literal env-var name `ALLSCALE_API_KEY` and the path
`.env.local` to anyone hitting `/billing` is:

1. **A UX problem.** Paying customers see "Missing environment variable …"
   and have no idea whether the fault is theirs or the operator's.
2. **A mild information disclosure.** It tells anyone with an account
   exactly which environment variables we read and where we expect them,
   plus the merchant-portal URL we use for credentials.

## Steps to reproduce

1. Deploy with `ALLSCALE_API_KEY` (or any of `ALLSCALE_API_SECRET`,
   `ALLSCALE_API_BASE_URL`) unset.
2. Sign in to PaperPilot and visit `/billing`.
3. Click **Pay $10 USD with AllScale**.
4. Observe the red error panel: it contains the verbatim string
   "Missing environment variable ALLSCALE_API_KEY. Set it in
   .env.local. AllScale credentials live in app.allscale.io → Settings
   → Commerce."

## Additional context

- The same surface also forwards `code` and `requestId` fields from
  the AllScale error envelope. Those are safe to expose (they're useful
  for support), but the env-validation message is a different category
  entirely — it's an operator-facing diagnostic.
- The simplest mitigation is at the API-route layer: catch the
  env-validation error, log it server-side, and return a generic
  `{"error": "checkout_unavailable"}` to the client. The detailed
  AllScale errors (code, requestId, "Validation error", etc.) should
  continue to flow through unchanged.
- The same leak pattern would apply to any other env-var consumer the
  checkout route grows over time, so the fix wants to be in the
  exception handler, not specific to this one var.
