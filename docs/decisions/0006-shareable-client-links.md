# 0006 — Shareable links for measurements and workout check-ins (no account needed)

- Date: 2026-09-12
- Status: accepted (2026-09-12: one durable link per client; front-view diagram only, no back measurements; coach picks the requested measurements per request)

## Context
Clients only get body measurements into Theryn by installing the app and typing them in. Many clients, especially name-only ones (decision 0005 follow-up), will never install it. The coach wants to send a link over WhatsApp or any app that opens a single page in the browser where the client enters measurements, or ticks off today's workout, and the result lands in the coach's dashboard.

## Decision (proposed)

### One durable link per client, not one link per form
Each client gets a single private URL, `https://theryn.fit/f/<token>`, that the coach shares once. Opening it shows two tabs: **Today's workout** (today's day from the client's current plan) and **Body measurements**. The client can pin the chat message and reuse the link every day. The coach can also share a link that lands on a specific tab.

Why not a link per day or per request: the client would need a new message every time, the coach would have to remember to send it, and old links would pile up. One link that always shows "today" is what clients will actually keep.

### Data model
```
client_links
  id, coach_id, athlete_id (nullable), manual_client_id (nullable),   -- exactly one set
  token_hash TEXT UNIQUE,        -- sha256 of the random token; raw token never stored
  label TEXT,                    -- "Priya's link"
  opens INT, last_opened_at, submissions INT,
  revoked_at, created_at

client_submissions               -- append-only inbox and audit trail
  id, link_id, coach_id, athlete_id, manual_client_id,
  kind TEXT CHECK (kind IN ('measurements','workout')),
  payload JSONB,                 -- measurements: { unit, weight, chest, waist, ... }
                                 -- workout: { date, day, type, exercises:[{name, sets_done, weight_used}], note }
  submitted_at, ip_hash, user_agent
```
Both tables have RLS: the coach reads and manages their own rows. The anon role has **no table access at all**.

### Access path: two RPCs, callable with the anon key
- `link_view(p_token)` → validates the token hash, not revoked; returns the minimum the page needs: client first name, unit system, today's plan day, and which tabs are enabled. Increments `opens`.
- `link_submit(p_token, p_kind, p_payload)` → validates token, validates payload ranges (weight 20–400 kg, measurements 10–200 cm, max 30 exercises), inserts into `client_submissions`, then **promotes** the data so the existing dashboard works unchanged:
  - app client, measurements → insert into `body_measurements` and `body_weights` for that user (with a new `source = 'link'` column)
  - app client, workout → insert a `workout_sessions` row with `workout_sets`, so Last workout, This week, streak and insights all update
  - name-only client → the coach's Body/Plan tabs read from `client_submissions`; on "Connect to account" the rows are promoted the same way

Both are `SECURITY DEFINER` with `SET search_path = public, pg_temp`, `REVOKE FROM PUBLIC`, `GRANT EXECUTE TO anon, authenticated`. They never accept a user id from the client; the token is the only input that selects data.

RPCs rather than an Edge Function because the project already runs on RPCs, there is nothing to deploy, and no cold start. If abuse appears, the same two calls move behind an Edge Function with rate limiting without changing the page.

### Token
32 random bytes, base64url, generated client-side by the coach's app; only the SHA-256 goes to the database. (Amended 2026-09-18: the raw token is also kept in the coach-only `client_links.label` column as `tok:<token>`, so the coach can copy the link from any device. `link_view`/`link_submit` still match on the hash, and anon still has no table access.) The URL carries the raw token in the path (`/f/<token>`), never a name or id. A leaked link is a bearer credential: the coach can **Regenerate** (new token, old one dead) or **Turn off** from the client page. Links do not expire on their own; measurement submissions are capped at 5 per day per link, workout submissions at 3.

### Public page
- Served by the existing SPA (`vercel.json` already rewrites all paths). `main.jsx` routes `/f/:token` to a lazy, auth-free bundle before the main app loads, the same way `?coachPreview=1` works today. Nothing from the coach or athlete app is loaded.
- Mobile-first, works in any browser and inside the WhatsApp in-app browser.
- **Body measurements tab:** front body figure (inline SVG, the drawing from `mockups/share-links/`) with callout labels on chest, waist, hips, arm, thigh. No back view. Only the measurements the coach asked for are marked required; body weight is always optional. Tapping a region highlights it and focuses its field. Unit toggle (in/cm, lb/kg) defaulting to the client's unit. Weight field. Save sends everything; a plain "Sent to <Coach name>" confirmation.
- **Today's workout tab:** the day's type and exercises with sets, reps and the coach's target weight, one checkbox per set (tap to tick), an optional "weight I used" per exercise, a note field, and **Mark complete**. Rest days say so and show the next training day.
- Shows the client's first name and the coach's name so they know it's theirs. No history is shown (a bearer of the link should not see past data). Footer: "Want your plan on your phone? Get the app" — a nudge, never a block.
- Link preview (Open Graph) is generic: "Your coach sent you a form from Theryn". No name in the preview.

### Coach side
- Client page header gains **Share link** (both client types). Sheet shows the URL, **Copy**, **WhatsApp** (`https://wa.me/?text=…`, works on web and native), **Share** (Web Share API on web, Capacitor Share on native), Regenerate, Turn off. Default message: "Hi Priya, here's your Theryn link. Open it on training days to tick off your workout, and use the Body tab when I ask for measurements: <url>".
- Body tab shows measurements with a "via link" tag; Plan tab shows "Completed via link" on the day; Clients table Last workout and This week work for name-only clients once they submit.
- Optional: an `AFTER INSERT` trigger on `client_submissions` enqueues a push through the existing outbox ("Priya sent her measurements"), reusing the notification pipeline.

## Consequences
- Name-only clients become genuinely useful: plan out, completion and measurements back, no install.
- Same link works for app clients as a lighter option; their app still shows the data because it is promoted into the real tables.
- New attack surface: two anon-callable functions. Mitigated by hashed tokens, strict payload validation, per-link caps, and no user-id inputs. Must be included in the database hardening review (roadmap 0.6).
- Bearer links over WhatsApp are a privacy trade-off. The link submits data, it does not expose it, which is the acceptable direction.
- Effort: measurements link about 2 days, workout link about 2 days, coach share sheet and dashboard changes about 1 day. Build in that order.
