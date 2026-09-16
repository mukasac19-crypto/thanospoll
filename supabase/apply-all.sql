-- ============================================================================
--  Was Thanos Right? — full schema, all migrations in order.
--
--  Convenience bundle for the Supabase SQL editor. Paste the whole thing into
--  a new query and hit Run. Every statement is idempotent (create ... if not
--  exists / create or replace / add column if not exists), so it is safe to run
--  on a fresh project, a partly-migrated one, or twice by accident.
--
--  Generated from supabase/migrations/. If you change a migration, regenerate
--  rather than editing this file. It deliberately lives outside migrations/ so
--  the Supabase CLI never treats it as a migration of its own.
-- ============================================================================


-- --------------------------------------------------------------------------
-- 0001_init.sql
-- --------------------------------------------------------------------------

-- Was Thanos Right? — results schema.
--
-- Run with `supabase db push`, or paste into the SQL editor of a new project.
-- Safe to re-run.
--
-- Design note: every read this app performs is an aggregate — two GROUP BYs and
-- a self-join. PostgREST cannot express any of those, so they live here as
-- functions and the app calls them over rpc(). That keeps the counting in the
-- database instead of shipping every answer row to Node to be folded.

-- ---------------------------------------------------------------- tables --

create table if not exists public.answers (
  session_id text        not null,
  qid        text        not null,
  choice     text        not null check (choice in ('yes', 'no')),
  position   integer     not null,
  created_at timestamptz not null default now(),
  primary key (session_id, qid)
);

create table if not exists public.sessions (
  id         text primary key,
  branch     text,
  archetype  text,
  coherence  integer,
  created_at timestamptz not null default now()
);

create index if not exists answers_qid_idx on public.answers (qid);
create index if not exists sessions_archetype_idx on public.sessions (archetype);

-- ------------------------------------------------------------------ rls --

-- Enabled with no policies, deliberately. Nothing reaches these tables with the
-- anon key: writes come from the server using the service role, which bypasses
-- RLS, and reads go through the aggregate functions below. A poll where anyone
-- holding the public key can enumerate or edit individual responses is not a
-- poll, so there is no policy to add here.

alter table public.answers  enable row level security;
alter table public.sessions enable row level security;

-- ------------------------------------------------------- aggregate reads --

create or replace function public.poll_tallies()
returns table (qid text, choice text, n integer)
language sql
stable
security definer
set search_path = public
as $$
  select a.qid, a.choice, count(*)::integer
  from public.answers a
  group by a.qid, a.choice;
$$;

create or replace function public.poll_archetypes()
returns table (archetype text, n integer)
language sql
stable
security definer
set search_path = public
as $$
  select s.archetype, count(*)::integer
  from public.sessions s
  where s.archetype is not null
  group by s.archetype;
$$;

create or replace function public.poll_completed_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer from public.sessions;
$$;

-- Joint distribution of two items across sessions that answered both.
create or replace function public.poll_cross_tab(item_a text, item_b text)
returns table (ca text, cb text, n integer)
language sql
stable
security definer
set search_path = public
as $$
  select x.choice, y.choice, count(*)::integer
  from public.answers x
  join public.answers y on x.session_id = y.session_id
  where x.qid = item_a and y.qid = item_b
  group by x.choice, y.choice;
$$;

-- ----------------------------------------------------------------- grants --

-- These functions are security definer, so grants are the only thing standing
-- between the anon key and the data. They return counts only — never a
-- session id, never an individual response — so exposing them to anon is a
-- deliberate choice that makes the results page publicly readable and leaves
-- room for a client-side live dashboard later.

revoke all on function public.poll_tallies()                from public;
revoke all on function public.poll_archetypes()             from public;
revoke all on function public.poll_completed_count()        from public;
revoke all on function public.poll_cross_tab(text, text)    from public;

grant execute on function public.poll_tallies()             to anon, authenticated, service_role;
grant execute on function public.poll_archetypes()          to anon, authenticated, service_role;
grant execute on function public.poll_completed_count()     to anon, authenticated, service_role;
grant execute on function public.poll_cross_tab(text, text) to anon, authenticated, service_role;


-- --------------------------------------------------------------------------
-- 0002_multi_choice.sql
-- --------------------------------------------------------------------------

-- Multi-choice answers, and a session shape that matches the new results.
--
-- The bank moved from ten yes/no items to ten items where three carry four
-- options each. Answers now store a choice id ("keep", "absolutely_not",
-- "sign"), so the old two-value constraint has to go. Everything else about the
-- schema already worked unchanged, which was the point of storing the answer as
-- text in the first place.
--
-- Safe to re-run. Safe to run immediately after 0001 on a fresh project.

-- Choice ids are validated in the application against the question they belong
-- to, which a table constraint cannot do — it would have to know that "keep" is
-- legal for gauntlet_day and nonsense for press.
alter table public.answers
  drop constraint if exists answers_choice_check;

-- Branching is gone, so there is no branch to record. Coherence was a score for
-- the old analytical bank; chaos replaces it and drives the Chaos Agent result.
alter table public.sessions drop column if exists branch;
alter table public.sessions drop column if exists coherence;
alter table public.sessions add column if not exists chaos integer;

