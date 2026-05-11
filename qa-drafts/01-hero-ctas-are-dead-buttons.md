# Hero CTAs on the landing page are dead buttons

## What happened

On the marketing landing page (`/`), the two hero call-to-action buttons in
the headline section — **"Register a bot"** and **"Watch demo"** — are
visually rendered but do nothing when clicked. They have no destination,
no form submission, and no observable side effect.

## What I expected

- **Register a bot** should take the visitor into the bot-registration
  flow — almost certainly `/signup` for a new visitor (and on to the
  bot-registry surface once authed). It's the primary conversion button
  on the landing page; it must lead somewhere.
- **Watch demo** should open a demo experience — a recorded demo, a live
  demo page, or a modal — depending on what the marketing team intends.
  Either pick a destination or remove the button.

## Steps to reproduce

1. Open the landing page at `/` (in a logged-out session, viewport
   ≥1024px so the hero CTAs are visible).
2. Click **Register a bot** in the headline section.
3. Observe that nothing happens — the URL doesn't change, no modal opens,
   no network request fires.
4. Repeat step 2 with **Watch demo**: same result.

## Additional context

- This blocks the most obvious top-of-funnel action a first-time visitor
  would take. Anyone landing on the marketing page and trying to sign up
  via the hero CTA hits a dead end.
- The header's account menu still works as a workaround, but no
  first-time visitor would intuitively look there before clicking the
  big "Register a bot" button.
- Same surface offers a `NEW paper-trading audits for AI agents` link
  above the hero that *does* navigate, so the inconsistency reads as a
  regression rather than an intentional design choice.
