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
