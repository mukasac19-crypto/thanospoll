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
