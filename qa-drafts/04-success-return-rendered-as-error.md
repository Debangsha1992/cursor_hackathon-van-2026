# Post-checkout success return is rendered in a destructive (red) error panel

## What happened

When the user completes (or cancels) a payment on AllScale's hosted
checkout, AllScale bounces them back to
`https://<our-domain>/billing?status=success`. The `/billing` page reads
that query string and, on `status=success`, shows the following message:

> *"Returned from AllScale Checkout. If your payment cleared, your plan
> will be updated by the webhook shortly."*

The message itself is fine, but it is rendered inside the
**destructive-styled error panel** — red border, light red background,
red text — the exact same visual treatment used for hard checkout
failures ("AllScale rejected the checkout intent" etc.).

A user returning from a paid checkout sees a red error box telling them
something happened "shortly" — they cannot tell whether it succeeded or
not, and the red treatment strongly implies it failed.

## What I expected

A return from AllScale should show in a **neutral or success-styled**
banner — typical patterns:

- A green/emerald success panel with "Thanks — we've received your
  return from AllScale. We'll mark your account Pro once settlement
  clears."
- Or a muted neutral panel (same surface as the rest of the page) for
  the "pending settlement" state.

The destructive variant must be reserved for *actual* errors so users
trust the colour signal.

Bonus: the redirect today is unconditional on `status=success`, but
AllScale's checkout-cancel path will produce the same redirect with no
status. The page should differentiate at least three states explicitly:
**success-pending**, **cancelled**, and **error**.

## Steps to reproduce

1. Sign in to PaperPilot and visit `/billing`.
2. In the address bar, append `?status=success` and reload (or click
   **Pay $10 USD with AllScale** with valid credentials and finish the
   checkout, then let AllScale redirect you back).
3. Observe the status banner under the **Pay $10 USD with AllScale**
   button: it is red, with a red border, identical to the panel that
   shows "AllScale rejected the checkout intent" for hard failures.

## Additional context

- The implementation seeds the component's initial `Status` to
  `{ kind: "error", message: "..." }` for `?status=success`, which is
  the underlying cause — the state machine has only `idle | loading |
  error | redirecting` and reuses `error` as a catch-all "show banner"
  bucket. Adding a `success-pending` (or `info`) variant alongside
  fixes both this and the cancellation case.
- Pairs with the missing webhook handler — until settlement actually
  updates the user to Pro, the return message is the only feedback
  the user gets from the checkout round-trip, so getting its colour
  right is high-leverage.