-- The aggregate functions are unchanged: they always grouped on choice as text
-- and never assumed how many distinct values it could take.


-- --------------------------------------------------------------------------
-- 0003_visitors.sql
-- --------------------------------------------------------------------------

-- Visitor analytics.
--
-- What is deliberately NOT stored: no IP address, no raw user agent, no
-- fingerprint. The visitor id is a random opaque string minted server-side and
-- kept in an httpOnly cookie — it is not derived from anything about the
-- person, so it identifies a browser that consented, and nothing else.
--
-- Device and browser are coarse buckets ("mobile", "Safari") rather than the
-- full UA string, because the full string is a fingerprint and the bucket is
-- what anyone actually reads.
--
-- Safe to re-run.

create table if not exists public.visitors (
  id             text primary key,
  first_seen     timestamptz not null default now(),
  last_seen      timestamptz not null default now(),
  visits         integer     not null default 0,
  -- Where they came from the very first time. Origin only, never the full URL,
  -- which can carry search terms and other personal data in its query string.
  first_referrer text,
  device         text,
  browser        text,
  country        text
);

create table if not exists public.visits (
  id          bigserial primary key,
  visitor_id  text not null references public.visitors (id) on delete cascade,
  path        text not null,
  referrer    text,
  created_at  timestamptz not null default now()
);

create index if not exists visits_visitor_idx on public.visits (visitor_id);
create index if not exists visits_created_idx on public.visits (created_at);

-- Ties a finished run back to the browser that produced it, so the funnel
-- (visited → started → finished) can be measured. Nullable on purpose: a run
-- from someone who declined the cookie still counts as a run.
alter table public.sessions add column if not exists visitor_id text;

alter table public.visitors enable row level security;
alter table public.visits   enable row level security;

-- One call, one round trip, and the visit counter increments atomically —
-- PostgREST cannot express "upsert and increment" through the table API.
create or replace function public.record_visit(
  p_visitor_id text,
  p_path       text,
  p_referrer   text,
  p_device     text,
  p_browser    text,
  p_country    text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.visitors (id, first_referrer, device, browser, country, visits)
  values (p_visitor_id, p_referrer, p_device, p_browser, p_country, 1)
  on conflict (id) do update
    set last_seen = now(),
        visits    = public.visitors.visits + 1,
        -- Only ever filled in, never overwritten: the first referrer is the
        -- interesting one and later visits are usually direct.
        device    = coalesce(public.visitors.device, excluded.device),
        browser   = coalesce(public.visitors.browser, excluded.browser),
        country   = coalesce(public.visitors.country, excluded.country);

  insert into public.visits (visitor_id, path, referrer)
  values (p_visitor_id, p_path, p_referrer);
end;
$$;

create or replace function public.poll_visitor_stats()
returns table (
  visitors  integer,
  visits    integer,
  returning_visitors integer,
  completed integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*)::integer from public.visitors),
    (select coalesce(sum(v.visits), 0)::integer from public.visitors v),
    (select count(*)::integer from public.visitors where visits > 1),
    (select count(*)::integer from public.sessions);
$$;

-- Writes and analytics reads are server-only. Unlike the poll_* aggregates,
-- these are not granted to anon: how many people visited is the operator's
-- business, not a public number, and record_visit must never be callable with
-- the publishable key.
revoke all on function public.record_visit(text, text, text, text, text, text) from public;
revoke all on function public.poll_visitor_stats() from public;

grant execute on function public.record_visit(text, text, text, text, text, text) to service_role;
grant execute on function public.poll_visitor_stats() to service_role;


-- --------------------------------------------------------------------------
-- 0004_support.sql
-- --------------------------------------------------------------------------

-- Did this run's player follow the support link?
--
-- One nullable column rather than an events table. True means they followed the
-- link; anything else means they did not. The rate that matters is clicks over
-- finished runs, and tracking "was shown" as its own state would cost an extra
-- write on every completion to sharpen a number that only has to answer
-- "is the ask working".
--
-- Safe to re-run.

alter table public.sessions add column if not exists supported boolean;

create index if not exists sessions_supported_idx
  on public.sessions (supported)
  where supported is not null;

create or replace function public.poll_support_rate()
returns table (supported integer, completed integer)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(*) filter (where supported)::integer,
    count(*)::integer
  from public.sessions;
$$;

revoke all on function public.poll_support_rate() from public;
grant execute on function public.poll_support_rate() to service_role;


-- --------------------------------------------------------------------------
-- 0005_support_amount.sql
-- --------------------------------------------------------------------------

-- Which price point was clicked.
--
-- A click is not a purchase — Patreon confirms the sale, not us — but it is the
-- last thing measurable from inside the poll, and it is what decides which of
-- the price points are worth keeping. Null on a custom-amount or single-link
-- click, where there is no fixed figure to record.
--
-- Safe to re-run.

alter table public.sessions add column if not exists support_amount numeric;

create or replace function public.poll_support_amounts()
returns table (amount numeric, clicks integer)
language sql
stable
security definer
set search_path = public
as $$
  select support_amount, count(*)::integer
  from public.sessions
  where supported and support_amount is not null
  group by support_amount
  order by support_amount;
$$;

revoke all on function public.poll_support_amounts() from public;
grant execute on function public.poll_support_amounts() to service_role;
