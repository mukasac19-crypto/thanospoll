# Was Thanos Right?

A ten-question poll about the snap. Some of the questions are serious, three of
them are absolutely not, and a few are opposites of each other — answer both one
way and the result quotes you back to yourself.

The headline split is not the point. The gaps are.

## Running it

```bash
npm run dev
```

No database setup to start. With no environment variables set, results go to
`.data/thanos.db` via `node:sqlite` — built into Node 22+, no native compile, no
service — and are still genuinely shared across everyone hitting that server.

Requires Node 22 or later.

## Supabase

Production runs on Supabase. Two steps.

**1. Create the schema.** From a linked project:

```bash
supabase db push
```

Or paste `supabase/migrations/` into the SQL editor in order — `0001_init.sql`,
`0002_multi_choice.sql`, `0003_visitors.sql`, then `0004_support.sql`. All are
safe to re-run. Unlike the other drivers,
the Supabase driver does not create its own schema: the migrations are the
source of truth, because they also define the RLS posture and the aggregate
functions.

**2. Set two variables** in `.env.local`, from Project Settings → API:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

That is the whole switch. The driver is chosen at runtime and nothing above
`lib/db/` knows which one is running.

`SUPABASE_SERVICE_ROLE_KEY` is a secret: it bypasses row level security. Never
prefix it with `NEXT_PUBLIC_` and never touch it from a client component. Every
call site is a server action or a server component, and `lib/db/index.ts` is
marked `server-only` so a client import fails the build rather than shipping the
key. Passing an anon or publishable key by mistake is caught at startup with a
message that says so, instead of every write silently failing under RLS.

### Why the SQL functions exist

Every read this app performs is an aggregate: `tallies` and `archetypes` are
`GROUP BY`s, and `crossTab` is a self-join. PostgREST cannot express any of
them, so a plain table-API driver would have to fetch every answer row into Node
and fold it there — fine at ten responses, not at ten thousand. The four
`poll_*` functions in the migration keep the counting in Postgres and the driver
calls them over `rpc()`.

They needed no changes when questions grew from two options to four: they always
grouped on `choice` as text and never assumed how many distinct values it could
take.

### The RLS posture

Both tables have row level security enabled with **no policies**, deliberately.
Nothing reaches them with the anon key: writes come from the server under the
service role, which bypasses RLS, and reads go through the `poll_*` functions.
A poll where anyone holding the public key can enumerate or edit individual
responses is not a poll.

The functions are `security definer` and granted to `anon`, which is the one
deliberate opening: they return counts only — never a session id, never an
individual response — so the results are publicly readable and a client-side
live dashboard stays possible later.

### Other Postgres

Set `DATABASE_URL` instead and the raw Postgres driver takes over, creating its
own schema. It exists as the escape hatch so the app is not locked to one host,
and it detects Supabase's transaction pooler (port 6543) to disable prepared
statements automatically. For a Supabase project the Supabase driver is the
better path — no connection string, no pooler tuning.

Driver precedence: Supabase pair → `DATABASE_URL` → SQLite.

## How it is put together

| Path | What it does |
| --- | --- |
| `lib/questions.ts` | The ten items, in order, with their choices and the aftermath revealed after answering. |
| `lib/engine.ts` | Order and progress. Linear — no branching, no shuffling. |
| `lib/scoring.ts` | Archetypes and receipts. The actual product. |
| `lib/pairs.ts` | The cross-tabs featured on the results page. |
| `lib/db/` | One `Store` interface, three drivers (`supabase`, `postgres`, `sqlite`), chosen by environment. |
| `supabase/migrations/` | Schema, RLS, and the aggregate functions the Supabase driver calls. |
| `lib/support.ts` | The Patreon ask: URL validation and whether to show it. |
| `lib/visitor.ts` | Cookie names and the header parsing. Pure, so it is tested. |
| `lib/analytics.ts` | Consent and visit recording. Nothing happens without opt-in. |
| `lib/stones.ts` | Which stone belongs to which question. |
| `lib/effects.ts` | Seven canvas effects, one per stone plus all six. No dependencies. |
| `tests/` | Motion and mapping tests. `npm test`. |

### Choices are objects, not yes/no

```ts
type Choice = { id: string; label: string; emoji?: string };
type Question = { id: string; text: string; choices: Choice[]; scored: boolean };
```

A binary question is just a question with two choices. Nothing in the engine,
the store, the tallies or the results page treats it specially — which is what
lets a four-option joke item share every query, index and aggregate with the
analytical ones. An answer is stored as a choice id string, so `"yes"` and
`"keep"` sit in the same column.

