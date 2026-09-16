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
