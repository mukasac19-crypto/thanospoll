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
