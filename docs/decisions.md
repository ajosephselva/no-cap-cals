# Design decisions

Each entry: what we chose, the alternative, and why.

## Product

**Calorie range as the headline, best estimate secondary.** Alternative: one number like competitors. The range is the brand ("no cap"): it tells users how sure we are. The best estimate (red dot on the range bar, with a Copy button) is there for users who log into another tracker.

**Clarifying-question agent, max 3 questions, Skip always visible.** Alternative: single-shot estimate. Photos cannot show cooking method, oil, or how much of a shared dish was eaten, so the agent asks. The cap and Skip protect the core promise of fast logging. "Not sure" skips one question; "Skip, just estimate" skips the rest.

**Photos are never stored.** Alternative: store in a private bucket. The browser keeps the resized image and resends it each turn. Less personal data held, nothing to clean up on deletion.

**Email confirmation off for the demo.** Supabase's built-in mailer is heavily rate-limited; a stuck confirmation email would break a live demo. The confirmation callback route exists, so it can be turned back on.

## AI design

**One agent, not several.** The model makes one decision per turn: ask or finalize. A second "checker" agent looking at the same photo cannot know how food was cooked, and similar models share mistakes. Correctness is enforced by deterministic code instead; question quality is graded offline (LLM-as-a-judge, Tier 2).

**Code owns every number shown.** The model returns items, macros, and an uncertainty label per item (low / medium / high). Code converts labels into ranges, checks macro math (4/4/9 kcal per gram), and retries once with the exact error if it fails (validation-and-repair loop).

**State carried across turns.** First test: portions drifted between turns (600 g to 300 g chicken with no relevant answer) because the model re-estimated from scratch. Fix: each turn receives its previous estimate and must change only what the new answer affects.

**Agent targets the biggest uncertainty.** First user feedback: a 690 to 1,190 cal range "doesn't help anyone." Cause: questions went to oil and cream while chicken portion drove most of the range. Fix: code computes which item has the largest calorie swing and tells the agent to ask about it, in countable units (pieces, cups, slices) rather than grams.

**Ranges combine by root-sum-of-squares.** Alternative: add every item's worst case. Independent errors partly cancel, so stacking worst cases overstated uncertainty. Same curry: 690 to 1,190 became 740 to 1,140 with no answers and about 920 to 1,170 after three answers.

**Width per uncertainty label is a starting assumption, to be calibrated.** Low = plus or minus 10%, medium = 20%, high = 35%, minimum meal width 8% (5% when a nutrition label is read). These are priors. The eval measures how often the true calories fall inside our range; the target is about 80%. Too often means ranges are too wide, so we tighten; too rarely means widen.

**Prompt injection.** Text in photos, notes, and answers is treated as meal information, never instructions; output is forced into a strict JSON schema; the model has no tools or database access.

## Engineering

**Next.js + Supabase + Stripe on Vercel.** One TypeScript codebase and one deploy; Supabase gives auth, Postgres, and row-level security in one place.

**Cache Components turned off.** Every page is per-user; Supabase warns that caching responses with auth cookies can leak sessions across users.

**Row-level security on every table.** Users can only read and write their own rows. Subscription status can only be written by the webhook using the server-only secret key.

**Stripe webhook is verified, idempotent, and order-independent.** Signature checked on every request; processed event IDs stored to skip duplicates; the latest subscription is re-fetched from Stripe instead of trusting event order.