The one thing this costs: a database `CHECK (choice IN ('yes','no'))` is no
longer possible, because validity depends on the question — `"keep"` is legal
for the Gauntlet item and nonsense for the Snap button. That check moved into
`isValidChoice()`, enforced in the server action before any write.

### Order

Fixed and deliberate. The unscored jokes sit at 3, 6 and 9, so the analytical
spine never runs more than two items without a laugh. The two questions that
catch people out — *would you press it* and *what if it might be you* — sit back
to back at 7 and 8, so the second lands while the first is still fresh.

### Why the crowd is hidden until the end

There is no per-question reveal. You answer, the card disintegrates, the next
one is already there — one tap per question, ten taps total.

This is not only about pace. Showing a live split after each item primes the
next one, and the item most worth protecting is the flinch: *would you press it*
at 7, then *what if it might be you* at 8. Telling someone that 73% would press
the button, immediately before asking whether they'd accept a coin flip on their
own life, contaminates the exact measurement the poll exists to take.

It was also expensive. Returning a tally per answer meant a full `GROUP BY` over
the answers table on every tap — ten aggregate queries per session, to draw a bar
that was corrupting the data. `finishRun` now returns the verdict and every
tally in one round trip, and the comparison renders once, on the result screen,
where it cannot influence anything.

### Scoring

Five archetypes, resolved first-match-wins, so the order is the design. **The
Hypocrite is tested before The Thanos** because they share two answers and
differ only on the last one — and when both fit, the funnier read is the true
one. The Chaos Agent is scored separately from the moral questions entirely: it
comes from the three joke items, on the theory that someone who wants to keep
the glove was never here for the dilemma.

Receipts quote the player's own answers back at them. They come in two tones,
`gotcha` and `respect`, because a poll that only ever catches you out gets tiring
by the third share.

### The stones

Answering does not play one animation. Each question owns an Infinity Stone,
and that one choice drives three things at once: the card's edge glows in its
stone, answering fires that stone's effect, and that stone ignites in the
Gauntlet. The meter fills for a reason rather than by arithmetic.

The mapping is built so the sixth stone lands on *would you press the Snap
button yourself* — the Gauntlet completes on the question that asks you to use
it — and the question straight after, where it might be you, fires all six.

| Stone | Behaviour |
| --- | --- |
| Power | Detonation. Everything leaves at once, outward, with a shockwave. |
| Space | Collapse. Outer pixels go first and the card spirals into a point. |
| Reality | A wave passes left to right and the card is something else behind it. |
| Soul | No violence. Wisps rise, brightening before they go. |
| Time | Out, then back. The card un-happens and returns to where it started. |
| Mind | A flash of certainty, then splinters. |
| Gauntlet | All six, closest to the film's dust, saved for the flinch. |

Every effect still samples real text geometry rather than screenshotting the
DOM. `Range.getClientRects()` returns the line boxes of every text node, so
particles land dense on glyphs and sparse across empty card, and the words
genuinely come apart. Colour comes from each node's computed `color`, pulled
toward the stone, so it stays correct if the palette changes. Roughly 4,000
particles, capped, at a device pixel ratio of at most 2. `prefers-reduced-motion`
skips it entirely.

Bursts are kept separate rather than pooled, because each carries its own
profile and duration — a Soul drift lasts almost twice as long as a Mind
splinter, and they have to be able to overlap.

This is deliberately not WebGL. A Three.js version costs several hundred
kilobytes and looks worse, because it cannot keep crisp DOM text underneath.

### Testing the part you cannot see

```bash
npm test
```

Canvas animation runs on `requestAnimationFrame`, which fires **zero** times in
a hidden or backgrounded tab. That makes the effects invisible to automated
browser checks — a headless run cannot tell a working Space implosion from a
canvas that never painted.

The motion is pure maths, though, so `EFFECT_PROFILES` is exported and stepped
directly: Power increases distance from centre, Space decreases it and shrinks
particles, Time peaks mid-life and returns to its origin, Soul drifts upward and
brightens before fading, Reality's delay tracks x position so it sweeps. The
mapping is asserted too — all six stones used, the set completing exactly on
`press`, and the all-six effect reserved for `fifty`.

## The support ask

Between the last answer and the result, the poll asks for a Patreon backing.
Set the link and it appears; leave it unset and the step does not exist:

```
NEXT_PUBLIC_PATREON_URL=https://www.patreon.com/your-page
```

The value is validated rather than trusted. It must be an `https` URL on
`patreon.com` or `www.patreon.com`; anything else — a typo, `http`, a lookalike
domain like `patreon.com.evil.example` — is treated as *unset*, so a bad
variable means no ask rather than sending everyone who finishes the poll
somewhere unexpected.

