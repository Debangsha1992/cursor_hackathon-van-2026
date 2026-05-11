# AllScale errors collapse to "AllScale request failed" because real responses omit `error.message`

## What happened

In production, the AllScale API returns error envelopes of this exact
shape (verified against `https://openapi.allscale.io/v1/test/ping` with
an invalid key):

```json
{
  "code": 20002,
  "error": { "details": { "reason": "invalid_key" } },
  "payload": null
}
```

Note that `error.message` and `request_id` are **not present** for at
least the `20002` family of errors, even though the AllScale docs show
both fields as part of the canonical envelope.

Our client treats this envelope by reading `error.message ?? "AllScale
request failed"`, so the user-facing error reduces to the literal string
`"AllScale request failed"` — and the actually-useful diagnostic
(`reason: "invalid_key"`, `reason: "signature_mismatch"`,
`reason: "timestamp_out_of_window"`, etc.) is buried in
`error.details` where the UI never surfaces it.

## What I expected

The error a user sees in the red panel under the **Pay $10 USD with
AllScale** button should at minimum tell them, or our on-call, *why*
AllScale rejected the call. For real failures (invalid key, bad
signature, IP-allowlist deny, rate limit) the `details.reason` is the
single most useful piece of context.

The minimum bar is:

- If `error.message` is present, show it.
- If `error.message` is absent but `error.details.reason` is present,
  show `${humanise(details.reason)}` instead of "AllScale request failed".
- Surface `code` and any `request_id` (when present) underneath, so
  support can match against AllScale's logs.

## Steps to reproduce

1. Configure the app with **any** AllScale credentials that AllScale
   will reject — easiest is leaving the real `ALLSCALE_API_KEY` empty
   on the server and hard-coding any non-empty value, or using a
   revoked sandbox key.
2. Sign in to PaperPilot, visit `/billing`, click **Pay $10 USD with
   AllScale**.
3. Observe the red error panel: it shows the literal string
   "AllScale request failed" (or the env-var leak from the sibling
   issue, depending on which failure mode you hit first).

You can reproduce the upstream envelope directly with:

```bash
curl -s https://openapi.allscale.io/v1/test/ping \
  -H 'X-API-Key: qa_fake_key' \
  -H 'X-Timestamp: <unix>' \
  -H 'X-Nonce: <uuid>' \
  -H 'X-Signature: v1=<any-base64>'
```

→ `{"code":20002,"error":{"details":{"reason":"invalid_key"}},"payload":null}`

## Additional context

- This is a docs-vs-reality divergence on AllScale's side. The
  `api-doc-auth.md` example claims responses include
  `"message": "Bad signature"` and `"request_id": "req_xxx"`. Real
  responses for `20002` ship neither. We can't rely on the docs alone.
- The fix lives entirely inside our AllScale client — the envelope is
  parsed in one place, so the error-mapping changes are one-spot
  surgery and covered by `allscaleClient.test.ts` already.
- The same fallback also fires on any future error code AllScale adds
  without a `message`, so the fix should be defensive: prefer
  `error.message`, then `error.details.reason` (humanised), then the
  hardcoded fallback as the last resort.