### Why it is an interstitial and not a gate

This is the highest-friction moment in the app. Someone has answered ten
questions and is waiting for the thing they earned, which is exactly why it is
the moment of peak attention and exactly why it is easy to get wrong. The line
between fine and not-fine is narrow, so the rules are explicit:

- The result is **never** withheld. "See my result" is a full-width button, not
  a grey link tucked under the ask.
- "No paywall. Your result is right there either way." is stated on the card.
- Following the link opens a new tab **and** advances to the result, so
  supporting costs nothing.
- Anyone who has followed the link is never asked again.

`finishRun` fires when the ask appears rather than after it, so the tallies are
already loaded by the time someone continues. The ask costs a tap, never a
spinner — verified: the result renders complete within 250ms of continuing.

If the ask ever turns out to cost completions, the honest fix is to move it
after the result rather than to make it harder to dismiss.

### Measuring it

`sessions.supported` is true for a run whose player followed the link, and null
for one that never saw the ask.

```sql
select
  count(*) filter (where supported)          as supporters,
  count(*)                                   as finished,
  round(100.0 * count(*) filter (where supported) / nullif(count(*), 0), 1) as pct
from sessions;
```

## Visitors

Analytics is opt-in. A banner asks once; nothing is written until someone
answers **Allow**, and answering **No thanks** deletes the identifier.

An analytics cookie is not "strictly necessary" for a poll to work, so under
GDPR/ePrivacy it needs consent *before* it is set. A banner shown while the
cookie already exists is not consent, it is an announcement.

### What is stored

| Field | Value | Why it is safe |
| --- | --- | --- |
| Visitor id | random 21-char string | Minted server-side by nanoid. Not derived from anything about the person, so it is not a fingerprint. |
| Path and time | `/play`, a timestamp | Page views. |
| Referrer | **origin only** | A full referrer URL can carry search terms and tokens in its query string. Only the origin is kept. |
| Device | `mobile` / `tablet` / `desktop` | A bucket. The raw user agent is a fingerprint and is discarded. |
| Browser | `Safari`, `Chrome` | Same reasoning. |
| Country | two letters, from the CDN header | **The IP address is never stored**, and never used to derive anything else. |

The cookie is first-party, `httpOnly`, `sameSite=lax`, `secure` in production,
and lasts a year so "returning visitor" means something. `httpOnly` matters:
nothing on the client needs to read the id, so no script can. The consent cookie
is deliberately *not* `httpOnly`, because the banner reads it to know whether to
appear — which also keeps the landing page statically generated instead of
forcing every route dynamic.

`DNT: 1` and `Sec-GPC: 1` are honoured even over an explicit yes. A browser-level
opt-out is a standing instruction and it costs nothing to respect.

There are no third-party scripts, no ad networks, and nothing leaves the
database.

### What it can and cannot tell you

It answers *how many, from where, and do they finish* — new versus returning,
arrival source, and the visited → started → finished funnel, since a completed
run is stamped with the visitor id.

It cannot tell you who anyone is. Nothing collected here identifies a person,
by design. A run from someone who declined still counts as a run; it is simply
not linked to a visitor.

### Reading it

The tables are `visitors`, `visits` and `sessions.visitor_id`. There is no
admin page on purpose — an unauthenticated analytics route is a data leak — so
use the Supabase SQL editor:

```sql
-- Traffic and the funnel
select
  (select count(*) from visitors)                    as visitors,
  (select coalesce(sum(visits), 0) from visitors)    as visits,
  (select count(*) from visitors where visits > 1)   as returning,
  (select count(*) from sessions)                    as finished;

-- Where people arrive from
select coalesce(first_referrer, 'direct') as source, count(*)
from visitors group by 1 order by 2 desc;

-- Where they give up: the last question each unfinished run reached
select qid, count(*) as stopped_here
from answers a
where position = (select max(position) from answers b where b.session_id = a.session_id)
  and a.session_id not in (select id from sessions)
group by qid order by 2 desc;
```

### Retention

Nothing expires on its own. Keeping raw `visits` rows forever is hard to justify
under data-minimisation, so trim them on whatever window suits you:

```sql
delete from visits where created_at < now() - interval '12 months';
```

## Data

Answers are written per item rather than batched at the end, so someone who
abandons halfway still counts — dropout is data. A run is identified by a
generated id held in `localStorage`; nothing personal is collected, and there is
no account, cookie, or third-party analytics.

To reset local results, stop the dev server and delete `.data/`. To reset
Supabase results, `truncate public.answers, public.sessions;` in the SQL editor.
#   t h a n o s p o l l  
 